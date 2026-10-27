import {beforeEach, describe, expect, it, jest} from '@jest/globals'

// The WEB redirect leg, armed for web, against a minimal fake window.
jest.mock('../config', () => ({
  AO_SIGNATURE_CONFIG: {
    platform: 'web',
    redirectUri: 'https://web.test/auth/janus/callback',
  },
}))

import {
  captureAOSignatureWebCallback,
  startWebRedirect,
  takeWebCallback,
} from '../browser.web'
import {FLOW_MAX_AGE_MS} from '../pkce'

const flow = {
  verifier: 'v'.repeat(43),
  challenge: 'c',
  state: 'st',
  nonce: 'n',
  redirectUri: 'https://web.test/auth/janus/callback',
  clientId: 'ao-web',
  createdAt: 1000,
}

function fakeWindow(href: string) {
  const store = new Map<string, string>()
  const u = new URL(href)
  const w = {
    location: {
      href,
      origin: u.origin,
      pathname: u.pathname,
      search: u.search,
      assign: jest.fn(),
    },
    sessionStorage: {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
    },
    history: {replaceState: jest.fn()},
  }
  ;(globalThis as unknown as {window: unknown}).window = w
  return {w, store}
}

describe('web redirect leg', () => {
  beforeEach(() => {
    takeWebCallback()
  })

  it('keeps the attempt in sessionStorage (not localStorage) and leaves for Janus', () => {
    const {w, store} = fakeWindow('https://web.test/login')
    startWebRedirect('https://janus.test/oauth/authorize?x=1', {
      flow,
      link: null,
    })
    expect(w.location.assign).toHaveBeenCalledWith(
      'https://janus.test/oauth/authorize?x=1',
    )
    expect(
      (JSON.parse([...store.values()][0]) as {returnTo: string}).returnTo,
    ).toBe('/login')
  })

  it('on return: takes code+pending into memory, wipes both from the URL and storage', () => {
    const {w, store} = fakeWindow('https://web.test/login')
    startWebRedirect('https://janus.test/a', {flow, link: null})
    const back = fakeWindow(
      'https://web.test/auth/janus/callback?code=C&state=st',
    )
    for (const [k, v] of store) back.store.set(k, v)
    captureAOSignatureWebCallback(1000 + 1)
    expect(back.w.history.replaceState).toHaveBeenCalledWith(null, '', '/login')
    expect(back.store.size).toBe(0)
    const cb = takeWebCallback()
    expect(cb?.url).toContain('code=C')
    expect(cb?.pending.flow.verifier).toBe(flow.verifier)
    expect(takeWebCallback()).toBeNull()
    void w
  })

  it('an expired attempt is dropped; another path is untouched', () => {
    const back = fakeWindow(
      'https://web.test/auth/janus/callback?code=C&state=st',
    )
    back.store.set(
      'ao-signature-pending-v1',
      JSON.stringify({flow, link: null, returnTo: '//evil.test'}),
    )
    captureAOSignatureWebCallback(1000 + FLOW_MAX_AGE_MS + 1)
    expect(back.w.history.replaceState).toHaveBeenCalledWith(null, '', '/')
    expect(takeWebCallback()).toBeNull()

    const other = fakeWindow('https://web.test/profile?code=C')
    captureAOSignatureWebCallback()
    expect(other.w.history.replaceState).not.toHaveBeenCalled()
  })

  it('an off-site returnTo is never followed', () => {
    const back = fakeWindow(
      'https://web.test/auth/janus/callback?code=C&state=st',
    )
    back.store.set(
      'ao-signature-pending-v1',
      JSON.stringify({
        flow: {...flow, createdAt: Date.now()},
        link: null,
        returnTo: '//evil.test/x',
      }),
    )
    captureAOSignatureWebCallback()
    expect(back.w.history.replaceState).toHaveBeenCalledWith(null, '', '/')
  })
})
