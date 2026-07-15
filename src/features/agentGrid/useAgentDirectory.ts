import {isAgentHandle} from '#/lib/agent-runtime'
import {useOwnedAgentsUnread} from '#/state/queries/agent-conversations'
import {
  useAgentGroupThreadsQuery,
  useLiveAgentKeys,
} from '#/state/queries/agent-threads'
import {useOwnerAgentsQuery} from '#/state/queries/agents'
import {useProfilesQuery} from '#/state/queries/profile'
import {useProfileFollowsQuery} from '#/state/queries/profile-follows'
import {useSession} from '#/state/session'
import {type AgentGridEntry} from './util'

export {useAgentGroupThreadsQuery}

/**
 * The agent directory behind the grid, split into the two sections the nav
 * shows:
 *
 * - OWNED — the /app/agents roster (the only ownership signal the client has;
 *   the runtime resolves ownership server-side from the bearer). Avatar and
 *   display name are enriched from the agents' atproto profiles in one batched
 *   getProfiles read.
 * - CHATTING WITH — agents the user follows but does not own. There is no
 *   runtime roster for this, so it is derived: follows whose handle lives on
 *   the agent PDS (isAgentHandle), minus the owned set. Owners auto-follow
 *   their own agents (ownerAgentAutoFollow), hence the subtraction. Reads the
 *   loaded follows pages only (first page = 50 follows).
 *
 * Live dots come from live threads' rosters (zero extra requests while no
 * room is live).
 */
export function useAgentDirectory(): {
  owned: AgentGridEntry[]
  chattingWith: AgentGridEntry[]
  isLoading: boolean
  /** True when both sections are empty and loading has settled. */
  isEmpty: boolean
} {
  const {currentAccount} = useSession()
  const {data: ownedData, isLoading: ownedLoading} = useOwnerAgentsQuery()
  const ownedAgents = ownedData?.agents ?? []

  const {data: ownedProfiles} = useProfilesQuery({
    handles: ownedAgents.map(agent => agent.did ?? agent.handle),
  })
  const {data: followsData, isLoading: followsLoading} = useProfileFollowsQuery(
    currentAccount?.did,
  )
  const liveKeys = useLiveAgentKeys()
  // Real unread counts from the unified conversations endpoint, per owned
  // agent (non-owned agents are behind the ownership gate -> no counts).
  const {byAgent: unreadCounts} = useOwnedAgentsUnread()

  const isLive = (handle: string, did?: string) =>
    liveKeys.has(handle.toLowerCase()) ||
    (!!did && liveKeys.has(did.toLowerCase()))
  const unreadFor = (handle: string) =>
    unreadCounts.get(handle.toLowerCase()) ?? 0

  const owned: AgentGridEntry[] = ownedAgents.map(agent => {
    const profile = ownedProfiles?.profiles.find(
      p =>
        (agent.did && p.did === agent.did) ||
        p.handle.toLowerCase() === agent.handle.toLowerCase(),
    )
    const did = profile?.did ?? agent.did
    return {
      key: agent.handle.toLowerCase(),
      handle: agent.handle,
      did,
      displayName: profile?.displayName || agent.displayName,
      avatar: profile?.avatar ?? agent.avatar,
      owned: true,
      live: isLive(agent.handle, did),
      paused: agent.paused === true,
      unread: unreadFor(agent.handle),
    }
  })

  const ownedKeys = new Set<string>()
  for (const entry of owned) {
    ownedKeys.add(entry.key)
    if (entry.did) ownedKeys.add(entry.did.toLowerCase())
  }

  const follows = followsData?.pages.flatMap(page => page.follows) ?? []
  const chattingWith: AgentGridEntry[] = []
  const seen = new Set<string>()
  for (const profile of follows) {
    if (!isAgentHandle(profile.handle)) continue
    const key = profile.handle.toLowerCase()
    if (ownedKeys.has(key) || ownedKeys.has(profile.did.toLowerCase())) continue
    if (seen.has(key)) continue
    seen.add(key)
    chattingWith.push({
      key,
      handle: profile.handle,
      did: profile.did,
      displayName: profile.displayName,
      avatar: profile.avatar,
      owned: false,
      live: isLive(profile.handle, profile.did),
      paused: false,
      unread: unreadFor(profile.handle),
    })
  }

  const isLoading = ownedLoading || followsLoading
  return {
    owned,
    chattingWith,
    isLoading,
    isEmpty: !isLoading && owned.length === 0 && chattingWith.length === 0,
  }
}
