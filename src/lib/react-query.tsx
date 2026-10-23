import {useEffect, useRef, useState} from 'react'
import {AppState, type AppStateStatus} from 'react-native'
import {createAsyncStoragePersister} from '@tanstack/query-async-storage-persister'
import {focusManager, onlineManager, QueryClient} from '@tanstack/react-query'
import {
  type PersistedClient,
  type PersistQueryClientOptions,
  PersistQueryClientProvider,
  type PersistQueryClientProviderProps,
} from '@tanstack/react-query-persist-client'

import {AUTHORITY_ONE_SERVICE} from '#/lib/constants'
import {createPersistedQueryStorage} from '#/lib/persisted-query-storage'
import {Logger} from '#/logger'
import {listenNetworkConfirmed, listenNetworkLost} from '#/state/events'
import {isQueryPersisted} from '#/state/queries/util'
import * as env from '#/env'
import {IS_NATIVE, IS_WEB} from '#/env'

declare global {
  interface Window {
    // eslint-disable-next-line  @typescript-eslint/consistent-type-imports
    __TANSTACK_QUERY_CLIENT__: import('@tanstack/query-core').QueryClient
  }
}

const networkLogger = Logger.create(Logger.Context.Network)

// Health probe for the connectivity checker. Authority One talks to its own
// PDS, so probe that rather than Bluesky's public AppView (which may be
// reachable when our PDS is not, or vice versa). Returns `{version}`.
const PDS_ORIGIN: string = AUTHORITY_ONE_SERVICE
const HEALTH_CHECK_URL = `${PDS_ORIGIN.replace(/\/+$/, '')}/xrpc/_health`
const HEALTH_CHECK_TIMEOUT_MS = 15e3

async function checkIsOnline(): Promise<boolean> {
  const controller = new AbortController()
  const timer = setTimeout(() => {
    controller.abort()
  }, HEALTH_CHECK_TIMEOUT_MS)
  const start = Date.now()
  try {
    const res = await fetch(HEALTH_CHECK_URL, {
      cache: 'no-store',
      signal: controller.signal,
    })
    const json = (await res.json()) as {version?: unknown} | null
    const ok = !!json?.version
    networkLogger.debug('health check', {
      ok,
      status: res.status,
      ms: Date.now() - start,
    })
    return ok
  } catch (e) {
    networkLogger.info('health check failed', {
      error: e instanceof Error ? e.name : typeof e,
      ms: Date.now() - start,
    })
    return false
  } finally {
    clearTimeout(timer)
  }
}

let receivedNetworkLost = false
let receivedNetworkConfirmed = false
let isNetworkStateUnclear = false

function setNetworkStateUnclear(next: boolean, reason: string) {
  if (isNetworkStateUnclear !== next) {
    networkLogger.info('isNetworkStateUnclear changed', {
      unclear: next,
      reason,
    })
  }
  isNetworkStateUnclear = next
}

function setOnline(next: boolean, reason: string) {
  const prev = onlineManager.isOnline()
  if (prev !== next) {
    networkLogger.info('onlineManager transition', {
      online: next,
      reason,
    })
  }
  onlineManager.setOnline(next)
}

// A transport failure right after our PDS answered a probe is more likely a
// single bad route/host than a lost connection. Going offline there would flap
// (offline -> probe ok -> online -> refetchOnReconnect storm -> offline ...),
// so instead mark the state unclear and let the next probe (<= 2 s) decide.
const LOST_GRACE_AFTER_HEALTHY_PROBE_MS = 3000
let lastHealthyProbeAt = -Infinity

listenNetworkLost(() => {
  receivedNetworkLost = true
  if (
    onlineManager.isOnline() &&
    Date.now() - lastHealthyProbeAt < LOST_GRACE_AFTER_HEALTHY_PROBE_MS
  ) {
    setNetworkStateUnclear(true, 'network-lost-just-after-healthy-probe')
    return
  }
  setOnline(false, 'agent-network-lost')
})

listenNetworkConfirmed(() => {
  receivedNetworkConfirmed = true
  // A request just completed, so whatever made the state "unclear" is moot.
  setNetworkStateUnclear(false, 'agent-network-confirmed')
  setOnline(true, 'agent-network-confirmed')
})

let checkPromise: Promise<void> | undefined
function checkIsOnlineIfNeeded() {
  if (checkPromise) {
    return
  }
  receivedNetworkLost = false
  receivedNetworkConfirmed = false
  checkPromise = checkIsOnline().then(nextIsOnline => {
    checkPromise = undefined
    if (nextIsOnline) {
      // The health probe reached our PDS: that is direct evidence of
      // connectivity, even if some other request failed while the probe was
      // in flight (receivedNetworkLost). Previously that race set
      // isNetworkStateUnclear and nothing ever reset it, so the app stayed
      // offline (and Home's queries stayed paused) until an unrelated
      // background poll happened to succeed up to a minute later.
      if (receivedNetworkLost) {
        networkLogger.info('health ok despite network-lost during check')
      }
      lastHealthyProbeAt = Date.now()
      setNetworkStateUnclear(false, 'health-check-ok')
      setOnline(true, 'health-check-ok')
      return
    }
    if (receivedNetworkConfirmed) {
      // Probe failed but a real request succeeded meanwhile; stay online and
      // keep checking (the interval re-checks while the state is unclear).
      setNetworkStateUnclear(true, 'health-failed-but-request-ok')
      return
    }
    setNetworkStateUnclear(false, 'health-check-failed')
    setOnline(false, 'health-check-failed')
  })
}

setInterval(() => {
  if (AppState.currentState === 'active') {
    if (!onlineManager.isOnline() || isNetworkStateUnclear) {
      checkIsOnlineIfNeeded()
    }
  }
}, 2000)

focusManager.setEventListener(onFocus => {
  if (IS_NATIVE) {
    const subscription = AppState.addEventListener(
      'change',
      (status: AppStateStatus) => {
        focusManager.setFocused(status === 'active')
      },
    )

    return () => subscription.remove()
  } else if (typeof window !== 'undefined' && window.addEventListener) {
    // these handlers are a bit redundant but focus catches when the browser window
    // is blurred/focused while visibilitychange seems to only handle when the
    // window minimizes (both of them catch tab changes)
    // there's no harm to redundant fires because refetchOnWindowFocus is only
    // used with queries that employ stale data times
    const handler = () => onFocus()
    window.addEventListener('focus', handler, false)
    window.addEventListener('visibilitychange', handler, false)
    return () => {
      window.removeEventListener('visibilitychange', handler)
      window.removeEventListener('focus', handler)
    }
  }
})

export const createQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: {
        // NOTE
        // refetchOnWindowFocus breaks some UIs (like feeds)
        // so we only selectively want to enable this
        // -prf
        refetchOnWindowFocus: false,
        // Structural sharing between responses makes it impossible to rely on
        // "first seen" timestamps on objects to determine if they're fresh.
        // Disable this optimization so that we can rely on "first seen" timestamps.
        structuralSharing: false,
        // We don't want to retry queries by default, because in most cases we
        // want to fail early and show a response to the user. There are
        // exceptions, and those can be made on a per-query basis. For others, we
        // should give users controls to retry.
        retry: false,
        // 'offlineFirst': always run the first fetch even when onlineManager
        // thinks we're offline, so a query settles into data or error rather
        // than sitting paused (Home's cold-start spinner). onlineManager is
        // fed by our own heuristics (agent fetch failures, health probe) and
        // can be wrong; retries (where enabled) still pause while offline.
        networkMode: 'offlineFirst',
      },
    },
  })

// Query roots whose data is post/feed content. These must NEVER be persisted
// or hydrated from a persisted payload: feed queries use staleTime INFINITY,
// so a hydrated feed page renders a stale timeline that never revalidates.
// Older deployed builds wrote feed queries into the persisted cache, and the
// buster (app version) never changed, so those payloads survived every
// update until users manually cleared IndexedDB.
const NEVER_PERSIST_QUERY_ROOTS = new Set<unknown>([
  'post-feed',
  'post-thread-v2',
  'notification-feed',
  'search-posts',
])

// Bump to drop every previously persisted query cache on next app load.
const PERSIST_CACHE_GENERATION = 2

function isSafeToPersist(queryKey: readonly unknown[]): boolean {
  return (
    isQueryPersisted(queryKey) && !NEVER_PERSIST_QUERY_ROOTS.has(queryKey[0])
  )
}

const dehydrateOptions: PersistQueryClientProviderProps['persistOptions']['dehydrateOptions'] =
  {
    shouldDehydrateMutation: (_: any) => false,
    shouldDehydrateQuery: query => {
      return isSafeToPersist(query.queryKey)
    },
  }

// Hydration does NOT re-apply shouldDehydrateQuery, so a payload written by
// an older build can restore queries the current rules would never persist.
// Filter at restore time as well.
function deserializePersistedClient(cached: string): PersistedClient {
  const client = JSON.parse(cached) as PersistedClient
  if (client?.clientState?.queries) {
    client.clientState.queries = client.clientState.queries.filter(q =>
      isSafeToPersist(q.queryKey),
    )
  }
  return client
}

export function QueryProvider({
  children,
  currentDid,
}: {
  children: React.ReactNode
  currentDid: string | undefined
}) {
  return (
    <QueryProviderInner
      // Enforce we never reuse cache between users.
      // These two props MUST stay in sync.
      key={currentDid}
      currentDid={currentDid}>
      {children}
    </QueryProviderInner>
  )
}

function QueryProviderInner({
  children,
  currentDid,
}: {
  children: React.ReactNode
  currentDid: string | undefined
}) {
  const initialDid = useRef(currentDid)
  if (currentDid !== initialDid.current) {
    throw Error(
      'Something is very wrong. Expected did to be stable due to key above.',
    )
  }
  // We create the query client here so that it's scoped to a specific DID.
  // Do not move the query client creation outside of this component.
  const [queryClient, _setQueryClient] = useState(() => createQueryClient())
  const [persistOptions, _setPersistOptions] = useState(() => {
    const storage = createPersistedQueryStorage(currentDid ?? 'logged-out')
    const asyncPersister = createAsyncStoragePersister({
      storage,
      key: 'queryClient-' + (currentDid ?? 'logged-out'),
      deserialize: deserializePersistedClient,
    })
    return {
      persister: asyncPersister,
      dehydrateOptions,
      // The persisted queries all have short staleTimes, so they revalidate
      // shortly after being restored; maxAge is a hard ceiling on top of
      // that (the library default is 24h).
      maxAge: 1000 * 60 * 60,
      buster: `${env.APP_VERSION}-${PERSIST_CACHE_GENERATION}`,
    } satisfies Omit<PersistQueryClientOptions, 'queryClient'>
  })
  useEffect(() => {
    if (IS_WEB) {
      // WARNING, BROKEN
      // something since v5.32.0 causes OOMs. not important
      // so disable for now
      // window.__TANSTACK_QUERY_CLIENT__ = queryClient
    }
  }, [queryClient])
  return (
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={persistOptions}>
      {children}
    </PersistQueryClientProvider>
  )
}
