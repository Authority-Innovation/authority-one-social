/**
 * The knowledge-base enable/disable mutation: the row flips optimistically,
 * reverts VISIBLY when the call fails (never a silent no-op), treats the
 * server's idempotent `changed:false` response as success, and surfaces the
 * 409 'deleted' code as a thrown KnowledgeError the screen can message.
 *
 * We mock `#/lib/agent-runtime` so the test drives the cache behavior without
 * the network or the heavy client graph (same pattern as the useAgentChat
 * tests).
 */
import {beforeEach, describe, expect, it, jest} from '@jest/globals'
import {QueryClient, QueryClientProvider} from '@tanstack/react-query'
import {renderHook, waitFor} from '@testing-library/react-native'

jest.mock('#/lib/agent-runtime', () => ({
  setKnowledgeFileEnabled: jest.fn(),
  fetchKnowledgeFiles: jest.fn(),
  deleteKnowledgeFile: jest.fn(),
  uploadKnowledgeFile: jest.fn(),
}))

import {type KnowledgeFile, setKnowledgeFileEnabled} from '#/lib/agent-runtime'
import {
  createKnowledgeQueryKey,
  KnowledgeError,
  useSetKnowledgeEnabledMutation,
} from '#/state/queries/knowledgeBase'

const mockSetEnabled = setKnowledgeFileEnabled as unknown as jest.Mock

function makeFile(id: string, enabled: boolean): KnowledgeFile {
  return {
    id,
    name: `${id}.txt`,
    size: 10,
    contentType: 'text/plain',
    uploadedAt: '2026-07-01T00:00:00.000Z',
    status: 'saved',
    provisional: true,
    truncated: false,
    enabled,
    reason: null,
    artifactId: null,
  }
}

function setup(agent?: string) {
  const qc = new QueryClient({
    defaultOptions: {queries: {retry: false}, mutations: {retry: false}},
  })
  const key = createKnowledgeQueryKey(agent)
  qc.setQueryData(key, [makeFile('kf_1', true), makeFile('kf_2', false)])
  const wrapper = ({children}: {children: React.ReactNode}) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  )
  const hook = renderHook(() => useSetKnowledgeEnabledMutation(agent), {
    wrapper,
  })
  const filesInCache = () => qc.getQueryData<KnowledgeFile[]>(key)
  return {qc, hook, filesInCache}
}

describe('useSetKnowledgeEnabledMutation', () => {
  beforeEach(() => {
    mockSetEnabled.mockReset()
  })

  it('flips the row optimistically and resolves the runtime message on success', async () => {
    const {hook, filesInCache} = setup()
    let release: (v: unknown) => void = () => {}
    mockSetEnabled.mockReturnValue(
      new Promise(resolve => {
        release = resolve
      }),
    )

    const done = hook.result.current.mutateAsync({id: 'kf_1', enabled: false})
    // Optimistic: the row is off before the server answers.
    await waitFor(() =>
      expect(filesInCache()?.find(f => f.id === 'kf_1')?.enabled).toBe(false),
    )

    release({
      ok: true,
      id: 'kf_1',
      enabled: false,
      changed: true,
      name: 'kf_1.txt',
      message: 'Turned off “kf_1.txt”.',
    })
    const res = await done
    expect(res.message).toBe('Turned off “kf_1.txt”.')
    expect(mockSetEnabled).toHaveBeenCalledWith('kf_1', false, undefined)
  })

  it('treats the idempotent changed:false response as success', async () => {
    const {hook} = setup()
    mockSetEnabled.mockResolvedValue({
      ok: true,
      id: 'kf_2',
      enabled: false,
      changed: false,
      message: '“kf_2.txt” was already off.',
    } as never)
    const res = await hook.result.current.mutateAsync({
      id: 'kf_2',
      enabled: false,
    })
    expect(res.changed).toBe(false)
    expect(res.message).toBe('“kf_2.txt” was already off.')
  })

  it('reverts the optimistic flip when the call fails', async () => {
    const {hook, filesInCache} = setup()
    mockSetEnabled.mockResolvedValue({
      ok: false,
      signedOut: false,
      error: 'network error',
    } as never)

    await expect(
      hook.result.current.mutateAsync({id: 'kf_1', enabled: false}),
    ).rejects.toThrow('network error')
    // The row is back on — a failed toggle is never a silent state change.
    await waitFor(() =>
      expect(filesInCache()?.find(f => f.id === 'kf_1')?.enabled).toBe(true),
    )
  })

  it('throws a KnowledgeError carrying code deleted on the 409 path', async () => {
    const {hook} = setup()
    mockSetEnabled.mockResolvedValue({
      ok: false,
      signedOut: false,
      code: 'deleted',
      error: 'That file was deleted.',
    } as never)
    const err = await hook.result.current
      .mutateAsync({id: 'kf_1', enabled: true})
      .catch(e => e)
    expect(err).toBeInstanceOf(KnowledgeError)
    expect((err as KnowledgeError).code).toBe('deleted')
  })

  it('scopes the call and the cache key to the agent', async () => {
    const {hook, filesInCache} = setup('ada.pds.authority-one.com')
    mockSetEnabled.mockResolvedValue({
      ok: true,
      id: 'kf_1',
      enabled: false,
      changed: true,
    } as never)
    await hook.result.current.mutateAsync({id: 'kf_1', enabled: false})
    expect(mockSetEnabled).toHaveBeenCalledWith(
      'kf_1',
      false,
      'ada.pds.authority-one.com',
    )
    expect(filesInCache()?.find(f => f.id === 'kf_1')?.enabled).toBe(false)
  })
})
