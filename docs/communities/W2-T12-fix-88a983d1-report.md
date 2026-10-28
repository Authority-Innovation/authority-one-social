# W2-T12 community home: review fix pass (task 88a983d1)

Date: 2026-10-29. Base: `f29459f54`. Branch: `coord/fix-w2-t12-community-home-agent-88a983d1`.
Review: `reviews/W2-T12-community-home-review-2026-10-28.md` (majors 1 to 3). Minors 1 to 6 are not touched.

## Major 1: agent label (commit `962081cf6`)

- `PostsSection.tsx`: a post gets the "◆ Agent" label when `post.author.is_agent === true`. The label no longer depends on an author DID. Mislabelling is the safer failure.
- `CommunityPostAuthor` is unchanged. Nothing in this repo shows that the runtime door sends `author.did` (the T8 client and `groupMirrorClient` carry only the display name and `is_agent`), so I did not add the field.
- The agent card is unchanged. It is driven only by the config (`agent` + `agentSponsor`) and never used a post DID. Because no DID arrives on posts, there is no DID tie-breaker left to keep.
- Tests: the fixture no longer fabricates `did` on the agent post. The label test now asserts a label on an `is_agent: true` post with no DID, and no label on `is_agent: false`. A new test checks that an `is_agent` post is still labelled when the config names no agent.

## Major 2: public tier, option taken: GATED (commit `71207879d`)

- No group-AppView proxy DID is configured anywhere (there is no env key, and `callGroupAppView` still calls the user's PDS agent). I chose not to invent one, so I did not wire the transport.
- `queries.ts` no longer imports `group.ts`. `useCommunityPublicTimelineQuery` and `useCommunityMembersQuery` have been removed.
- For a public-tier community, the Posts tab shows "Posts for this community aren’t available yet." (`communityPublicPostsUnavailable`), and the Members tab shows "The member list isn’t available yet." (`communityPublicMembersUnavailable`). The member count still shows.
- `postsSource()` still returns `'group'`. That keeps `descriptor.test.ts` stable, but the screen no longer acts on that value.
- `group.ts` is unchanged. To turn these reads on: add the proxy env key and `withProxy` in `callGroupAppView`, then restore the hooks.
- Tests: for a public-tier non-member and member, and on the Members route, the not-available state shows. `useGroupTimelineQuery`, `useGroupMembersQuery`, the mocked agent's `call` and `getTimeline` are never called.

## Major 3: account-scoped cache (commit `55a481ef7`)

- `createCommunityQueryKey` and `createCommunityTimelineQueryKey` now take `{id, viewer}`, where `viewer` is `useSession().currentAccount?.did ?? ''`.
- The members timeline is also disabled when no account is signed in.
- Tests use one shared `QueryClient`:
  - Alice (member) is followed by Bob (non-member). Bob never sees Alice's posts or member badge, `getCommunity` is called again, and the cache holds separate `community` entries per DID.
  - Two members: Bob's first render never shows Alice's timeline, and a second `getTimeline` call happens.
  - Signed out: no timeline read.
- Not verified: whether logout clears the query cache. This change closes the risk at the key level instead.

## Tests run

| Run | Suites | Tests |
| --- | --- | --- |
| `src/screens/Community` | 5 passed | 42 passed (was 36 before this pass) |
| Full jest (`f29459f54` + fixes) | 133 passed, 2 failed (135) | 1545 passed, 1 failed, 28 todo |

- The 2 failing suites are the same pre-existing Windows failures the W2-T12 report lists (`withUISceneLifecycle.test.js`, `noBackgroundLocationShipped.test.ts`). I did not change either one.
- `pnpm typecheck` is green. ESLint (lint-staged, on commit) is clean on the changed files. I did not run repo-wide `pnpm lint`.
- I ran the full suite with `jest` directly (the `pnpm test` flags without `--bail`) so that one pre-existing failure would not stop the run. I used pnpm 11.5.2 from the npx cache with Git bash as the script shell.

## Not done / notes

- No proxy wiring, no deploy, no PDS writes, no requestCrawl.
- The spec named `communities/w2-community-home` as the target branch. Under the run rules I pushed only my own task branch. Merging it onto `communities/w2-community-home` is for a human.
