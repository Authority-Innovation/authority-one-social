import {describe, expect, it} from '@jest/globals'

import {IOS_CFG, nodeCrypto} from '../__fixtures__/fixtures'
import {
  base64url,
  buildAuthorizeUrl,
  checkCallback,
  createFlow,
  FLOW_MAX_AGE_MS,
  grantFor,
  mintState,
  PKCE_VERIFIER_RE,
} from '../pkce'

describe('PKCE flow', () => {
  it('base64url matches node', () => {
    for (const n of [0, 1, 2, 3, 31, 32, 33]) {
      const b = globalThis.crypto.getRandomValues(new Uint8Array(n))
      expect(base64url(b)).toBe(Buffer.from(b).toString('base64url'))
    }
  })

  it('S256 matches the RFC 7636 appendix B vector', async () => {
    const challenge = base64url(
      await nodeCrypto.sha256('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk'),
    )
    expect(challenge).toBe('E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM')
  })

  it('mints S256: verifier on the RFC 7636 shape, challenge = b64url(sha256(verifier))', async () => {
    const f = await createFlow(IOS_CFG, nodeCrypto, 1000)
    expect(f.verifier).toMatch(PKCE_VERIFIER_RE)
    expect(f.challenge).toBe(
      Buffer.from(await nodeCrypto.sha256(f.verifier)).toString('base64url'),
    )
    expect(f.nonce.length).toBeGreaterThanOrEqual(32)
    expect(f.redirectUri).toBe(IOS_CFG.redirectUri)
    expect(f.clientId).toBe(IOS_CFG.clientId)
  })

  it('native state is `as.<scheme>.<random>` (what the runtime bounce accepts); web has no prefix', async () => {
    const f = await createFlow(IOS_CFG, nodeCrypto)
    const parts = f.state.split('.')
    expect(parts).toHaveLength(3)
    expect(parts[0]).toBe('as')
    expect(parts[1]).toBe('authorityone-dev')
    expect(parts[2]).toMatch(/^[A-Za-z0-9_-]{1,128}$/)
    expect(mintState({scheme: null}, 'abc')).toBe('abc')
    expect(() => mintState({scheme: null}, 'a.b')).toThrow()
  })

  it('each attempt gets a new verifier, state and nonce', async () => {
    const a = await createFlow(IOS_CFG, nodeCrypto)
    const b = await createFlow(IOS_CFG, nodeCrypto)
    expect(a.verifier).not.toBe(b.verifier)
    expect(a.state).not.toBe(b.state)
    expect(a.nonce).not.toBe(b.nonce)
  })

  it('authorize URL carries code+S256+state+nonce+exact redirect, scopes, no secret', async () => {
    const f = await createFlow(IOS_CFG, nodeCrypto)
    const u = new URL(buildAuthorizeUrl(IOS_CFG, f))
    expect(u.origin + u.pathname).toBe(IOS_CFG.authorizeUrl)
    const q = Object.fromEntries(u.searchParams)
    expect(q).toEqual({
      response_type: 'code',
      client_id: 'ao-social-ios-dev',
      redirect_uri: IOS_CFG.redirectUri,
      scope: 'openid email profile',
      state: f.state,
      nonce: f.nonce,
      code_challenge: f.challenge,
      code_challenge_method: 'S256',
    })
    expect(u.toString()).not.toContain(f.verifier)
  })

  describe('callback check', () => {
    it('accepts exactly one matching state + one code', async () => {
      const f = await createFlow(IOS_CFG, nodeCrypto, 1000)
      const cb = checkCallback(
        `authorityone-dev://auth/janus/app-callback?code=C1&state=${f.state}`,
        f,
        2000,
      )
      expect(cb).toEqual({ok: true, code: 'C1', callbackState: f.state})
      const g = grantFor(f, cb as {code: string; callbackState: string})
      expect(g).toEqual({
        code: 'C1',
        code_verifier: f.verifier,
        code_challenge_method: 'S256',
        redirect_uri: IOS_CFG.redirectUri,
        state: f.state,
        callback_state: f.state,
        client_id: 'ao-social-ios-dev',
      })
    })

    it.each([
      [
        'a foreign state',
        (s: string) => `x://cb?code=C&state=${s}x`,
        'state-mismatch',
      ],
      [
        'two states',
        (s: string) => `x://cb?code=C&state=${s}&state=${s}`,
        'state-mismatch',
      ],
      ['no state', (_s: string) => 'x://cb?code=C', 'state-mismatch'],
      ['no code', (s: string) => `x://cb?state=${s}`, 'bad-callback'],
      [
        'a cancel at Google',
        (s: string) => `x://cb?error=access_denied&state=${s}`,
        'cancelled',
      ],
      [
        'a Janus error',
        (s: string) => `x://cb?error=server_error&state=${s}`,
        'janus-error',
      ],
    ])('refuses %s', async (_n, build, reason) => {
      const f = await createFlow(IOS_CFG, nodeCrypto, 1000)
      const cb = checkCallback(build(f.state), f, 2000)
      expect(cb.ok).toBe(false)
      expect(cb.ok ? null : cb.reason).toBe(reason)
    })

    it('refuses a flow older than the max age', async () => {
      const f = await createFlow(IOS_CFG, nodeCrypto, 0)
      const cb = checkCallback(
        `x://cb?code=C&state=${f.state}`,
        f,
        FLOW_MAX_AGE_MS + 1,
      )
      expect(cb.ok).toBe(false)
    })
  })
})
