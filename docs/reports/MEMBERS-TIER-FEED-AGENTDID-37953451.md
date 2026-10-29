# Members-tier feed passes agentDid; one DID-match rule (task 37953451)

Base: `communities/integration` at `e743c2cfd` (branch head `0e9a11931`).
Branch: `coord/members-tier-feed-passes-agentdi-37953451`. No merge, no flag change.

## Commits

- `2fa9b6c39` fix(communities): members-tier feed passes the config agent DID; labelRule uses isCommunityAgentAuthor
- `9462c4469` test(communities): members-tier agent label cases; labelRule/agentLabel agreement
- (this report)

## What changed

1. **Where the DID comes from.** `communityConfigAgentDid(community)` is new in
   `src/features/communities/agentLabel.ts`. It reads `config.agent`, then
   `agentDid`, then `agent.did`, the same order as before, and returns
   undefined when none is set. `src/screens/Community/descriptor.ts` now calls
   it instead of keeping its own copy, so the community home and the feed read
   the DID from the same place.
2. **Members-tier feed** (`src/lib/api/feed/communities.ts`).
   `CommunityFeedSource` has an optional `agentDid`.
   - Combined feed: `resolveMyCommunitySources` sets `agentDid` on each
     members source from its `listMyCommunities` entry.
   - Single community (`community|<id>` via `createCommunityFeedAPI`): only
     the id is known there, so the members fetcher calls
     `communitiesClient.getCommunity(id)` once per fetcher (once per refresh)
     to get the DID. This runs alongside the timeline request. A source that
     already has an `agentDid` key, even one set to `undefined`, skips the
     lookup.
   - Fails closed: if there is no DID, `getCommunity` returns `!ok`, or it
     throws, the DID is undefined and no post is marked `isAgent`.
   - The members tier still never touches the agent (PDS or AppView). The
     existing zero-agent-calls tests still pass.
3. **One rule.** `src/features/communityAgent/labelRule.ts` no longer has its
   own DID comparison; it calls `isCommunityAgentAuthor`. The sponsor check
   (no `agentSponsor` means member, with the `agent_without_sponsor` warning)
   stays in `labelRule`. That check is for the thread label only and is not
   part of the DID-match rule.

## Tests

- `src/lib/api/feed/__tests__/communities.test.ts`, new describe block: a
  matching DID gives `isAgent` true; the `config.agent` > `agentDid` >
  `agent.did` order; a non-matching or null author DID shows no label; a
  missing or blank config DID shows no label; the single-community feed looks
  the DID up once via `getCommunity` and makes zero agent calls; a
  `getCommunity` that fails, throws, or returns no DID fails closed.
- `src/features/communityAgent/__tests__/labelRule.test.ts` (new): a table of
  8 author shapes by 7 config DID values. For every pair it checks that
  `resolveAuthorLabel(...).kind === 'agent'` equals
  `isCommunityAgentAuthor(...)` when a sponsor is present. It also covers the
  null/undefined config case and the case where the DID matches but there is
  no sponsor.
- `src/features/communities/__tests__/agentLabel.test.ts`: tests for
  `communityConfigAgentDid`.

Jest (same flags as `pnpm test` minus `--bail`), run per directory:

| Directory | Suites | Tests |
| --- | --- | --- |
| src/features/communities | 6 passed | 92 passed |
| src/features/communityAgent | 3 passed | 83 passed |
| src/lib/api/feed | 1 passed | 19 passed |
| src/screens/Community | 6 passed | 80 passed |

All four together: 16 suites, 274 tests, all passed. I did not run the full
repo suite.

## Environment notes and caveats

- `pnpm` is not on PATH and this worktree had no `node_modules`. I ran jest,
  eslint, prettier and tsgo with `node` through an untracked `node_modules`
  junction to worktree `1c9f639f-app-community-launch-con`, which has an
  identical `pnpm-lock.yaml`. The junction is not committed.
- **Typecheck already fails on the base branch.** `tsgo --project
  tsconfig.check.json` reports 138 errors. They come from the current
  `communitiesClient.ts` types: `CommunityPost` and `CommunityPostAuthor` are
  no longer exported, `CommunityTimelinePage` has `items` instead of `posts`,
  and `Community` has no `role` or `memberCount`. These hit `membersPost.ts`,
  `communities.ts`, `communityAgent/types.ts`, `descriptor.ts`, the switcher,
  composer submit, and other files. None of them come from this change. For
  the same reason, eslint reports `no-unsafe-*` on the pre-existing
  `res.data.posts.filter(...).map(...)` lines in `communities.ts`. Fixing the
  client/consumer type mismatch is out of scope here and should be its own
  task.
- Assumption: looking the DID up with `getCommunity` for the single-community
  feed is acceptable. It is a door call, not an agent call, made once per
  refresh. The alternative was to leave that feed always unlabelled, because
  its descriptor holds only the id.
