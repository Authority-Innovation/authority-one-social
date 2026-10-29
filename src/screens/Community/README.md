# Community home (`/c/:id`, `/c/:id/members`)

Dark behind `EXPO_PUBLIC_COMMUNITIES_ENABLED` (default off). With the flag off
a deep link lands on Home (`linking.ts`), an in-app push is sent to Home, and
nothing is fetched.

## Files

- `index.tsx` - the two route screens. Both render `CommunityHome`; the
  Members route opens on the Members tab.
- `descriptor.ts` - turns the runtime's `getCommunity` response (plus the
  `com.authorityone.community.config` record, if the runtime returns it under
  `config`) into a `CommunityDescriptor`. `postsSource()` decides where posts
  are read from.
- `queries.ts` - TanStack Query hooks. No writes.
- `roster.ts` - pure helpers that turn the runtime's thread rosters into the
  Members tab's rows.
- `components/` - header, agent card, posts, members, and two slots for work
  owned by other tasks (`JoinConsentEntry` for T9, `CommunityComposerEntry`
  for T17).

## Rules this screen keeps

- Members-tier posts are read only through `communitiesClient.getTimeline`,
  and only when the runtime says the caller is a member. A non-member gets
  placeholder rows and no read. An unknown tier is treated as members-only.
- Public-tier posts and members are not read yet. They belong to the group
  AppView, but `group.ts` still calls the user's PDS agent (its group-AppView
  proxy is a TODO), so the screen shows a "not available yet" state and makes
  no call. Wire the proxy in `group.ts` before turning these reads on.
- The accent colour is applied inside `CommunityHeader` only (N3). It must be
  a CSS hex colour or it is dropped.
- The agent card renders whenever the community names an agent DID. Its
  sponsor line is "AI agent · run by <handle>" only when the runtime sends
  `agentSponsor: {did, handle}` with a handle (read defensively; a bare DID
  string is also accepted as the sponsor DID). Otherwise it is just "AI
  agent": never the sponsor DID, never the community name.
- A member's own settings (today the community agent's grant row) sit in a
  "Your settings" section of their own, not inside the agent card.
- A post is labelled as the agent only when the
  runtime's `is_agent` is true AND `author.did` equals the community config's
  agent DID (`isCommunityAgentAuthor` in `features/communities/agentLabel.ts`).
  An item with `did: null`, a different DID, or a community with no agent DID
  renders no label. Display name and handle are never read. The agent DID is
  `config.agent`, falling back to the community's top-level `agentDid`, then
  `agent.did` (`toDescriptor` in `descriptor.ts`); the match is still on DID
  only. Members-tier feed views (`membersPost.ts`) use the same rule, and are
  never marked as the agent when the mapper has no agent DID.
- The composer entry (`CommunityComposerEntry`) sits inside the scroll
  content under the header, for members only. It opens the composer with its
  target fixed to this community and tier, never the PDS.
- After "Launch community agent" succeeds, the home refetches the community
  (and the grant) so the agent card and the grant row appear without a
  reload. The launch response itself carries no community.
- The Members tab, for a member of a walled community, lists the people in
  the runtime's thread rosters (`GET /app/communities/:id/posts/:postId/roster`)
  for the top-level posts already loaded, merged by id, with the community
  agent last. The runtime has no community-wide member list, so someone who
  has not posted in a loaded thread is not listed. Member entries carry no DID;
  their id is the account handle, which is what the profile cache is asked
  for. The agent label goes only to an `is_agent` entry whose DID is the
  config's agent DID. ADMIN is shown only where the app already knows it: the
  signed-in member when the runtime said `viewer_is_admin`, and the agent's
  sponsor (`agentSponsor.handle`; only an admin can launch).
