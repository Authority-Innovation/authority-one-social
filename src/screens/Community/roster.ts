/**
 * Pure: no React, no I/O. The Members tab's rows, built from the runtime's
 * thread rosters (GET /app/communities/:id/posts/:postId/roster).
 *
 * The runtime has no community-wide member list. Its roster is per thread:
 * the member authors of one post and its replies (`{id: memberId, did: null,
 * is_agent: false}`, the member id being the account handle) plus the
 * community agent (`{id: 'community-agent', did, is_agent: true}`). The tab
 * merges the rosters of the threads already loaded.
 */
import {type CommunityRosterEntry} from '#/lib/agent-runtime/communitiesClient'

export type RosterRow = {
  id: string
  /** What the row looks the profile up by: the DID, else the handle. */
  actor?: string
  /** The member's handle, when the roster id is one. */
  handle?: string
  isAgent: boolean
  isAdmin: boolean
}

function str(v: unknown): string | undefined {
  return typeof v === 'string' && v.trim().length > 0 ? v : undefined
}

/**
 * The ids of the top-level posts in the loaded timeline pages, newest first.
 * Reads the door's `{items}` pages, and a legacy `{posts}` page.
 */
export function topLevelPostIds(pages: unknown, max = 20): string[] {
  if (!Array.isArray(pages)) return []
  const ids: string[] = []
  for (const page of pages) {
    if (typeof page !== 'object' || page === null) continue
    const p = page as {items?: unknown; posts?: unknown}
    const list = Array.isArray(p.items)
      ? p.items
      : Array.isArray(p.posts)
        ? p.posts
        : []
    for (const item of list) {
      if (typeof item !== 'object' || item === null) continue
      const it = item as Record<string, unknown>
      const id = str(it.id)
      if (!id || str(it.parentId) || ids.includes(id)) continue
      ids.push(id)
      if (ids.length >= max) return ids
    }
  }
  return ids
}

/**
 * One row per roster id across every thread, members first in roster order
 * and the community agent last. The agent label is given only to an
 * `is_agent` entry whose DID is the config's agent DID; any other `is_agent`
 * entry is dropped rather than shown as a person. ADMIN is shown only where
 * the app already knows it: the signed-in member when the runtime said
 * `viewer_is_admin`, and the agent's sponsor (only an admin can launch).
 */
export function toRosterRows(
  rosters: CommunityRosterEntry[][],
  {
    agentDid,
    viewerHandle,
    viewerIsAdmin = false,
    sponsorHandle,
  }: {
    agentDid?: string
    viewerHandle?: string
    viewerIsAdmin?: boolean
    sponsorHandle?: string
  },
): RosterRow[] {
  const members: RosterRow[] = []
  let agent: RosterRow | undefined
  const seen = new Set<string>()
  const admins = new Set<string>()
  if (viewerIsAdmin && viewerHandle) admins.add(viewerHandle.toLowerCase())
  if (sponsorHandle) admins.add(sponsorHandle.toLowerCase())

  for (const roster of rosters) {
    for (const entry of roster) {
      const id = str(entry.id)
      if (!id) continue
      if (entry.is_agent) {
        if (!agent && agentDid && entry.did === agentDid) {
          agent = {
            id,
            actor: agentDid,
            isAgent: true,
            isAdmin: false,
          }
        }
        continue
      }
      if (seen.has(id)) continue
      seen.add(id)
      const did = str(entry.did)
      const handle = id.startsWith('did:') ? undefined : id
      members.push({
        id,
        actor: did ?? id,
        handle,
        isAgent: false,
        isAdmin: !!handle && admins.has(handle.toLowerCase()),
      })
    }
  }
  return agent ? [...members, agent] : members
}
