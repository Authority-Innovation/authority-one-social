import {
  Agent as BaseAgent,
  type AppBskyActorProfile,
  type AtprotoServiceType,
  type AtpSessionData,
  type AtpSessionEvent,
  BskyAgent,
  type Did,
  type Un$Typed,
} from '@atproto/api'
import {TID} from '@atproto/common-web'

import {networkRetry} from '#/lib/async/retry'
import {
  BLUESKY_PROXY_HEADER,
  BSKY_SERVICE,
  IS_PROD_SERVICE,
  PUBLIC_BSKY_SERVICE,
  TIMELINE_SAVED_FEED,
} from '#/lib/constants'
import {Logger, logger} from '#/logger'
import {snoozeBirthdateUpdateAllowedForDid} from '#/state/birthdate'
import {restrictChatSettings} from '#/state/queries/messages/restrictChatSettings'
import {snoozeEmailConfirmationPrompt} from '#/state/shell/reminders'
import {
  prefetchAgeAssuranceServerData,
  setBirthdateForDid,
  setCreatedAtForDid,
} from '#/ageAssurance/data'
import {unsafeGetAndComputeAgeAssurance} from '#/ageAssurance/state'
import {features} from '#/analytics'
import {emitNetworkConfirmed, emitNetworkLost} from '../events'
import {addSessionErrorLog} from './logging'
import {
  configureModerationForAccount,
  configureModerationForGuest,
} from './moderation'
import {type SessionAccount} from './types'
import {isSessionExpired, isSignupQueued} from './util'

export type ProxyHeaderValue = `${Did}#${AtprotoServiceType}`

export function createPublicAgent() {
  configureModerationForGuest() // Side effect but only relevant for tests

  const agent = new BskyAppAgent({service: PUBLIC_BSKY_SERVICE})
  agent.configureProxy(BLUESKY_PROXY_HEADER.get())
  return agent
}

export async function createAgentAndResume(
  storedAccount: SessionAccount,
  onSessionChange: (
    agent: BskyAgent,
    did: string,
    event: AtpSessionEvent,
  ) => void,
) {
  const agent = new BskyAppAgent({service: storedAccount.service})
  if (storedAccount.pdsUrl) {
    agent.sessionManager.pdsUrl = new URL(storedAccount.pdsUrl)
  }
  const gates = features.refresh({
    strategy: 'prefer-low-latency',
  })
  const moderation = configureModerationForAccount(agent, storedAccount)
  const prevSession: AtpSessionData = sessionAccountToSession(storedAccount)
  if (isSessionExpired(storedAccount)) {
    await networkRetry(1, () => agent.resumeSession(prevSession))
  } else {
    agent.sessionManager.session = prevSession
  }

  // after session is attached
  const aa = prefetchAgeAssuranceServerData({agent})

  agent.configureProxy(BLUESKY_PROXY_HEADER.get())

  return agent.prepare({
    resolvers: [gates, moderation, aa],
    onSessionChange,
  })
}

export async function createAgentAndLogin(
  {
    service,
    identifier,
    password,
    authFactorToken,
  }: {
    service: string
    identifier: string
    password: string
    authFactorToken?: string
  },
  onSessionChange: (
    agent: BskyAgent,
    did: string,
    event: AtpSessionEvent,
  ) => void,
) {
  const agent = new BskyAppAgent({service})
  await agent.login({
    identifier,
    password,
    authFactorToken,
    allowTakendown: true,
  })

  const account = agentToSessionAccountOrThrow(agent)
  const gates = features.refresh({strategy: 'prefer-fresh-gates'})
  const moderation = configureModerationForAccount(agent, account)
  const aa = prefetchAgeAssuranceServerData({agent})

  agent.configureProxy(BLUESKY_PROXY_HEADER.get())

  return agent.prepare({
    resolvers: [gates, moderation, aa],
    onSessionChange,
  })
}

export async function createAgentAndCreateAccount(
  {
    service,
    email,
    password,
    handle,
    birthDate,
    inviteCode,
    verificationPhone,
    verificationCode,
  }: {
    service: string
    email: string
    password: string
    handle: string
    birthDate: Date
    inviteCode?: string
    verificationPhone?: string
    verificationCode?: string
  },
  onSessionChange: (
    agent: BskyAgent,
    did: string,
    event: AtpSessionEvent,
  ) => void,
) {
  const agent = new BskyAppAgent({service})
  await agent.createAccount({
    email,
    password,
    handle,
    inviteCode,
    verificationPhone,
    verificationCode,
  })
  const account = agentToSessionAccountOrThrow(agent)
  const gates = features.refresh({strategy: 'prefer-fresh-gates'})
  const moderation = configureModerationForAccount(agent, account)

  const createdAt = new Date().toISOString()
  const birthdate = birthDate.toISOString()

  /*
   * Since we have a race with account creation, profile creation, and AA
   * state, set these values locally to ensure sync reads. Values are written
   * to the server in the next step, so on subsequent reloads, the server will
   * be the source of truth.
   */
  setCreatedAtForDid({did: account.did, createdAt})
  setBirthdateForDid({did: account.did, birthdate})
  snoozeBirthdateUpdateAllowedForDid(account.did)
  // do this last
  const aa = prefetchAgeAssuranceServerData({agent})

  // Not awaited so that we can still get into onboarding.
  // This is OK because we won't let you toggle adult stuff until you set the date.
  if (IS_PROD_SERVICE(service)) {
    void Promise.allSettled([
      networkRetry(3, () => {
        return agent.setPersonalDetails({
          birthDate: birthdate,
        })
      }).catch(e => {
        logger.info(`createAgentAndCreateAccount: failed to set birthDate`)
        throw e
      }),
      networkRetry(3, () => {
        return agent.upsertProfile(prev => {
          const next: Un$Typed<AppBskyActorProfile.Record> = prev || {}
          next.displayName = handle
          next.createdAt = createdAt
          return next
        })
      }).catch(e => {
        logger.info(
          `createAgentAndCreateAccount: failed to set initial profile`,
        )
        throw e
      }),
      networkRetry(1, () => {
        // Authority One: pin only the native Following timeline. Bluesky's
        // Discover feedgen can't be served by our AppView (no getFeed).
        return agent.overwriteSavedFeeds([
          {
            ...TIMELINE_SAVED_FEED,
            id: TID.nextStr(),
          },
        ])
      }).catch(e => {
        logger.info(`createAgentAndCreateAccount: failed to set initial feeds`)
        throw e
      }),
      // wait for AA data to load first, then check state
      aa.then(() => {
        const {flags} = unsafeGetAndComputeAgeAssurance({did: account.did})
        if (flags?.chatDisabled || flags?.groupChatDisabled) {
          void restrictChatSettings({
            agent,
            restrictIncoming: flags.chatDisabled,
            restrictGroupInvites: flags.groupChatDisabled,
          })
        }
      }),
    ]).then(promises => {
      const rejected = promises.filter(p => p.status === 'rejected')
      if (rejected.length > 0) {
        logger.error(
          `session: createAgentAndCreateAccount failed to save personal details and feeds`,
        )
      }
    })
  } else {
    void Promise.allSettled([
      networkRetry(3, () => {
        return agent.setPersonalDetails({
          birthDate: birthDate.toISOString(),
        })
      }).catch(e => {
        logger.info(`createAgentAndCreateAccount: failed to set birthDate`)
        throw e
      }),
      networkRetry(3, () => {
        return agent.upsertProfile(prev => {
          const next: Un$Typed<AppBskyActorProfile.Record> = prev || {}
          next.createdAt = prev?.createdAt || new Date().toISOString()
          return next
        })
      }).catch(e => {
        logger.info(
          `createAgentAndCreateAccount: failed to set initial profile`,
        )
        throw e
      }),
    ]).then(promises => {
      const rejected = promises.filter(p => p.status === 'rejected')
      if (rejected.length > 0) {
        logger.error(
          `session: createAgentAndCreateAccount failed to save personal details and feeds`,
        )
      }
    })
  }

  try {
    // snooze first prompt after signup, defer to next prompt
    snoozeEmailConfirmationPrompt()
  } catch (e: any) {
    logger.error(e, {message: `session: failed snoozeEmailConfirmationPrompt`})
  }

  agent.configureProxy(BLUESKY_PROXY_HEADER.get())

  return agent.prepare({
    resolvers: [gates, moderation, aa],
    onSessionChange,
  })
}

export function agentToSessionAccountOrThrow(agent: BskyAgent): SessionAccount {
  const account = agentToSessionAccount(agent)
  if (!account) {
    throw Error('Expected an active session')
  }
  return account
}

export function agentToSessionAccount(
  agent: BskyAgent,
): SessionAccount | undefined {
  if (!agent.session) {
    return undefined
  }
  return {
    service: agent.serviceUrl.toString(),
    did: agent.session.did,
    handle: agent.session.handle,
    email: agent.session.email,
    emailConfirmed: agent.session.emailConfirmed || false,
    emailAuthFactor: agent.session.emailAuthFactor || false,
    refreshJwt: agent.session.refreshJwt,
    accessJwt: agent.session.accessJwt,
    signupQueued: isSignupQueued(agent.session.accessJwt),
    active: agent.session.active,
    status: agent.session.status,
    pdsUrl: agent.pdsUrl?.toString(),
    isSelfHosted: !agent.serviceUrl.toString().startsWith(BSKY_SERVICE),
  }
}

export function sessionAccountToSession(
  account: SessionAccount,
): AtpSessionData {
  return {
    // Sorted in the same property order as when returned by BskyAgent (alphabetical).
    accessJwt: account.accessJwt ?? '',
    did: account.did,
    email: account.email,
    emailAuthFactor: account.emailAuthFactor,
    emailConfirmed: account.emailConfirmed,
    handle: account.handle,
    refreshJwt: account.refreshJwt ?? '',
    /**
     * @see https://github.com/bluesky-social/atproto/blob/c5d36d5ba2a2c2a5c4f366a5621c06a5608e361e/packages/api/src/agent.ts#L188
     */
    active: account.active ?? true,
    status: account.status,
  }
}

export class Agent extends BaseAgent {
  constructor(
    proxyHeader: ProxyHeaderValue | null,
    ...options: ConstructorParameters<typeof BaseAgent>
  ) {
    super(...options)
    if (proxyHeader) {
      this.configureProxy(proxyHeader)
    }
  }
}

// Preferences are stored on and served by the user's PDS, not the AppView.
// The agent-wide `atproto-proxy` header (see WARN below) makes the PDS pipe
// these calls to the configured AppView, which does not own that data - a
// missing or partial AppView then breaks reads/writes of account preferences
// and with them the whole signed-in app. Stripping the header keeps these
// calls answered locally by the PDS regardless of AppView state.
const PDS_AUTHORITATIVE_XRPC_METHODS = [
  'app.bsky.actor.getPreferences',
  'app.bsky.actor.putPreferences',
]

function stripProxyHeaderForPdsAuthoritativeCalls(
  input: RequestInfo | URL,
  init?: RequestInit,
): [RequestInfo | URL, RequestInit?] {
  const url =
    typeof input === 'string'
      ? input
      : input instanceof URL
        ? input.href
        : input.url
  const isPdsAuthoritative = PDS_AUTHORITATIVE_XRPC_METHODS.some(nsid =>
    url.includes(`/xrpc/${nsid}`),
  )
  if (!isPdsAuthoritative) {
    return [input, init]
  }
  if (input instanceof Request) {
    const req = new Request(input, init)
    req.headers.delete('atproto-proxy')
    return [req, undefined]
  }
  const headers = new Headers(init?.headers)
  headers.delete('atproto-proxy')
  return [input, {...init, headers}]
}

// Captured at module load so later patches of globalThis.fetch don't affect
// agent traffic.
const realFetch = globalThis.fetch
const networkLogger = Logger.create(Logger.Context.Network)

/**
 * Per-request timeout for agent XRPC calls. Without one, a request that the
 * network silently drops (captive portal, flaky proxy, half-open socket) can
 * hang until the OS gives up, leaving whatever screen awaits it on a spinner.
 */
export const AGENT_REQUEST_TIMEOUT_MS = 15e3

/**
 * Calls that legitimately move a lot of bytes and must not be cut off by the
 * per-request timeout. They still honour any caller-provided AbortSignal.
 */
const NO_TIMEOUT_XRPC_METHODS = new Set([
  'com.atproto.repo.uploadBlob',
  'com.atproto.repo.importRepo',
  'com.atproto.sync.getRepo',
  'com.atproto.sync.getBlob',
  'app.bsky.video.uploadVideo',
])

/** Thrown when an agent request exceeds {@link AGENT_REQUEST_TIMEOUT_MS}. */
export class AgentRequestTimeoutError extends Error {
  name = 'AgentRequestTimeoutError'
  constructor(nsid: string, ms: number) {
    // Worded so isNetworkError()/cleanError() show the "check your
    // connection" message, like a native timeout.
    super(`Network request timed out (${nsid} after ${ms}ms)`)
  }
}

// Messages fetch implementations use for a transport-level failure (no
// response at all). React Native (iOS NSURLError -1009 offline, -1005
// connection lost, -1001 native timeout; Android equivalents) surfaces these as
// TypeError('Network request failed' | 'Network request timed out'); browsers
// use 'Failed to fetch' (Chromium), 'NetworkError when attempting to fetch
// resource.' (Firefox) and 'Load failed' (WebKit).
const CONNECTIVITY_ERROR_RE =
  /network request failed|network request timed out|failed to fetch|networkerror|load failed|network connection was lost|internet connection appears to be offline/i

function isAbortError(e: unknown): boolean {
  return (
    !!e &&
    typeof e === 'object' &&
    'name' in e &&
    (e as {name?: unknown}).name === 'AbortError'
  )
}

/**
 * True only for genuine transport-level connectivity failures. Aborts
 * (caller-initiated or our own timeout) and anything else (HTTP errors are not
 * thrown by fetch at all) return false.
 */
export function isConnectivityError(e: unknown): boolean {
  if (isAbortError(e) || e instanceof AgentRequestTimeoutError) return false
  if (!(e instanceof Error)) return false
  return CONNECTIVITY_ERROR_RE.test(e.message)
}

function describeRequest(input: RequestInfo | URL, init?: RequestInit) {
  const url =
    typeof input === 'string'
      ? input
      : input instanceof URL
        ? input.href
        : input.url
  // Only the NSID and host are logged: never the full URL (query params can
  // carry cursors, DIDs, or other things that don't belong in a log).
  const nsid = /\/xrpc\/([^/?#]+)/.exec(url)?.[1] ?? 'non-xrpc'
  let host = 'unknown'
  try {
    host = new URL(url).host
  } catch {}
  const method = (
    init?.method ?? (input instanceof Request ? input.method : 'GET')
  ).toUpperCase()
  const callerSignal =
    init?.signal ?? (input instanceof Request ? input.signal : undefined)
  return {nsid, host, method, callerSignal: callerSignal ?? undefined}
}

/**
 * The fetch every app agent uses. Adds a per-request timeout (composed with
 * any caller signal), feeds the react-query online heuristics, and logs a
 * timing line per request to the in-app system log.
 *
 * Exported for tests; production code reaches it via the agent factories.
 */
export async function agentFetch(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  const [reqInput, reqInit] = stripProxyHeaderForPdsAuthoritativeCalls(
    input,
    init,
  )
  const {nsid, host, method, callerSignal} = describeRequest(reqInput, reqInit)
  const timeoutMs = NO_TIMEOUT_XRPC_METHODS.has(nsid)
    ? undefined
    : AGENT_REQUEST_TIMEOUT_MS

  const controller = new AbortController()
  let timedOut = false
  const timer =
    timeoutMs !== undefined
      ? setTimeout(() => {
          timedOut = true
          controller.abort()
        }, timeoutMs)
      : undefined
  const onCallerAbort = () => controller.abort()
  if (callerSignal) {
    if (callerSignal.aborted) {
      controller.abort()
    } else {
      callerSignal.addEventListener('abort', onCallerAbort)
    }
  }

  const start = Date.now()
  try {
    const res = await realFetch(reqInput, {
      ...reqInit,
      signal: controller.signal,
    })
    networkLogger.debug('agent request', {
      nsid,
      host,
      method,
      status: res.status,
      ms: Date.now() - start,
    })
    emitNetworkConfirmed()
    return res
  } catch (e) {
    const ms = Date.now() - start
    if (timedOut && !callerSignal?.aborted) {
      networkLogger.info('agent request timed out', {nsid, host, method, ms})
      throw new AgentRequestTimeoutError(nsid, timeoutMs ?? ms)
    }
    if (callerSignal?.aborted) {
      networkLogger.debug('agent request aborted by caller', {
        nsid,
        host,
        method,
        ms,
      })
      throw e
    }
    const connectivity = isConnectivityError(e)
    networkLogger.info('agent request failed', {
      nsid,
      host,
      method,
      ms,
      error: e instanceof Error ? e.name : typeof e,
      connectivity,
    })
    if (connectivity) {
      emitNetworkLost()
    }
    throw e
  } finally {
    if (timer !== undefined) clearTimeout(timer)
    callerSignal?.removeEventListener('abort', onCallerAbort)
  }
}

// Not exported. Use factories above to create it.
// WARN: In the factories above, we _manually set a proxy header_ for the agent after we do whatever it is we are supposed to do.
// Ideally, we wouldn't be doing this. However, since there is so much logic that requires making calls to the PDS right now, it
// feels safer to just let those run as-is and set the header afterward.
class BskyAppAgent extends BskyAgent {
  persistSessionHandler: ((event: AtpSessionEvent) => void) | undefined =
    undefined

  constructor({service}: {service: string}) {
    super({
      service,
      fetch: agentFetch,
      persistSession: (event: AtpSessionEvent) => {
        if (this.persistSessionHandler) {
          this.persistSessionHandler(event)
        }
      },
    })
  }

  async prepare({
    resolvers,
    onSessionChange,
  }: {
    // Not awaited in the calling code so we can delay blocking on them.
    resolvers: Promise<unknown>[]
    onSessionChange: (
      agent: BskyAgent,
      did: string,
      event: AtpSessionEvent,
    ) => void
  }) {
    // There's nothing else left to do, so block on them here.
    await Promise.all(resolvers)

    // Now the agent is ready.
    const account = agentToSessionAccountOrThrow(this)
    this.persistSessionHandler = event => {
      onSessionChange(this, account.did, event)
      if (event !== 'create' && event !== 'update') {
        addSessionErrorLog(account.did, event)
      }
    }
    return {account, agent: this}
  }

  dispose() {
    this.sessionManager.session = undefined
    this.persistSessionHandler = undefined
  }
}

export type {BskyAppAgent}
