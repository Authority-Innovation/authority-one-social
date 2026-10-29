# Community home polish 1 (task d0d43e8f)

Branch `coord/community-home-polish-1-author-n-d0d43e8f`, based on
`communities/integration` at d98a57893. Not merged. No flag, eas.json or
build-number change.

## What changed

- `src/screens/Community/components/MemberPostRow.tsx` (new; extracted from
  `PostsSection.tsx`):
  - **Name and avatar** come from the app's profile cache, `useProfileQuery`
    (query key `['profile', actor]`, with the unstable profile-view cache as
    placeholder). The actor is the author DID, else the handle (`authorId` on
    the door's items is a handle). The name is the profile's display name; if
    there is none, or the profile is not cached/resolvable, it falls back to
    `@handle`, then the item's own name (legacy `displayName`), then the DID.
    The avatar is the profile's, else the item's.
  - **Agent label** unchanged: `isCommunityAgentAuthor(post.author, agentDid)`
    (is_agent === true AND author.did equals the config agent DID). The
    profile is never consulted for it.
  - **Timestamp** uses `TimeElapsed` (the same `useGetTimeAgo` formatter as
    the main feed's `PostMeta`: "now", "5m", "2h", "3d", then a short date).
    The full date ("October 29, 2026 at 7:18 PM") is the accessibility
    label. The name is `flex_shrink` so a long name truncates, not the time.
- `src/screens/Community/memberRows.ts`: rows also carry `authorHandle` and
  `authorActor`; `authorName` falls back to the DID last.
- `src/screens/Community/components/PostsSection.tsx`: uses the new row.

## Tests

New `src/screens/Community/components/__tests__/MemberPostRow.test.tsx`
(stub profile cache via a mocked `useProfileQuery`):

- renders the display name and avatar resolved from the profile cache
- looks the profile up by handle when the item has no author did
- falls back to the handle when the profile is not cached
- falls back to the handle when the cached profile has no display name
- shows the agent label for an is_agent author whose did matches the config agent
- shows no agent label when the did does not match, even with is_agent and the agent name
- shows no agent label for a member row or when the community names no agent
- renders the short relative time, not a date string ("· 2h", "· 3d")
- keeps the full date for screen readers
- renders no time for an item without a valid createdAt

`CommunityScreen.test.tsx`: `useProfileQuery` mocked to "nothing cached";
the One Dev 38 real-payload test now expects `@member.example.test`.

## What was run

The worktree had no `node_modules`; jest/eslint/tsc ran through a junction
to `C:\ao\worktrees\03067be4-app-agent-label-from-aut\node_modules`
(read-only use; the junction is gitignored). Commands were the underlying
binaries (`NODE_ENV=test jest --forceExit --testTimeout=20000 ...`), since
`pnpm` is not on PATH here.

- jest `src/screens/Community src/features/communities src/features/communityAgent src/lib/agent-runtime src/lib/api/feed`:
  **48/48 suites, 733/733 tests passed** (before the final lint-only commit);
  `src/screens/Community` re-run at head: 9/9 suites, 100/100 tests.
- eslint on the changed files: 0 errors (one `import()` type warning in the
  test's mock factory, the same pattern as `CommunityScreen.test.tsx`).
- tsc (`tsc --noEmit`, not `tsgo`): no errors in the new/changed code. 213
  errors repo-wide are pre-existing (for example `CommunityPost` missing in
  `membersPost.ts`, legacy `posts` fakes in `CommunityScreen.test.tsx`).
- Full `pnpm test` suite: not run.

## Notes / assumptions

- `useProfileQuery` fetches `getProfile` through the user's agent when the
  profile is not cached; a failure (for example an agent DID with no
  network profile) just leaves the handle fallback.
- Not checked on a device.
