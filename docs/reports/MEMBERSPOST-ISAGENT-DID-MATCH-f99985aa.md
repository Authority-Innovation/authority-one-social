# membersPost isAgent DID-match + community README (task f99985aa)

Base: `communities/integration` at `d6f45e754`. Branch:
`coord/app-minors-memberspost-isagent-d-f99985aa`. No merge, no flag change.

## Changes

1. `src/features/communities/membersPost.ts`
   - `membersPostToFeedViewPost` takes an optional fourth argument, `agentDid`
     (the community config's agent DID).
   - `isAgent` is now `isCommunityAgentAuthor(post.author, agentDid)`, the same
     rule as `agentLabel.ts`: `is_agent === true` AND a non-empty `author.did`
     equal to the non-empty config agent DID.
   - `getMembersPostRef` (~L128) only passes through the `isAgent` already
     computed by the mapper, so it needed no logic change.
2. `src/lib/api/feed/communities.ts` (the only production caller)
   - `membersTierFetcher` cannot know the config agent DID: `CommunityFeedSource`
     carries only `id`, `name`, `tier`. It therefore passes no DID, and **every
     members-tier feed view gets `isAgent: false`**. A comment says so. Wiring
     the DID in means adding it to `CommunityFeedSource` (not done here - out of
     scope).
3. `src/screens/Community/README.md` - the label rule now states the DID-match
   rule (is_agent true AND author.did equals the config agent DID; did null, a
   different DID, or no config DID renders no label).
4. Optional item 3 (descriptor fallback): the config does NOT always provide the
   agent DID - `toDescriptor` uses `config.agent`, then top-level `agentDid`,
   then `agent.did`, and `descriptor.test.ts` covers the fallbacks. Code left as
   is; the fallback order is documented in the README. Matching stays DID-only.

## Tests

`src/features/communities/__tests__/membersPost.test.ts`:
- matching DID + is_agent true -> isAgent true; is_agent false -> false
- **is_agent true with a non-matching DID -> isAgent false** (requested test)
- is_agent true with did null, and with no config agent DID -> false
- the read-tracking test now allows `author.did`

Jest (run in this worktree after `pnpm install --offline`):
- `src/features/communities src/screens/Community`: 12 suites, 170 tests, all pass.
- Plus `src/lib/api/feed` and `MembersPostControls.test.tsx`: 14 suites, 188 tests, all pass.

## Not run / caveats

- `pnpm typecheck` and full `pnpm lint` were not run. ESLint on the touched
  files reports `no-unsafe-member-access` errors; they come from a pre-existing
  problem: `CommunityPost` / `CommunityPostAuthor` are imported from
  `#/lib/agent-runtime/communitiesClient` but that module does not export them
  (it exports `CommunityItem`). Base had the same errors in these files
  (membersPost.ts 9 -> 9, communities.ts 5 -> 5); the test file went 4 -> 6
  only because the new tests read `POST.author`. Not fixed here.
- Related drift: `getTimeline` returns `items` (`CommunityItem`, no `author`
  object), while `membersTierFetcher` reads `res.data.posts`. Not in scope.
- The offline install's postinstall (`intl:compile-if-needed`) failed because
  `pnpm` is not on PATH for lifecycle scripts; jest did not need it.
