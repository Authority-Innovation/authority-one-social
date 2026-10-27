/**
 * Join-and-consent logic for `/c/:id/join`, kept apart from the screen so the
 * consent rules can be tested without rendering.
 *
 * Rules this file carries (mockup (d)):
 * - Consent comes first. Nothing here calls `join` unless the person ticked
 *   the consent box.
 * - An invite never counts as consent. Nothing here reads an invite.
 * - The consent row stores the wording version. The version comes from the
 *   community config, so a later version that shares more asks again.
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
 * The consent version the person agrees to: the one the community config
 * asks for, or this build's wording version when the config names none.
 */
export function consentVersionFor(
  config: Pick<Community, 'consentVersion'> | undefined,
): string {
  const v = config?.consentVersion as unknown
  if (typeof v === 'string' && v.trim()) return v.trim()
  if (typeof v === 'number' && Number.isFinite(v)) return String(v)
  return CONSENT_WORDING_VERSION
}

export type JoinOutcome =
  | {ok: true; membership: CommunityMembership; agentGrantFailed: boolean}
  | {ok: false; reason: 'no_consent'}
  | {ok: false; reason: 'join_failed'; error: CommunitiesError}

export type JoinClient = {
  join: typeof join
  setAgentGrant: typeof setAgentGrant
}

const defaultClient: JoinClient = {join, setAgentGrant}

/**
 * "Agree and join". Joins with the given consent version, then sets the agent
 * grant only if the person turned it on. A failed grant does not undo the
 * membership; the person can turn it on later from the community.
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
