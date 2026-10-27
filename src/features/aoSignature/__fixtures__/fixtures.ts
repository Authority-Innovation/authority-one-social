// Shared test fixtures: an armed config and aos1 tokens with real-shaped payloads.
import {type AOSignatureConfig} from '../config'
import {getCryptoPort} from '../cryptoPort.web'
import {base64url} from '../pkce'

export const RUNTIME = 'https://runtime.test'

export const IOS_CFG: AOSignatureConfig = {
  platform: 'ios',
  issuer: 'https://janus.test/auth/v1',
  authorizeUrl: 'https://signature.test/auth/v1/oauth/authorize',
  clientId: 'ao-social-ios-dev',
  runtimeUrl: RUNTIME,
  redirectUri: 'https://app-dev.test/auth/janus/app-callback',
  scheme: 'authorityone-dev',
  callbackUrl: 'authorityone-dev://auth/janus/app-callback',
  audience: null,
  scopes: 'openid email profile',
}

function b64url(s: string): string {
  return Buffer.from(s, 'utf8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}

export function aosToken(p: {
  did: string
  sid: string
  exp?: number
  lv?: number
}): string {
  const now = Math.floor(Date.now() / 1000)
  const payload = {
    v: 1,
    iss: 'https://janus.test/auth/v1',
    pid: '00000000-0000-4000-8000-000000000001',
    did: p.did,
    ep: 0,
    sid: p.sid,
    iat: now,
    lv: p.lv ?? now,
    exp: p.exp ?? now + 30 * 24 * 3600,
  }
  return `aos1.${b64url(JSON.stringify(payload))}.${'a'.repeat(64)}`
}

export function pdsJwt(did: string, expS: number): string {
  return `h.${b64url(JSON.stringify({sub: did, scope: 'com.atproto.appPass', exp: expS}))}.sig`
}

export const DID = 'did:plc:owner1234'

/** `laterMs` shifts exp, so two sessions minted in the same second still get
 *  genuinely DIFFERENT tokens (a real refresh rotates the token). */
export function mintedSession(did = DID, sid = 'sid-1', laterMs = 0) {
  const exp = Date.now() + 30 * 24 * 3600 * 1000 + laterMs
  return {
    token: aosToken({did, sid, exp: Math.floor(exp / 1000)}),
    sid,
    epoch: 0,
    expiresAt: new Date(exp).toISOString(),
  }
}

export function redeemBody(over: Record<string, unknown> = {}) {
  return {
    ok: true,
    outcome: 'bound',
    did: DID,
    handle: 'owner.pds.test',
    agentHandle: null,
    principalId: '00000000-0000-4000-8000-000000000001',
    session: {did: DID, accessJwt: 'PDS-WINDOW-JWT'},
    sessionExpiresAt: new Date(Date.now() + 300000).toISOString(),
    aoSession: mintedSession(),
    primary: 'bob.pds.test',
    needsAgent: false,
    ...over,
  }
}

type Res = {status: number; ok: boolean; json(): Promise<unknown>}
export function res(status: number, body: unknown): Res {
  return {
    status,
    ok: status >= 200 && status < 300,
    json: () => Promise.resolve(body),
  }
}

/** The WebCrypto port (Node's global WebCrypto under jest). */
export const nodeCrypto = getCryptoPort()

export async function sha256b64url(input: string): Promise<string> {
  return base64url(await nodeCrypto.sha256(input))
}
