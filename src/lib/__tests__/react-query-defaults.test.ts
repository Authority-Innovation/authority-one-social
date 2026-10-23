import {afterEach, beforeAll, describe, expect, it, jest} from '@jest/globals'
import {onlineManager, QueryClient, QueryObserver} from '@tanstack/react-query'

jest.mock('@bsky.app/react-native-mmkv', () => ({
  MMKV: class MMKVMock {
    getString() {
      return undefined
    }
    set() {}
    delete() {}
    clearAll() {}
  },
}))

let createQueryClient: () => QueryClient

beforeAll(() => {
  // The module installs a 2 s connectivity interval at import time.
  jest.useFakeTimers()
  globalThis.fetch = jest.fn(() =>
    Promise.reject(new TypeError('Network request failed')),
  )
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  createQueryClient = (
    require('#/lib/react-query') as typeof import('#/lib/react-query')
  ).createQueryClient
})

afterEach(() => {
  onlineManager.setOnline(true)
})

async function settle<A, B, C>(
  observer: QueryObserver<A, Error, B, C, string[]>,
) {
  const unsub = observer.subscribe(() => {})
  await jest.advanceTimersByTimeAsync(10)
  const result = observer.getCurrentResult()
  unsub()
  return result
}

describe('createQueryClient defaults', () => {
  it("uses networkMode 'offlineFirst' and keeps the other defaults", () => {
    const client = createQueryClient()
    const q = client.getDefaultOptions().queries!
    expect(q.networkMode).toBe('offlineFirst')
    expect(q.retry).toBe(false)
    expect(q.refetchOnWindowFocus).toBe(false)
    expect(q.structuralSharing).toBe(false)
  })

  it('a query started while offline still fetches and resolves', async () => {
    onlineManager.setOnline(false)
    const client = createQueryClient()
    const queryFn = jest.fn(() => Promise.resolve('prefs'))
    const result = await settle(
      new QueryObserver(client, {queryKey: ['offline-ok'], queryFn}),
    )
    expect(queryFn).toHaveBeenCalledTimes(1)
    expect(result.fetchStatus).toBe('idle')
    expect(result.status).toBe('success')
    expect(result.data).toBe('prefs')
  })

  it('a query started while offline that fails settles into error (not paused)', async () => {
    onlineManager.setOnline(false)
    const client = createQueryClient()
    const queryFn = jest.fn(() =>
      Promise.reject(new TypeError('Network request failed')),
    )
    const result = await settle(
      new QueryObserver(client, {queryKey: ['offline-err'], queryFn}),
    )
    expect(queryFn).toHaveBeenCalledTimes(1)
    expect(result.fetchStatus).toBe('idle')
    expect(result.status).toBe('error')
  })

  it("control: the old 'online' mode pauses the same query and never fetches", async () => {
    onlineManager.setOnline(false)
    const client = new QueryClient({
      defaultOptions: {queries: {retry: false, networkMode: 'online'}},
    })
    const queryFn = jest.fn(() => Promise.resolve('prefs'))
    const result = await settle(
      new QueryObserver(client, {queryKey: ['offline-paused'], queryFn}),
    )
    expect(queryFn).not.toHaveBeenCalled()
    expect(result.fetchStatus).toBe('paused')
  })

  it('persisted (hydrated) data is kept and revalidated when offline', async () => {
    // Simulates a query restored by PersistQueryClientProvider: data present
    // but stale. offlineFirst attempts the refetch; a failure keeps the data.
    onlineManager.setOnline(false)
    const client = createQueryClient()
    client.setQueryData(['hydrated'], 'cached', {updatedAt: 0})
    const queryFn = jest.fn(() =>
      Promise.reject(new TypeError('Network request failed')),
    )
    const result = await settle(
      new QueryObserver(client, {
        queryKey: ['hydrated'],
        queryFn,
        staleTime: 1000,
      }),
    )
    expect(queryFn).toHaveBeenCalledTimes(1)
    expect(result.data).toBe('cached')
    expect(result.fetchStatus).toBe('idle')
  })
})
