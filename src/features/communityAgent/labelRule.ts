/**
 * The community agent label rule (decision N1).
 *
 * An author is shown as the community's agent only when ALL of these hold:
 *   1. the runtime says so (`author.is_agent === true`),
 *   2. the author's DID equals the community's `agent.did`, and
 *   3. the community carries the runtime's `agentSponsor` view with a DID.
 *
 * Every input is a field the door sends (doorContract.ts): `agent` and
 * `agentSponsor` on the member community response, `author` on the item.
 * The author's handle is never read. A human whose handle sits on the same
 * host as the agent (e.g. `*.pds.authority-one.com`) is a human. An agent
 * with no sponsor view fails closed: it renders as a member, with a warning
 * for the operator.
 *
 * `sponsorHandle` is the sponsor's member id from `agentSponsor.handle`, or
 * empty when the runtime answers null (the sponsor holds no current
 * membership). The UI then shows the agent label with no sponsor name; the
 * DID is never shown in its place.
 */
import {isCommunityAgentAuthor} from '#/features/communities/agentLabel'
import {type CommunityAgentConfig, type CommunityThreadAuthor} from './types'

export type AuthorLabel =
  | {kind: 'agent'; sponsorHandle: string}
  | {kind: 'member'; warning?: 'agent_without_sponsor'}

function clean(v: unknown): string {
  return typeof v === 'string' ? v.trim() : ''
}

export function resolveAuthorLabel(
  author: CommunityThreadAuthor | undefined,
  community: CommunityAgentConfig | null | undefined,
): AuthorLabel {
  // Rules 1 and 2 are the one DID-match rule shared with the feed and the
  // community home.
  if (!isCommunityAgentAuthor(author, community?.agent?.did)) {
    return {kind: 'member'}
  }

  const sponsor = community?.agentSponsor
  if (!clean(sponsor?.did)) {
    return {kind: 'member', warning: 'agent_without_sponsor'}
  }

  // Only the sponsor's own handle. The community name is never substituted:
  // it would name the wrong party as accountable for the agent.
  return {kind: 'agent', sponsorHandle: clean(sponsor?.handle)}
}
