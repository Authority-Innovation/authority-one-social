/**
 * The community agent label rule (decision N1).
 *
 * An author is shown as the community's agent only when ALL of these hold:
 *   1. the community response carries `agent: {did, is_agent: true}`,
 *   2. the runtime marks the item's author as the agent
 *      (`author.is_agent === true`), and
 *   3. the author's DID equals the community's `agent.did`.
 *
 * These are the fields the deployed door sends (doorContract.ts): `agent` on
 * the community response (null or absent when there is no valid agent slot)
 * and `author` on each timeline item. The author's handle is never read. A
 * human whose handle sits on the same host as the agent (e.g.
 * `*.pds.authority-one.com`) is a human.
 *
 * `agentSponsor` is NOT required: the deployed door does not send it. When a
 * runtime does send it, `sponsorHandle` is its `handle` (the sponsor's member
 * id), else empty, and the UI shows the agent label with no sponsor name. The
 * sponsor's DID is never shown in its place.
 */
import {isCommunityAgentAuthor} from '#/features/communities/agentLabel'
import {type CommunityAgentConfig, type CommunityThreadAuthor} from './types'

export type AuthorLabel =
  | {kind: 'agent'; sponsorHandle: string}
  | {kind: 'member'}

function clean(v: unknown): string {
  return typeof v === 'string' ? v.trim() : ''
}

export function resolveAuthorLabel(
  author: CommunityThreadAuthor | undefined,
  community: CommunityAgentConfig | null | undefined,
): AuthorLabel {
  const agent = community?.agent
  if (agent?.is_agent !== true) return {kind: 'member'}
  // Rules 2 and 3 are the one DID-match rule shared with the feed and the
  // community home.
  if (!isCommunityAgentAuthor(author, agent.did)) return {kind: 'member'}

  // Only the sponsor's own handle. The community name is never substituted:
  // it would name the wrong party as accountable for the agent.
  return {kind: 'agent', sponsorHandle: clean(community?.agentSponsor?.handle)}
}
