import {beforeEach, describe, expect, it, jest} from '@jest/globals'

// Mock expo/fetch so we can observe the request the chat client builds.
const mockExpoFetch = jest.fn()
jest.mock('expo/fetch', () => ({fetch: mockExpoFetch}))

// Keep the test off the real logger/transport graph.
jest.mock('#/logger', () => ({logger: {error: jest.fn(), warn: jest.fn()}}))

// Stable endpoint/agent so we don't pull in #/lib/constants.
jest.mock('../config', () => ({
  CHAT_ENDPOINT: 'https://runtime.test/app/chat',
  AGENT_RUNTIME_BASE_URL: 'https://runtime.test',
  DEFAULT_AGENT: 'ada',
}))

// SINGLE-LOGIN: setSupabaseTokenProvider is a no-op, so mock the token reader
// itself (same pattern as agentsClient.test.ts).
jest.mock('../authToken', () => ({getSupabaseAccessToken: jest.fn()}))

import {getSupabaseAccessToken} from '../authToken'
import {
  SIGNED_OUT_MESSAGE,
  streamChat,
  type StreamHandlers,
  TOKEN_REJECTED_MESSAGE,
} from '../chatClient'
import {type ApprovalAction, type ChatTurnResult} from '../types'

const mockToken = jest.mocked(getSupabaseAccessToken)

/** A Response whose body streams `text` as UTF-8 bytes (SSE path). */
function sseResponse(text: string) {
  const bytes = new TextEncoder().encode(text)
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(bytes)
      controller.close()
    },
  })
  return {
    status: 200,
    ok: true,
    headers: {get: () => 'text/event-stream'},
    body,
  }
}

/** A Response that returns a JSON turn result (non-streaming path). */
function jsonResponse(obj: unknown) {
  return {
    status: 200,
    ok: true,
    headers: {get: () => 'application/json'},
    json: () => Promise.resolve(obj),
  }
}

/**
 * Run a turn, mirroring useAgentChat: accumulate deltas, then prefer the
 * authoritative `done.message`. Reports the final bubble text + captured actions.
 */
function runStreamingTurn(): Promise<{
  text: string
  deltas: string[]
  actions: ApprovalAction[]
  result?: ChatTurnResult
}> {
  mockToken.mockResolvedValue('TOKEN_ABC')
  return new Promise(resolve => {
    let acc = ''
    const deltas: string[] = []
    let actions: ApprovalAction[] = []
    const handlers: StreamHandlers = {
      onTextDelta: d => {
        deltas.push(d)
        acc += d
      },
      onActions: a => {
        actions = a
      },
      onDone: result => {
        const text = result?.message || acc
        resolve({text, deltas, actions, result})
      },
      onError: message => resolve({text: `ERR:${message}`, deltas, actions}),
    }
    streamChat({text: 'hi', agent: 'ada'}, handlers)
  })
}

/** Drive a single turn to completion and report how it settled. */
function runTurn(
  token: string | null,
): Promise<{kind: 'error'; message: string} | {kind: 'done'}> {
  mockToken.mockResolvedValue(token)
  return new Promise(resolve => {
    streamChat(
      {text: 'hi', agent: 'ada'},
      {
        onTextDelta: () => {},
        onDone: () => resolve({kind: 'done'}),
        onError: message => resolve({kind: 'error', message}),
      },
    )
  })
}

describe('streamChat auth/bearer wiring', () => {
  beforeEach(() => {
    mockExpoFetch.mockReset()
  })

  it('attaches the Supabase access token as `Authorization: Bearer`', async () => {
    // body:null short-circuits stream consumption; we only assert the request.
    mockExpoFetch.mockResolvedValue({
      status: 200,
      ok: true,
      body: null,
    } as never)

    await runTurn('TOKEN_ABC')

    expect(mockExpoFetch).toHaveBeenCalledTimes(1)
    const [, init] = mockExpoFetch.mock.calls[0] as [string, RequestInit]
    expect((init.headers as Record<string, string>).Authorization).toBe(
      'Bearer TOKEN_ABC',
    )
  })

  it('sends `agent` only when the caller picked one (E6 selector back-compat)', async () => {
    mockExpoFetch.mockResolvedValue({
      status: 200,
      ok: true,
      body: null,
    } as never)
    mockToken.mockResolvedValue('TOKEN_ABC')

    // Explicit selection rides the body.
    await new Promise(resolve => {
      streamChat(
        {text: 'hi', agent: 'bull.pds.test'},
        {onTextDelta: () => {}, onDone: resolve, onError: resolve},
      )
    })
    let [, init] = mockExpoFetch.mock.calls[0] as [string, RequestInit]
    let body = JSON.parse(init.body as string) as Record<string, unknown>
    expect(body.agent).toBe('bull.pds.test')

    // No selection -> the field is ABSENT, so the runtime routes to the owner's
    // primary agent instead of a hardcoded default handle.
    await new Promise(resolve => {
      streamChat(
        {text: 'hi'},
        {onTextDelta: () => {}, onDone: resolve, onError: resolve},
      )
    })
    ;[, init] = mockExpoFetch.mock.calls[1] as [string, RequestInit]
    body = JSON.parse(init.body as string) as Record<string, unknown>
    expect('agent' in body).toBe(false)
  })

  it('does not call the runtime when signed out, and asks the user to sign in', async () => {
    const result = await runTurn(null)

    expect(mockExpoFetch).not.toHaveBeenCalled()
    expect(result).toEqual({kind: 'error', message: SIGNED_OUT_MESSAGE})
  })

  it('reports a token rejection (not the old "not wired" text) on 401', async () => {
    mockExpoFetch.mockResolvedValue({
      status: 401,
      ok: false,
      body: null,
    } as never)

    const result = await runTurn('TOKEN_ABC')

    expect(result).toEqual({kind: 'error', message: TOKEN_REJECTED_MESSAGE})
    if (result.kind === 'error') {
      expect(result.message).not.toMatch(/not wired/i)
      expect(result.message).not.toMatch(/TODO/i)
    }
  })
})

describe('streamChat parses the runtime SSE/JSON shapes', () => {
  beforeEach(() => {
    mockExpoFetch.mockReset()
  })

  it('accumulates `chunk` deltas and uses the authoritative `done.message`', async () => {
    // The exact shape from APP-CHANNEL.md: event name on the `event:` line, bare
    // `{delta}` / `{message,...}` data (NO `type` discriminator).
    const sse =
      'event: chunk\n' +
      'data: {"delta":"First sentence. "}\n' +
      '\n' +
      'event: chunk\n' +
      'data: {"delta":"Second sentence."}\n' +
      '\n' +
      'event: done\n' +
      'data: {"message":"First sentence. Second sentence.","status":"answered","pending":[],"mediaUrls":[]}\n' +
      '\n'
    mockExpoFetch.mockResolvedValue(sseResponse(sse) as never)

    const out = await runStreamingTurn()

    // Deltas streamed into the bubble (the empty-bubble bug = these never fired).
    expect(out.deltas).toEqual(['First sentence. ', 'Second sentence.'])
    // Final bubble text equals the concatenation AND the authoritative done.message.
    expect(out.text).toBe('First sentence. Second sentence.')
    expect(out.result?.status).toBe('answered')
  })

  it('surfaces `pending` as approval actions on done', async () => {
    const sse =
      'event: chunk\n' +
      'data: {"delta":"I drafted that email. "}\n' +
      '\n' +
      'event: done\n' +
      'data: {"message":"I drafted that email.","status":"drafted","pending":[{"id":"act_1","kind":"email.send","summary":"Send email to Beau","label":"Send","ref":"draft_9"}],"mediaUrls":[]}\n' +
      '\n'
    mockExpoFetch.mockResolvedValue(sseResponse(sse) as never)

    const out = await runStreamingTurn()

    expect(out.text).toBe('I drafted that email.')
    expect(out.actions).toHaveLength(1)
    expect(out.actions[0]).toMatchObject({
      id: 'act_1',
      kind: 'email.send',
      title: 'Send email to Beau', // summary → title
      detail: 'draft_9', // ref → detail
    })
    expect(out.result?.status).toBe('drafted')
  })

  it('handles the non-streaming JSON path ({message,...})', async () => {
    mockExpoFetch.mockResolvedValue(
      jsonResponse({
        message: 'Two plus two is four.',
        status: 'answered',
        pending: [],
        mediaUrls: [],
      }) as never,
    )

    const out = await runStreamingTurn()

    expect(out.text).toBe('Two plus two is four.')
    // The full reply is also pushed through the delta channel (for TTS).
    expect(out.deltas).toEqual(['Two plus two is four.'])
    expect(out.result?.status).toBe('answered')
  })

  it('reports a mid-stream `error` event', async () => {
    const sse = 'event: error\ndata: {"message":"model timeout"}\n\n'
    mockExpoFetch.mockResolvedValue(sseResponse(sse) as never)

    const out = await runStreamingTurn()

    expect(out.text).toBe('ERR:model timeout')
  })
})
