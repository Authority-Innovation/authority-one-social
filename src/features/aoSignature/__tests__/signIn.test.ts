import {describe, expect, it, jest} from '@jest/globals'

import {
  DID,
  IOS_CFG,
  nodeCrypto,
  pdsJwt,
  redeemBody,
  sha256b64url,
} from '../__fixtures__/fixtures'
import {type AOClient} from '../client'
import {AOSignatureError} from '../errors'
import {
  type AOBrowserResult,
  type AOPdsPort,
  prepareLink,
  signInNative,
} from '../signIn'
import {decodeRedeem} from '../wire'

const HOUR_S = 3600
const nowS = () => Math.floor(Date.now() / 1000)

function harness(
  opts: {
    browser?: (authUrl: string) => AOBrowserResult
    pdsExpS?: number
    codeDid?: string
    codeExpiresAt?: string
  } = {},
) {
  const order: string[] = []
  let pdsSession: {did: string; accessJwt: string} | null = {
    did: DID,
    accessJwt: pdsJwt(DID, opts.pdsExpS ?? nowS() + 2 * HOUR_S),
  }
  const pds: AOPdsPort = {
    current: () => pdsSession,
    refresh: jest.fn(() => {
      order.push('pds-refresh')
      pdsSession = {did: DID, accessJwt: pdsJwt(DID, nowS() + 2 * HOUR_S)}
      return Promise.resolve(pdsSession)
    }),
  }
  const redeem = jest.fn((_g: unknown, _n: string, link: unknown) => {
    order.push('redeem')
    return Promise.resolve(
      decodeRedeem(redeemBody(link ? {outcome: 'linked'} : {}), {
        linkDid: link ? DID : null,
      }),
    )
  })
  const linkCode = jest.fn((jwt: string) => {
    order.push(
      `link-code:${jwt === pdsSession?.accessJwt ? 'current' : 'other'}`,
    )
    return Promise.resolve({
      did: opts.codeDid ?? DID,
      linkCode: 'LC-1',
      expiresAt:
        opts.codeExpiresAt ?? new Date(Date.now() + 600000).toISOString(),
    })
  })
  const client = {redeem, linkCode} as unknown as AOClient
  const browser = {
    authorize: jest.fn((url: string, callbackUrl: string) => {
      order.push('browser')
      expect(callbackUrl).toBe(IOS_CFG.callbackUrl)
      if (opts.browser) return Promise.resolve(opts.browser(url))
      const state = new URL(url).searchParams.get('state')!
      return Promise.resolve<AOBrowserResult>({
        type: 'success',
        url: `${callbackUrl}?code=CODE&state=${state}`,
      })
    }),
  }
  const deps = {cfg: IOS_CFG, client, crypto: nodeCrypto}
  return {
    order,
    pds,
    redeem,
    linkCode,
    browser,
    deps,
    setPds: (s: typeof pdsSession) => (pdsSession = s),
  }
}

async function kindOf(p: Promise<unknown>): Promise<string> {
  try {
    await p
    return 'ok'
  } catch (e) {
    return e instanceof AOSignatureError ? e.kind : String(e)
  }
}

describe('native sign-in', () => {
  it('runs the browser then redeems the grant with the flow nonce and verifier', async () => {
    const h = harness()
    const r = await signInNative(h.deps, h.browser, null)
    expect(r.did).toBe(DID)
    expect(h.order).toEqual(['browser', 'redeem'])
    const [grant, nonce, link] = h.redeem.mock.calls[0] as [
      Record<string, string>,
      string,
      unknown,
    ]
    const authUrl = new URL(h.browser.authorize.mock.calls[0][0])
    expect(nonce).toBe(authUrl.searchParams.get('nonce'))
    expect(grant.state).toBe(authUrl.searchParams.get('state'))
    expect(grant.callback_state).toBe(grant.state)
    expect(grant.code).toBe('CODE')
    expect(grant.client_id).toBe('ao-social-ios-dev')
    expect(link).toBeNull()
    const challenge = await sha256b64url(grant.code_verifier)
    expect(authUrl.searchParams.get('code_challenge')).toBe(challenge)
  })

  it('a closed sheet is `cancelled`; nothing reaches the runtime', async () => {
    const h = harness({browser: () => ({type: 'cancel'})})
    expect(await kindOf(signInNative(h.deps, h.browser))).toBe('cancelled')
    expect(h.redeem).not.toHaveBeenCalled()
  })

  it('a foreign state never reaches the runtime', async () => {
    const h = harness({
      browser: () => ({
        type: 'success',
        url: `${IOS_CFG.callbackUrl}?code=C&state=as.authorityone-dev.evil`,
      }),
    })
    expect(await kindOf(signInNative(h.deps, h.browser))).toBe('janus')
    expect(h.redeem).not.toHaveBeenCalled()
  })
})

describe('link ceremony ordering', () => {
  it('link-code (current PDS session) → Signature sheet → redeem with the SAME bearer + code', async () => {
    const h = harness()
    const prep = await prepareLink(h.deps, h.pds)
    const minting = prep.pdsAccessJwt
    await signInNative(h.deps, h.browser, {prep, pds: h.pds})
    expect(h.order).toEqual(['link-code:current', 'browser', 'redeem'])
    const link = h.redeem.mock.calls[0][2] as {
      pdsAccessJwt: string
      linkCode: string
      did: string
    }
    expect(link).toEqual({pdsAccessJwt: minting, linkCode: 'LC-1', did: DID})
  })

  it('a PDS token that would die before the code is refreshed FIRST', async () => {
    const h = harness({pdsExpS: nowS() + 60})
    await prepareLink(h.deps, h.pds)
    expect(h.order).toEqual(['pds-refresh', 'link-code:current'])
  })

  it('no PDS session ⇒ refused before any call', async () => {
    const h = harness()
    h.setPds(null)
    expect(await kindOf(prepareLink(h.deps, h.pds))).toBe('needs-pds-session')
    expect(h.linkCode).not.toHaveBeenCalled()
  })

  it('a code minted for another DID is refused', async () => {
    const h = harness({codeDid: 'did:plc:else'})
    expect(await kindOf(prepareLink(h.deps, h.pds))).toBe('link-mismatch')
  })

  it('an expired code is refused BEFORE the redeem', async () => {
    const h = harness({codeExpiresAt: new Date(Date.now() - 1).toISOString()})
    const prep = await prepareLink(h.deps, h.pds)
    expect(
      await kindOf(signInNative(h.deps, h.browser, {prep, pds: h.pds})),
    ).toBe('link-code-unusable')
    expect(h.redeem).not.toHaveBeenCalled()
  })

  it('a change of account during the sheet is refused BEFORE the redeem', async () => {
    const h = harness({
      browser: url => {
        h.setPds({did: 'did:plc:other', accessJwt: 'x.y.z'})
        const state = new URL(url).searchParams.get('state')!
        return {
          type: 'success',
          url: `${IOS_CFG.callbackUrl}?code=C&state=${state}`,
        }
      },
    })
    const prep = await prepareLink(h.deps, h.pds)
    expect(
      await kindOf(signInNative(h.deps, h.browser, {prep, pds: h.pds})),
    ).toBe('link-mismatch')
    expect(h.redeem).not.toHaveBeenCalled()
  })
})
