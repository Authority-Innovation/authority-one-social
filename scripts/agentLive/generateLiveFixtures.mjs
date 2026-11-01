// Generates live.json: the real responses of the runtime's Agent Live owner
// routes (authority-one-runtime src/live/tenant/live-routes.js and
// live-consent-routes.js), produced by running handleLive over the runtime's
// own in-process test world (test/live-isolation/fixtures.js: real
// LiveTenantDO / RoomIndexDO, the real room-service client over the fake
// LiveKit, the real participant_joined backstop). Nothing in live.json is
// hand-written: every body is what handleLive answered.
//
// Usage (from a checkout or `git archive` of the runtime at SOURCE_COMMIT):
//   node scripts/agentLive/generateLiveFixtures.mjs <runtimeRoot> \
//     > src/features/agentLive/__fixtures__/live.json
//
// Not run by jest. Re-run it against a newer runtime commit to refresh the
// contract, and update SOURCE_COMMIT in the output.
//
// The tokens in the output are signed with the runtime test world's own
// synthetic region secret (fixtures.js REGION_SECRET) and name synthetic DIDs
// only. They are not credentials for anything.
import path from 'node:path'
import {pathToFileURL} from 'node:url'

import {ed25519} from '@noble/curves/ed25519'

// feat/agent-live-r2-workers-v2 at 9fc23bd (R2 contract rev 4: /prove always
// trades, `exchange` is ignored; earlier: ac11bd0, R2 v2, review bfc09869). It
// contains agent-live/integration.
const SOURCE_COMMIT = '9fc23bd'
const SOURCE_REF = 'origin/feat/agent-live-r2-workers-v2'

// Ids, room names and jtis end in random bytes, and every token carries the
// clock: fix both so the output is stable.
let byte = 0
globalThis.crypto.getRandomValues = arr => {
  for (let i = 0; i < arr.length; i++) arr[i] = byte++ & 0xff
  return arr
}
let tick = Date.UTC(2026, 10, 1, 0, 0, 0)
Date.now = () => (tick += 1)

const root = process.argv[2]
if (!root) throw new Error('usage: generateLiveFixtures.mjs <runtimeRoot>')
const load = p => import(pathToFileURL(path.join(root, p)).href)
const {TA, TB, liveEnv, liveDeps, liveRequest, ALL_GIVEN} = await load(
  'test/live-isolation/fixtures.js',
)
const {handleLive} = await load('src/live/tenant/live-routes.js')

// A fixed device key, so the app's tests can check that its signer produces
// exactly the proof this runtime accepted (Ed25519 signatures are
// deterministic).
const DEVICE_SEED = new Uint8Array(32).fill(7)
const b64u = bytes =>
  Buffer.from(bytes)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
const DEVICE_PUB = b64u(ed25519.getPublicKey(DEVICE_SEED))
const claimsOf = token =>
  JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8'))
const proofMessage = claims =>
  new TextEncoder().encode(
    `ao-live-join-pop/v1\n${claims.video.room}\n${claims.sub}\n${claims.jti}`,
  )
const sign = token =>
  b64u(ed25519.sign(proofMessage(claimsOf(token)), DEVICE_SEED))

const env = liveEnv()
const w = liveDeps(env)
async function call(p, {bearer = null, body, method = 'POST'} = {}) {
  const res = await handleLive(
    liveRequest(p, {bearer, body, method}),
    env,
    new URL(`https://runtime.test${p}`),
    w.deps,
  )
  const text = await res.text()
  let json
  try {
    json = JSON.parse(text)
  } catch {
    json = null
  }
  return {status: res.status, body: json}
}

const out = {
  source: {
    repo: 'authority-one-runtime',
    ref: SOURCE_REF,
    commit: SOURCE_COMMIT,
  },
  device: {
    seedHex: Buffer.from(DEVICE_SEED).toString('hex'),
    publicKey: DEVICE_PUB,
  },
  owner: {did: TA.ownerDid, agentDid: TA.agentDid, otherAgentDid: TB.agentDid},
  responses: {},
  media: {},
  // The proofs the runtime accepted (proveOk, proveCamera), by the token they prove.
  proofs: {},
}
const r = out.responses

// Start before any consent: a session but no join token (F9), bound to the device key.
r.startAwaitingConsent = await call('/live/sessions', {
  bearer: TA.bearer,
  body: {agentDid: TA.agentDid, devicePubKey: DEVICE_PUB},
})
const sid = r.startAwaitingConsent.body.sid
// The same owner and agent again while that session is active: reused.
r.startReused = await call('/live/sessions', {
  bearer: TA.bearer,
  body: {agentDid: TA.agentDid, devicePubKey: DEVICE_PUB},
})
// A token before the owner has decided.
r.tokenBeforeConsent = await call(`/live/sessions/${sid}/token`, {
  bearer: TA.bearer,
  body: {camera: false, devicePubKey: DEVICE_PUB},
})
// Part of the sheet only: not admitted, the rest is missing.
r.consentPartial = await call(`/live/sessions/${sid}/consent`, {
  bearer: TA.bearer,
  body: {
    decisions: {ai_process: 'given'},
    textVersion: 'one-app-v1',
    devicePubKey: DEVICE_PUB,
  },
})
// Every kind decided, recording refused ("don't record" is valid), AI processing given.
r.consentAdmitted = await call(`/live/sessions/${sid}/consent`, {
  bearer: TA.bearer,
  body: {
    decisions: {
      record_audio: 'refused',
      record_video: 'refused',
      transcribe: 'given',
      ai_process: 'given',
      remember: 'refused',
    },
    textVersion: 'one-app-v1',
    devicePubKey: DEVICE_PUB,
  },
})
const firstToken = r.consentAdmitted.body.token
const room = claimsOf(firstToken).video.room

// The join: proof of possession, then LiveKit's join path and the backstop.
out.media.joinWithoutProof = await w.media.join(firstToken, room)
// The failed join above revoked that token (fail closed); the owner asks again.
r.tokenAfterRevoke = await call(`/live/sessions/${sid}/token`, {
  bearer: TA.bearer,
  body: {camera: false, devicePubKey: DEVICE_PUB},
})
const joinToken = r.tokenAfterRevoke.body.token
r.proveBadSignature = await call('/live/join/prove', {
  body: {token: joinToken, sig: b64u(new Uint8Array(64))},
})
// A bad proof revokes the token too: once more, then a good proof.
r.tokenForJoin = await call(`/live/sessions/${sid}/token`, {
  bearer: TA.bearer,
  body: {camera: false, devicePubKey: DEVICE_PUB},
})
const goodToken = r.tokenForJoin.body.token
out.proofs.tokenForJoin = sign(goodToken)
r.proveOk = await call('/live/join/prove', {
  body: {token: goodToken, sig: out.proofs.tokenForJoin},
})
// Rev 4: /prove always trades, so the RETURNED token is the one that joins.
out.media.joinAfterProof = await w.media.join(r.proveOk.body.token, room)

// The camera opt-in: a fresh token with CAMERA, proven by the same key, replaces the
// connected owner (the REPLACED rule) without waiting for participant_left.
r.tokenCamera = await call(`/live/sessions/${sid}/token`, {
  bearer: TA.bearer,
  body: {camera: true, devicePubKey: DEVICE_PUB},
})
const cameraToken = r.tokenCamera.body.token
out.proofs.tokenCamera = sign(cameraToken)
r.proveCamera = await call('/live/join/prove', {
  body: {token: cameraToken, sig: out.proofs.tokenCamera},
})
out.media.cameraRejoinWhileHeld = await w.media.join(
  r.proveCamera.body.token,
  room,
)
// Without a device key the same rejoin is a duplicate identity.
r.tokenUnbound = await call(`/live/sessions/${sid}/token`, {
  bearer: TA.bearer,
  body: {camera: true},
})
out.media.unboundRejoinWhileHeld = await w.media.join(
  r.tokenUnbound.body.token,
  room,
)

// The proof EXCHANGE (R2 v2, review bfc09869 M-B(b); always on since rev 4):
// proving trades the proven token for a fresh, proven one returned only to the prover.
// The client joins with the RETURNED token; the traded one never joins.
r.tokenForExchange = await call(`/live/sessions/${sid}/token`, {
  bearer: TA.bearer,
  body: {camera: false, devicePubKey: DEVICE_PUB},
})
const traded = r.tokenForExchange.body.token
out.proofs.tokenForExchange = sign(traded)
r.proveExchange = await call('/live/join/prove', {
  body: {token: traded, sig: out.proofs.tokenForExchange},
})
out.media.joinTradedToken = await w.media.join(traded, room)
out.media.joinExchangedToken = await w.media.join(
  r.proveExchange.body.token,
  room,
)

// Refusals.
r.startNotOwnedAgent = await call('/live/sessions', {
  bearer: TA.bearer,
  body: {agentDid: TB.agentDid},
})
r.startSignedOut = await call('/live/sessions', {body: {agentDid: TA.agentDid}})
r.tokenOtherOwner = await call(`/live/sessions/${sid}/token`, {
  bearer: TB.bearer,
  body: {camera: false},
})
r.endOtherOwner = await call(`/live/sessions/${sid}/end`, {bearer: TB.bearer})

// End, and everything after it.
r.end = await call(`/live/sessions/${sid}/end`, {bearer: TA.bearer})
r.endAgain = await call(`/live/sessions/${sid}/end`, {bearer: TA.bearer})
r.tokenAfterEnd = await call(`/live/sessions/${sid}/token`, {
  bearer: TA.bearer,
  body: {camera: false, devicePubKey: DEVICE_PUB},
})

// The agent's job fails to start (review 679a9d48 N2): a second world whose job
// launcher refuses. The owner is admitted, but `agent` says why there is none.
{
  const env2 = liveEnv()
  const w2 = liveDeps(env2, {
    jobs: {
      starts: [],
      stops: [],
      start: () => Promise.resolve({ok: false}),
      stop: () => Promise.resolve({ok: true}),
    },
  })
  const call2 = async (p, opts) => {
    const res = await handleLive(
      liveRequest(p, opts),
      env2,
      new URL(`https://runtime.test${p}`),
      w2.deps,
    )
    return {status: res.status, body: JSON.parse(await res.text())}
  }
  const st = await call2('/live/sessions', {
    bearer: TA.bearer,
    body: {agentDid: TA.agentDid, devicePubKey: DEVICE_PUB},
  })
  r.consentAgentUnavailable = await call2(
    `/live/sessions/${st.body.sid}/consent`,
    {
      bearer: TA.bearer,
      body: {
        decisions: ALL_GIVEN,
        textVersion: 'one-app-v1',
        devicePubKey: DEVICE_PUB,
      },
    },
  )
}

process.stdout.write(`${JSON.stringify(out, null, 2)}\n`)
