/**
 * Response shapes of piece 1's /live routes (runtime branch
 * coord/fix-top-priority-agent-live-piec-a9c94a0f @ 6302e102,
 * src/live/tenant/live-routes.js):
 *
 *   POST /live/sessions            -> reply({sid, region, wsUrl, token,
 *                                     expiresAt, consentRequired,
 *                                     recordPolicy, reused})   (line ~232)
 *   POST /live/sessions/:sid/token -> reply({token, expiresAt}) (line ~285)
 *   POST /live/sessions/:sid/end   -> reply({ok: true})
 *
 * NOT captured from deploy/dev-communities: at cca6020d that branch has no
 * /live route. Field names and types are piece 1's; the values follow its
 * own test fixtures (region `r1`, wss://media.region-one.test, CONSENT_KINDS,
 * recordPolicy 'off', SID_RE `ls_` + 26 Crockford base32). Re-capture from
 * Dev once the route lands there.
 */
export const SESSION_FIXTURE = {
  sid: 'ls_01JBX8M4Q2T7V9WZ3K5N6P8R0S',
  region: 'r1',
  wsUrl: 'wss://media.region-one.test',
  token: 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJvd25lcjpsc18wMUpCWDhNNFEyVDdWOVdaM0s1TjZQOFIwUzpvazEifQ.c2lnbmF0dXJl',
  expiresAt: 1793330100,
  consentRequired: [
    'record_audio',
    'record_video',
    'transcribe',
    'ai_process',
    'remember',
  ],
  recordPolicy: 'off',
  reused: false,
}

export const CAMERA_TOKEN_FIXTURE = {
  token: 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJvd25lcjpsc18wMUpCWDhNNFEyVDdWOVdaM0s1TjZQOFIwUzpvazEiLCJjYW0iOnRydWV9.Y2FtZXJh',
  expiresAt: 1793330400,
}

export const END_FIXTURE = {ok: true}

/** The agent the owner goes live with. */
export const AGENT_DID = 'did:plc:agentbob7xq4m2kz5w3n'
export const AGENT_HANDLE = 'bob.pds.authority-one.com'

/** The signed-in owner. Must never leave the app in a /live request. */
export const OWNER_DID = 'did:plc:owner3vk9t2r7h6mjd4qa'
