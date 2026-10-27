# Communities W2-T10: combined feed adapter (task 0c775985)

- **Branch:** `communities/w2-combined-feed`
- **PR:** draft, against `fix/ao-uiscene-lifecycle` (the build line at `569b3b240`). Never merge; a separate reviewer reviews before ready.
- **Base:** the worktree started at `571924785` (old `main`). I reset the branch, before any of my work and before the first push, to the build line `569b3b240`. Then I merged in, with merge commits:
  - `c20cdf753`: T1 `coord/communities-w1-t1-flags-routes-f-df17dfda` (head `345180401`)
  - `86d248f28`: T2 `coord/communities-w1-t2-lexicon-codege-98e02647` (head `a91aa567a`)
  - `43fb2d86e`: T8 `coord/communities-w1-t8-communities-cl-f45195a0` (head `d52f1bd82`)
  - The only conflict in each merge was `AUTONOMOUS-LOG.md`, where two branches had each added the file. I kept both entries.
- **T10 commits:** `255fa51bd` (adapter, view, guard, cache), `98b93f839` (UI wiring), `fe9d2f220` and `f25848f2d` (tests), then the docs commit.

## What changed

| File | Change |
| --- | --- |
| `src/state/queries/post-feed.ts` | The `FeedDescriptor` union gets `'communities'` and `` `community\|${string}` ``. `createApi` (now exported) sends `communities` to `CommunitiesMergeFeedAPI` and `community\|<id>` to one community. With the flag off, either descriptor returns `EmptyFeedAPI`, which makes no network call. `RQKEY` puts community descriptors under their own root, `community-feed`. The new `feedQueryKey` adds `{accountDid}` to community keys. `FeedParams.communitySources` is optional. |
| `src/lib/api/feed/communities.ts` (new) | `CommunitiesMergeFeedAPI`, modelled on `merge.ts`. Sources are Following (`FollowingFeedAPI`) plus one per community. Public tier uses `com.authorityone.group.getTimeline` through `group.ts`. Members tier uses `communitiesClient.getTimeline`. Each source keeps its own queue and cursor, and each top-up is one request per source. The merge is a reverse-chron k-way merge. It stops while a source that has more to give is empty, so order holds across pages. A failing source is dropped and does not fail the feed. `resolveMyCommunitySources` is used when no sources are passed: runtime `listMyCommunities` for the members tier, AppView `getMemberships` (active only) for the public tier. Also `createCommunityFeedAPI` and `EmptyFeedAPI`. |
| `src/state/queries/group.ts` | New `fetchGroupTimeline` and `fetchGroupMemberships` (plain functions on the existing `callGroupAppView` transport). Types come from codegen (T2). `useGroupTimelineQuery` now uses `fetchGroupTimeline`. |
| `src/features/communities/membersPost.ts` (new) | Maps a members-tier `CommunityPost` to a `FeedViewPost`-shaped view with the synthetic uri `ao-community://<id>/<postId>`. `cid` and `author.did` are synthetic and are not a DID. `embeddingDisabled: true`. The agent flag comes from `is_agent` (N1). The community badge is a `ReasonCommunity` in the `__source` slot that the feed tuner already reads into `slice.reason`. |
| `src/features/communities/postActionGuard.ts` (new) | The one guard, `guardPostAction(post, action)`, which returns `allow`, `disabled` or `door`. The table is below. |
| `src/features/communities/cache.ts` (new) | `COMMUNITY_FEED_RQKEY_ROOT`, `removeCommunityQueries`, `useRemoveCommunityQueriesOnAccountSwitch` and `<CommunityCacheGuard>`. |
| `src/features/communities/feedDescriptors.ts` (new) | `isCommunityFeedDescriptor`, `communityIdFromDescriptor`, and `getOfferedCommunityFeedDescriptors(ids, enabled = COMMUNITIES_ENABLED)`, which returns `[]` when the flag is off. This is the hook point T11's switcher should use. |
| `src/lib/react-query.tsx` | `community-feed` is added to `NEVER_PERSIST_QUERY_ROOTS`, so members content stays in memory only. `<CommunityCacheGuard>` is mounted inside the per-DID provider. |
| `src/components/PostControls/index.tsx` | `PostControls` branches on `isMembersPostUri`. Members items get `MembersPostControls`: reply routes to the door, and the like count is shown disabled. Bookmark, share menu, post menu and repost/quote are not rendered. The normal controls are unchanged (renamed internally to `AtprotoPostControls`). |
| `src/view/com/posts/PostFeedItem.tsx` | For members items: the item link goes to the door (`/c/<id>`) instead of building an `AtUri`. Without this it would throw. The `AtUri` parse in the threadgate check is skipped. Author avatar, name links and hover cards are off. No interaction or analytics events are sent, there is no profile-cache seeding, and there is no translate. |
| `src/view/com/util/PostMeta.tsx` | New optional `disableHoverCard`. An empty handle renders nothing instead of a bare `@`. |
| `src/view/com/posts/PostFeedReason.tsx` | Renders the community badge as "In <name>", with a lock for the members tier. It links to `/c/<id>`. |
| `src/state/preferences/feed-tuners.tsx` | `communities` uses the same tuners as `following`. |

## Action-guard table (members-tier items)

Any `at://` post is `allow` for every action, which is unchanged. A malformed `ao-community://` uri is `disabled` for every action.

| Action | Members item | Where it is enforced |
| --- | --- | --- |
| like | disabled | `MembersPostControls` shows the count only, with no mutation hook |
| repost | disabled | not rendered |
| quote | disabled | not rendered, and `embeddingDisabled: true` |
| reply | door (`/c/<id>`) | `MembersPostControls` reply button |
| share link | disabled | share menu not rendered |
| copy link | disabled | post menu not rendered |
| embed | disabled | post menu not rendered, and `embeddingDisabled: true` |
| bookmark | disabled | not rendered |
| send via DM | disabled | share menu not rendered |
| open thread | door (`/c/<id>`) | `PostFeedItem` href |
| open author | disabled | `PostFeedItem` avatar and `PostMeta` links and hover card |
| translate | disabled | `PostFeedItem` skips `TranslatedPost` |
| mute thread | disabled | post menu not rendered |
| hide reply | disabled | post menu not rendered |
| pin | disabled | post menu not rendered |
| report | door | post menu not rendered; reporting belongs to the community screen |
| delete | door | post menu not rendered; `communitiesClient.deleteMine` belongs to the community screen |
| copy text | disabled | post menu not rendered |

## Query-cache reset on account switch: what I found

- `src/state/session/` does not touch the query cache. It has no `queryClient`, `removeQueries`, `resetQueries` or `clear()`, so the plan is right that the session layer does not reset query roots.
- The cache is already per account one level up. `App.native.tsx:156-158` and `App.web.tsx:136-138` key the tree, and `QueryProvider`, on `currentAccount?.did`. `QueryProviderInner` (`src/lib/react-query.tsx`) builds a fresh `QueryClient`, and a persister keyed `queryClient-<did>`, per DID. It throws if the DID changes under it.
- What this branch adds:
  1. Community keys include the account DID.
  2. They have their own root, `community-feed`, which is never persisted.
  3. `<CommunityCacheGuard>` explicitly removes that root when the DID changes and when the provider unmounts. The unmount case is how an account switch or logout appears today, so the old client releases members content right away instead of waiting for GC.

## Tests

New suites (each runs in the default and iOS jest projects):

- `src/lib/api/feed/__tests__/communities.test.ts`:
  - Following, two members communities and a public group interleave reverse-chron, each with its badge.
  - Each community fetch carries only its own id (call args asserted).
  - Per-source cursors keep order across pages.
  - A failing source is dropped.
  - Sources are resolved from memberships, with pending ones skipped.
  - A members-only feed makes zero agent property reads or calls. In the combined feed, the agent only serves `getTimeline` (Following).
- `src/features/communities/__tests__/membersPost.test.ts`:
  - Synthetic uri. A proxy confirms that only `CommunityPost` fields are read (no `uri` or `cid`), and the view contains no `at://`.
  - `isAgent` comes from `is_agent`, not the name.
  - The record validates, `moderatePost` runs, and `FeedTuner` produces a slice with the badge as reason.
  - Uri round-trip and rejection.
- `src/features/communities/__tests__/postActionGuard.test.ts`: table test. Every action is checked for members items (disabled or door, with the door href), `at://` posts (allow), and malformed uris (disabled). It also asserts that the table covers every action.
- `src/features/communities/__tests__/cache.test.tsx`:
  - The community root survives a re-render with the same DID.
  - It is removed on DID change, on logout and on unmount.
  - `post-feed` is left alone.
- `src/state/queries/__tests__/post-feed-communities.test.ts`:
  - The flag defaults off.
  - With the flag off, no community descriptor is offered, and a stray `communities` or `community|<id>` makes zero agent and runtime calls.
  - Every existing descriptor dispatches to the same API class as on base, with the flag off or on, and keeps the same query key.
  - With the flag on: dispatch, public/members tier detection, and DID-scoped keys.

### Full suite

Command: `corepack pnpm --config.script-shell=<Git bash> test --bail=0` on Windows.

| | Suites | Tests |
| --- | --- | --- |
| Before (merged base `43fb2d86e`) | 3 failed, 130 passed, 133 total | 1 failed, 28 todo, 1479 passed, 1508 total |
| After (`f25848f2d`) | 3 failed, 135 passed, 138 total | 1 failed, 28 todo, 1574 passed, 1603 total |

The same 3 suites fail before and after. All three come from this machine's environment, the same ones T1 and T8 reported:

- `__tests__/lib/string.test.ts`: the compiled locale `messages` file is missing. Install ran with `--ignore-scripts`, and CLAUDE.md forbids `intl:compile`.
- `noBackgroundLocationShipped.test.ts` and `withUISceneLifecycle.test.js`: the CRLF checkout breaks their match.

Other checks:

- `pnpm typecheck`: the only errors are the 82 missing `src/locale/locales/*/messages` module errors. That count is the same before and after.
- eslint: clean on every touched file.
- prettier: applied.

## Flags

| Flag | Default | Effect here |
| --- | --- | --- |
| `EXPO_PUBLIC_COMMUNITIES_ENABLED` (T1) | off | Off: `getOfferedCommunityFeedDescriptors` returns `[]`, a stray community descriptor gets `EmptyFeedAPI` (no fetch), and existing feeds are unchanged. On: the descriptors are offered and dispatch to the new APIs. |

No new flags.

## Rules

- No deploy, no `wrangler`, no `check:bundle`. The last two are deny-listed and were not run.
- No EAS build, no TestFlight, no prod config.
- No PDS writes. Members-tier fetches go only through `communitiesClient`, and the tests assert zero agent calls. No `com.atproto.repo.*` or `uploadBlob` was added.
- The pre-existing write paths in `group.ts` (`createRecord`, `uploadBlob`) are untouched and are not used by this feed.

## Assumptions and open questions

1. **Tier per community.** I modelled each community source as one tier. Runtime communities (`listMyCommunities`) are treated as members tier. AppView groups (`getMemberships`, status active) are treated as public tier. For `community|<id>`, an `at://` id means public, anything else means members. If one community can have both a public and a members timeline, the switcher (T11) can pass both as two `communitySources`.
2. **PostThread.** The members view has a full `PostView` shape, so the shared renderers accept it. But opening a members item routes to the door (`/c/<id>`) instead of `PostThread`. `PostThread` fetches through `getPostThread` on the agent, and that would send the synthetic uri off the device. A members thread view belongs with the community screen (T12/T13).
3. **Members media.** `CommunityMediaRef` names a runtime media id but has no URL, so members items render text only for now.
4. **Author handle.** The runtime exposes no member handle or id, so the members view has an empty handle and a synthetic, non-DID author id. Avatar and name are shown and are not linked.
5. **Like for members posts.** The T8 client has no like endpoint, so likes are disabled rather than routed. They need a runtime route if wanted.
6. **No render test** for `MembersPostControls` or `PostFeedItem`. The guard and data paths are tested. A device or web check of the rendered row still needs doing.
7. **PR base.** The draft PR targets `fix/ao-uiscene-lifecycle` (`569b3b240`), so its diff also shows the T1, T2 and T8 merges.
