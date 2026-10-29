/**
 * Whether a community item's author is the community's agent (N1, R3).
 *
 * The runtime sends `author: {did, is_agent}` on each item. An item is the
 * agent only when ALL of these hold:
 *   1. `author.is_agent === true` (strictly the boolean),
 *   2. `author.did` is a non-empty string, and
 *   3. it equals the community config's agent DID, which is also non-empty.
 *
 * Anything else is a member: no author, an old item with `did: null`, a
 * different DID, or a community whose config names no agent. The display
 * name, handle and position are never read, so a member can't claim the
 * label by naming themselves after the agent.
 */
function clean(v: unknown): string {
  return typeof v === 'string' ? v.trim() : ''
}

export function isCommunityAgentAuthor(
  author: unknown,
  agentDid: string | null | undefined,
): boolean {
  if (typeof author !== 'object' || author === null) return false
  const {is_agent, did} = author as {is_agent?: unknown; did?: unknown}
  if (is_agent !== true) return false
  const authorDid = clean(did)
  const configDid = clean(agentDid)
  return authorDid.length > 0 && configDid.length > 0 && authorDid === configDid
}

function obj(v: unknown): Record<string, unknown> | undefined {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : undefined
}

function nonEmpty(v: unknown): string | undefined {
  return typeof v === 'string' && v.trim().length > 0 ? v : undefined
}

/**
 * The community config's agent DID, from a runtime community response: the
 * config record's `agent`, then the top-level `agentDid`, then `agent.did`.
 * Undefined when none is set, so callers fail closed. The value is returned
 * as sent; isCommunityAgentAuthor trims before comparing.
 */
export function communityConfigAgentDid(
  community: unknown,
): string | undefined {
  const raw = obj(community)
  if (!raw) return undefined
  return (
    nonEmpty(obj(raw.config)?.agent) ??
    nonEmpty(raw.agentDid) ??
    nonEmpty(obj(raw.agent)?.did)
  )
}
