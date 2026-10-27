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
- `components/` - header, agent card, posts, members, and two slots for work
  owned by other tasks (`JoinConsentEntry` for T9, `CommunityComposerEntry`
  for T17).

## Rules this screen keeps

- Members-tier posts are read only through `communitiesClient.getTimeline`,
  and only when the runtime says the caller is a member. A non-member gets
  placeholder rows and no read. An unknown tier is treated as members-only.
- Public-tier communities read through `group.ts` (codegen types).
- The accent colour is applied inside `CommunityHeader` only (N3). It must be
  a CSS hex colour or it is dropped.
- The agent card renders only when the config has both `agent` and
  `agentSponsor` (N1). A post is labelled as the agent only when the runtime's
  `is_agent` is set and the author DID matches the config's agent DID.
- No composer opens from here until T17 wires one whose target is fixed to
  the community. The ordinary composer would publish to the PDS.
