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
