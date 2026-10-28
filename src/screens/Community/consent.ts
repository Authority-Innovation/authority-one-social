/**
 * Join-and-consent logic for `/c/:id/join`, kept apart from the screen so the
 * consent rules can be tested without rendering.
 *
 * Rules this file carries (mockup (d)):
 * - Consent comes first. Nothing here calls `join` unless the person ticked
 *   the consent box.
 * - An invite never counts as consent. Nothing here reads an invite.
 * - The consent row stores the wording version. The version comes from the
 *   community config, and join is offered only when this build ships the copy
 *   for that version. An unknown version fails closed (the app needs an
 *   update) and a missing one is treated as a config that did not load. The
 *   screen never records a version whose wording it did not show.
 * - Re-consent is NOT enforced here. The community config does not say which
 *   version a member accepted before, so this screen cannot ask an existing
 *   member again when the version moves on. That needs a member accepted
 *   version from the runtime door (open item).
 * - The agent grant is a separate call, made only when the person turned the
 *   toggle on. It is never implied by membership.
 */
import {
  type CommunitiesError,
  type Community,
  type CommunityMembership,
  join,
  setAgentGrant,
} from '#/lib/agent-runtime/communitiesClient'

/** The wording version of the consent copy this build ships. */
export const CONSENT_WORDING_VERSION = '1'

/**
 * Consent versions this build has copy for. The screen shows the copy for
 * `CONSENT_WORDING_VERSION` only, so that is the only one listed.
 */
export const SUPPORTED_CONSENT_VERSIONS: readonly string[] = [
  CONSENT_WORDING_VERSION,
]

/**
 * The community config as the join screen reads it. The extra fields are
 * optional display copy; the screen falls back to neutral wording without
 * them.
 */
export type JoinConsentConfig = Community & {
  /** Who runs the community and sponsors its agent, e.g. a show. */
  sponsorName?: string | null
  /** The community agent's display name. */
  agentName?: string | null
  membersOnly?: boolean | null
  rulesText?: string | null
  termsUrl?: string | null
  privacyUrl?: string | null
}

/**
 * The consent version the community config asks for, or null when the config
 * names none. There is no fallback: a missing version is not version 1.
 */
export function consentVersionFor(
  config: Pick<Community, 'consentVersion'> | undefined,
): string | null {
  const v = config?.consentVersion as unknown
  if (typeof v === 'string' && v.trim()) return v.trim()
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
 * Whether the join screen may offer join for this config. Only `ok` may show
 * the consent box and the Agree button.
 */
export function consentGateFor(
  config: Pick<Community, 'consentVersion'> | undefined,
): ConsentGate {
  const version = consentVersionFor(config)
  if (version === null) return {kind: 'missing'}
  if (!isSupportedConsentVersion(version)) {
    return {kind: 'unsupported', version}
  }
  return {kind: 'ok', version}
}

export type JoinOutcome =
  | {ok: true; membership: CommunityMembership; agentGrantFailed: boolean}
  | {ok: false; reason: 'no_consent'}
  | {ok: false; reason: 'unsupported_version'}
  | {ok: false; reason: 'join_failed'; error: CommunitiesError}

export type JoinClient = {
  join: typeof join
  setAgentGrant: typeof setAgentGrant
}

const defaultClient: JoinClient = {join, setAgentGrant}

/**
 * "Agree and join". Joins with the given consent version, which must be one
 * this build has copy for, then sets the agent grant only if the person turned
 * it on. A failed grant does not undo the membership; the person can turn it
 * on later from the community.
 */
export async function agreeAndJoin(
  {
    id,
    consentVersion,
    consented,
    agentGrant,
  }: {
    id: string
    consentVersion: string
    consented: boolean
    agentGrant: boolean
  },
  client: JoinClient = defaultClient,
): Promise<JoinOutcome> {
  if (consented !== true) return {ok: false, reason: 'no_consent'}
  // Belt and braces for the screen's gate: never record a version this build
  // has no copy for.
  if (!isSupportedConsentVersion(consentVersion)) {
    return {ok: false, reason: 'unsupported_version'}
  }
  const joined = await client.join(id, consentVersion)
  if (!joined.ok) {
    return {ok: false, reason: 'join_failed', error: joined.error}
  }
  let agentGrantFailed = false
  if (agentGrant === true) {
    const grant = await client.setAgentGrant(id, true)
    agentGrantFailed = !grant.ok
  }
  return {ok: true, membership: joined.data, agentGrantFailed}
}
