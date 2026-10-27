/**
 * The community agent label rule (decision N1).
 *
 * An author is shown as the community's agent only when ALL of these hold:
 *   1. the runtime says so (`author.is_agent === true`),
 *   2. the author's DID equals the community config's `agent` DID, and
 *   3. the community config names an `agentSponsor`.
 *
 * The handle is never read. A human whose handle sits on the same host as the
 * agent (e.g. `*.pds.authority-one.com`) is a human. An agent with no sponsor
 * fails closed: it renders as a member, with a warning for the operator.
 */
import {type CommunityAgentConfig, type CommunityThreadAuthor} from './types'

export type AuthorLabel =
  | {kind: 'agent'; sponsorName: string}
  | {kind: 'member'; warning?: 'agent_without_sponsor'}

function clean(v: string | null | undefined): string {
  return typeof v === 'string' ? v.trim() : ''
}

export function resolveAuthorLabel(
  author: CommunityThreadAuthor,
  community: CommunityAgentConfig | null | undefined,
): AuthorLabel {
  if (author.is_agent !== true) return {kind: 'member'}

  const agentDid = clean(community?.agentDid)
  const authorDid = clean(author.did)
  if (!agentDid || !authorDid || authorDid !== agentDid) {
    return {kind: 'member'}
  }

  if (!clean(community?.agentSponsor)) {
    return {kind: 'member', warning: 'agent_without_sponsor'}
  }

  const sponsorName =
    clean(community?.agentSponsorName) || clean(community?.name)
  return {kind: 'agent', sponsorName}
}
