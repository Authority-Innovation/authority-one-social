/**
 * Join-and-consent logic for `/c/:id/join`, kept apart from the screen so the
 * consent rules can be tested without rendering.
 *
 * Rules this file carries (mockup (d)):
 * - Joining is open: anyone can join, with no invite and no approval. An
 *   admission rule, if one is ever added, belongs in `consentGateFor` and
 *   `agreeAndJoin`, the one path every join takes. The door can still refuse.
 * - Consent comes first. Nothing here calls `join` unless the person ticked
 *   the consent box.
 * - The consent row stores the wording version. The version is the door's
 *   join-info `wording_version` (GET /:id/join-info, the one community route a
 *   non-member reaches), and join is offered only when this build ships the
 *   copy for that version. An unknown version fails closed (the app needs an
 *   update) and a missing one is treated as a config that did not load. The
 *   screen never records a version whose wording it did not show.
 * - Re-consent is NOT enforced here. The community config does not say which
 *   version a member accepted before, so this screen cannot ask an existing
 *   member again when the version moves on. That needs a member accepted
 *   version from the runtime door (open item).
 * - The agent grant is not part of joining. It gives the community's agent
 *   access to the person's content, and join-info cannot say whether a
 *   community has an agent, so it is offered only on the community home once
 *   the person is a member (AgentGrantRow). Version 2 of the wording says so;
 *   version 1 offered a toggle that named the person's own agent, which the
 *   grant never touched.
 */
import {
  type CommunitiesError,
  type CommunityJoinInfo,
  type CommunityJoinResult,
  join,
} from '#/lib/agent-runtime/communitiesClient'

/** The wording version of the consent copy this build ships. */
export const CONSENT_WORDING_VERSION = '2'

/**
 * Consent versions this build has copy for. The screen shows the copy for
 * `CONSENT_WORDING_VERSION` only, so that is the only one listed.
 */
export const SUPPORTED_CONSENT_VERSIONS: readonly string[] = [
  CONSENT_WORDING_VERSION,
]

/**
 * The consent wording version join-info asks for, or null when it names none
 * (`wording_version: null`). There is no fallback: a missing version is not
 * version 1.
 */
export function consentVersionFor(
  info: Pick<CommunityJoinInfo, 'wording_version'> | undefined,
): string | null {
  const v = info?.wording_version as unknown
  if (typeof v === 'number' && Number.isFinite(v)) return String(v)
  return null
}

export function isSupportedConsentVersion(version: string | null): boolean {
  return version !== null && SUPPORTED_CONSENT_VERSIONS.includes(version)
}

export type ConsentGate =
  | {kind: 'ok'; version: string}
  | {kind: 'missing'}
  | {kind: 'unsupported'; version: string}

/**
 * Whether the join screen may offer join for this join-info. Only `ok` may show
 * the consent box and the Agree button.
 */
export function consentGateFor(
  info: Pick<CommunityJoinInfo, 'wording_version'> | undefined,
): ConsentGate {
  const version = consentVersionFor(info)
  if (version === null) return {kind: 'missing'}
  if (!isSupportedConsentVersion(version)) {
    return {kind: 'unsupported', version}
  }
  return {kind: 'ok', version}
}

export type JoinOutcome =
  | {ok: true; membership: CommunityJoinResult}
  | {ok: false; reason: 'no_consent'}
  | {ok: false; reason: 'unsupported_version'}
  | {ok: false; reason: 'refused'}
  | {ok: false; reason: 'join_failed'; error: CommunitiesError}

export type JoinClient = {
  join: typeof join
}

const defaultClient: JoinClient = {join}

/**
 * The door answered and said no, so trying again won't help. 408 and 429 are
 * 4xx but do clear on a retry. 401 never gets here (the client reads it as
 * `signed_out`).
 */
function isJoinRefusal(error: CommunitiesError): boolean {
  return (
    error.kind === 'http' &&
    error.status >= 400 &&
    error.status < 500 &&
    error.status !== 408 &&
    error.status !== 429
  )
}

/**
 * "Agree and join". Joins with the given consent version, which must be one
 * this build has copy for.
 */
export async function agreeAndJoin(
  {
    id,
    consentVersion,
    consented,
  }: {
    id: string
    consentVersion: string
    consented: boolean
  },
  client: JoinClient = defaultClient,
): Promise<JoinOutcome> {
  if (consented !== true) return {ok: false, reason: 'no_consent'}
  // Belt and braces for the screen's gate: never record a version this build
  // has no copy for.
  if (!isSupportedConsentVersion(consentVersion)) {
    return {ok: false, reason: 'unsupported_version'}
  }
  // The door's join takes the version as a number (communitiesClient.join
  // refuses anything else); supported versions are numeric strings.
  const joined = await client.join(id, Number(consentVersion))
  if (!joined.ok) {
    return isJoinRefusal(joined.error)
      ? {ok: false, reason: 'refused'}
      : {ok: false, reason: 'join_failed', error: joined.error}
  }
  // A 2xx can still say no, and must not welcome someone who isn't in.
  if (joined.data.joined !== true) return {ok: false, reason: 'refused'}
  return {ok: true, membership: joined.data}
}
