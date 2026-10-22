// The runtime's Signature routes (pilot-agent-runtime src/janus-ao.js,
// src/ao-signin-routes.js, the app-channel picker routes). Every call takes the
// fetch it uses, so tests drive the exact wire without a network.
import {AOSignatureError, runtimeErrorCode} from './errors'
import {type AOGrant} from './pkce'
import {
  type AOMintedSession,
  type AOPickerList,
  type AORedeemResult,
  decodeMintedSession,
  decodePickerList,
  decodeRedeem,
} from './wire'

export type AOFetch = (
  url: string,
  init: {method: string; headers: Record<string, string>; body?: string},
) => Promise<{status: number; ok: boolean; json(): Promise<unknown>}>

export interface AOLinkProof {
  /** The SAME PDS accessJwt that minted the code (the code is bound to it). */
  pdsAccessJwt: string
  linkCode: string
  /** The DID the code was minted for; the redeem must link exactly this one. */
  did: string
}

export interface AOLinkCode {
  did: string
  linkCode: string
  expiresAt: string
}

export interface AOClient {
  redeem(
    grant: AOGrant,
    nonce: string,
    link?: AOLinkProof | null,
  ): Promise<AORedeemResult>
  linkCode(pdsAccessJwt: string): Promise<AOLinkCode>
  refresh(token: string, did: string): Promise<AOMintedSession>
  introspect(token: string): Promise<AOPickerList & {did: string | null}>
  signout(token: string): Promise<void>
  signoutEverywhere(token: string): Promise<void>
  unlink(token: string): Promise<void>
  listAgents(token: string): Promise<AOPickerList>
  createAgent(
    token: string,
    input: {handle: string; name: string},
  ): Promise<{handle: string; primary: string | null}>
  choosePrimary(token: string, handle: string): Promise<string>
}

async function call(
  doFetch: AOFetch,
  url: string,
  method: string,
  headers: Record<string, string>,
  body?: unknown,
): Promise<unknown> {
  let res
  try {
    res = await doFetch(url, {
      method,
      headers:
        body === undefined
          ? headers
          : {...headers, 'Content-Type': 'application/json'},
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  } catch {
    throw new AOSignatureError('transport')
  }
  const json = await res.json().catch(() => null)
  if (!res.ok) {
    throw AOSignatureError.fromResponse(res.status, runtimeErrorCode(json))
  }
  return json
}

/** `Authorization: Bearer aos1…` — and NO `X-Authority-Auth`, which names a
 *  PDS token (resolvePrincipal branch 2b tells the two apart by the prefix). */
function aoBearer(token: string): Record<string, string> {
  return {Authorization: `Bearer ${token}`}
}

export function createAOClient(runtimeUrl: string, doFetch: AOFetch): AOClient {
  const base = runtimeUrl.replace(/\/+$/, '')
  return {
    async redeem(grant, nonce, link) {
      // A normal sign-in carries NO Authorization. Link mode adds the SAME PDS
      // bearer that minted the code + the atproto marker (janus-ao.js LINK MODE).
      const headers: Record<string, string> = link
        ? {
            Authorization: `Bearer ${link.pdsAccessJwt}`,
            'X-Authority-Auth': 'atproto',
          }
        : {}
      const body: Record<string, unknown> = {grant, nonce}
      if (link) body.link_code = link.linkCode
      const json = await call(
        doFetch,
        `${base}/auth/janus/session`,
        'POST',
        headers,
        body,
      )
      return decodeRedeem(json, {linkDid: link ? link.did : null})
    },

    async linkCode(pdsAccessJwt) {
      const json = (await call(doFetch, `${base}/auth/ao/link-code`, 'POST', {
        Authorization: `Bearer ${pdsAccessJwt}`,
      })) as Record<string, unknown> | null
      const did = typeof json?.did === 'string' ? json.did : ''
      const code = typeof json?.linkCode === 'string' ? json.linkCode : ''
      const exp = typeof json?.expiresAt === 'string' ? json.expiresAt : ''
      if (
        !did.startsWith('did:') ||
        !code ||
        !Number.isFinite(Date.parse(exp))
      ) {
        throw new AOSignatureError('refused', 502, 'unavailable')
      }
      return {did, linkCode: code, expiresAt: exp}
    },

    async refresh(token, did) {
      const json = (await call(
        doFetch,
        `${base}/auth/ao/session/refresh`,
        'POST',
        aoBearer(token),
      )) as Record<string, unknown> | null
      const minted = decodeMintedSession(json?.aoSession, did)
      if (!minted) throw new AOSignatureError('refused', 502, 'unavailable')
      return minted
    },

    async introspect(token) {
      const json = (await call(
        doFetch,
        `${base}/auth/ao/session`,
        'GET',
        aoBearer(token),
      )) as Record<string, unknown> | null
      return {
        ...decodePickerList(json),
        did: typeof json?.did === 'string' ? json.did : null,
      }
    },

    async signout(token) {
      await call(doFetch, `${base}/auth/ao/signout`, 'POST', aoBearer(token))
    },

    async signoutEverywhere(token) {
      await call(
        doFetch,
        `${base}/auth/ao/signout-everywhere`,
        'POST',
        aoBearer(token),
      )
    },

    async unlink(token) {
      await call(doFetch, `${base}/auth/ao/unlink`, 'POST', aoBearer(token))
    },

    async listAgents(token) {
      return decodePickerList(
        await call(doFetch, `${base}/app/agents`, 'GET', aoBearer(token)),
      )
    },

    async createAgent(token, input) {
      const json = (await call(
        doFetch,
        `${base}/app/agents`,
        'POST',
        aoBearer(token),
        {
          handle: input.handle,
          name: input.name,
        },
      )) as Record<string, unknown> | null
      const handle =
        typeof json?.handle === 'string' ? json.handle : input.handle
      // Only an explicit string is a primary; null/absent is re-read, never assumed.
      const primary =
        typeof json?.primary === 'string' && json.primary ? json.primary : null
      return {handle, primary}
    },

    async choosePrimary(token, handle) {
      const json = (await call(
        doFetch,
        `${base}/app/agents/primary`,
        'POST',
        aoBearer(token),
        {
          agent: handle,
        },
      )) as Record<string, unknown> | null
      const primary =
        typeof json?.primary === 'string' && json.primary ? json.primary : null
      if (!primary) throw new AOSignatureError('refused', 502, 'unavailable')
      return primary
    },
  }
}
