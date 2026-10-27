# Communities W2-T12: community home screen (task 2f8fe123)

Date: 2026-10-28

## Branch and base

- Branch: `communities/w2-community-home`
- Base: `569b3b240`. The branch was created at `main` (`571924785`) with no work on it, so I reset it to the stated base before pushing anything.
- Predecessors merged in with merge commits:
  - T1 `coord/communities-w1-t1-flags-routes-f-df17dfda` (head `345180401`), merge `8d2be44f1`
  - T2 `coord/communities-w1-t2-lexicon-codege-98e02647` (head `a91aa567a`), merge `2a07b4395`
  - T8 `coord/communities-w1-t8-communities-cl-f45195a0` (head `d52f1bd82`), merge `bf55c517e`
  - The only conflict was in `AUTONOMOUS-LOG.md` (each branch added it). I kept all three entries.
- Feature commits: `3629a655c` (screen) and `5e2704fb4` (tests), then the docs commit that holds this report.

## What changed

- `src/screens/Community/index.tsx` replaces the T1 placeholder. It contains `CommunityScreen` (`/c/:id`) and `CommunityMembersScreen` (`/c/:id/members`, which opens on the Members tab).
- `descriptor.ts` builds a `CommunityDescriptor` from the runtime's `getCommunity` response, plus the `community.config` record if the runtime returns it under `config`.
  - Tier: an unknown tier fails closed to members-only.
  - Accent: only a CSS hex value is accepted.
  - Agent: set only when both `agent` and `agentSponsor` are set.
  - `postsSource()` returns `runtime`, `group` or `none`.
- `queries.ts` holds the read hooks:
  - `useCommunityQuery` calls `communitiesClient.getCommunity`.
  - `useCommunityTimelineQuery` calls `communitiesClient.getTimeline`. It is enabled only for a member of a members-tier or paid community.
  - The public-tier timeline and member list go through `group.ts`.
  - All of them are disabled while the flag is off.
- `components/CommunityHeader.tsx` shows the banner, avatar, name, tier badge, the "Run by … · N members" line, the description, the member badge, and for non-members the "Join community" button with "You choose what to share before you join." The accent is used only in this component (top stripe and banner fallback).
- `components/AgentCard.tsx` shows the agent's name with "◆ Agent", the sponsor line, and what it can see.
- `components/PostsSection.tsx`:
  - A member sees the members timeline. A post gets the agent label only when `is_agent` is set and the author DID equals the config's agent DID (N1).
  - A non-member sees placeholder wall rows.
  - A public-tier community shows its public timeline.
  - Walled tiers also show the "Posts here are for members…" notice.
- `components/MembersSection.tsx`: a public-tier community lists its members through `group.ts`. A walled community shows only the member count (see open questions).
- `components/JoinConsentEntry.tsx` is a slot for T9. T9's `JoinConsent.tsx` did not exist on any branch, so for now this opens a holding sheet that joins nothing.
- `components/CommunityComposerEntry.tsx` is a slot for T17. It receives `communityId` and renders nothing for now (fail-closed, because the ordinary composer would publish to the PDS).
- `README.md` documents the feature.
- `src/screens/Group/index.tsx` (the old stub) is deleted. Nothing imported it, and the spec says this screen replaces it. `group.ts` is unchanged.

Layout: I followed the `ProfileList` pattern (`Layout.Screen`, a header component, then sections) but used a plain tab row instead of `PagerWithHeader`. The pager needs reanimated scroll machinery that does not load under Jest, and two tabs did not justify it. A reviewer may want the pager instead.

## Screen states

| State | What renders | Reads |
| --- | --- | --- |
| Flag off | nothing; in-app push navigates to Home; deep link resolves to Home | none |
| Loading | header with back button, loader | `getCommunity` |
| Error (any `CommunitiesError`) | "Could not load this community" | `getCommunity` only |
| Non-member, members/paid tier | descriptor (name, avatar, banner, tier, run-by, description, rules), agent card if N1 holds, Join button, placeholder rows, members notice | `getCommunity` only. No timeline. |
| Non-member, public tier | as above, plus the public timeline | `getCommunity` + `group.getTimeline` |
| Member, members/paid tier | header with Member badge, agent card, members timeline, notice, composer slot (`communityId`) | `getCommunity` + `communitiesClient.getTimeline(id)` |
| Member, public tier | header, public timeline via `group.ts`, composer slot | `getCommunity` + `group.getTimeline` |
| Members tab | count; list for public tier; "Only members can see…" for a walled non-member; "The member list isn't available yet." for a walled member | public tier only: `group.getMembers` |

## Tests

| Run | Suites | Tests |
| --- | --- | --- |
| Before (merged base `bf55c517e`) | 131 passed, 2 failed (133) | 1513 passed, 1 failed, 28 todo |
| After (`5e2704fb4`) | 133 passed, 2 failed (135) | 1538 passed, 1 failed, 28 todo |

- The 2 failing suites are the same before and after: `plugins/uiSceneLifecycle/__tests__/withUISceneLifecycle.test.js` and `src/lib/contextEngine/__tests__/noBackgroundLocationShipped.test.ts`. Earlier wave reports describe these as Windows environment failures. My change does not touch either.
- I added 25 tests:
  - `__tests__/descriptor.test.ts` (10): config parsing, N1 agent rule, tier fail-closed, hex-only accent, `postsSource`.
  - `__tests__/CommunityScreen.test.tsx` (15), covering each required case:
    - Non-member: no timeline call, join button visible, no members-tier content rendered (placeholder rows only), and the join button opens the join entry.
    - Member: every `getTimeline` call uses only this community's id. Agent label only from config DID plus `is_agent`. The composer slot gets `{communityId}`. The Members route opens on the Members tab.
    - Agent card hidden when `agent` is missing, and when `agentSponsor` is missing. Shown with name, sponsor and scope when both are set.
    - Accent: every element styled with the accent is inside `communityHeader`, the app theme seen outside is unchanged, and a non-hex accent is dropped.
    - Flag off: `/c/:id` and `/c/:id/members` deep links resolve to Home. An in-app push navigates to Home and makes no reads.
    - A runtime error shows the error state and makes no timeline call.
- `pnpm typecheck`: green. `pnpm lint`: no findings in `src/screens/Community`. The repo has pre-existing lint errors in other files that I did not touch.
- How I ran it on this Windows host: pnpm 11.5.2 through the npx cache, with `--config.script-shell` set to Git bash so `NODE_ENV=test` works. `pnpm install` ran the postinstall `lingui compile`. That writes only the gitignored `messages.js`. I did not run `intl:extract`.

## Flags

| Flag | Default | Used here |
| --- | --- | --- |
| `EXPO_PUBLIC_COMMUNITIES_ENABLED` | off | gates the screen, every read, and the deep links (T1) |
| `EXPO_PUBLIC_COMMUNITY_SWITCHER` | off | not used (T11) |
| `EXPO_PUBLIC_LOCKED_COMMUNITY` | empty | not used |
| `EXPO_PUBLIC_BRAND` / `EXPO_PUBLIC_BRAND_SKIN` | `authority-one` / empty | not used. No reskin; accent stays in the header (N3). |

## Rules check

- No PDS writes. The screen reads only. Members content comes only from `communitiesClient`.
- No tenant id is sent. The runtime decides tenancy (T8).
- No deploy, no EAS or TestFlight, no prod config.
- I did not run `wrangler` or `check:bundle` (both deny-listed, and not needed here).
- No secrets or DIDs are logged. The tests use `did:example:*` placeholders.

## Open questions and assumptions

1. **Descriptor fields.** T8's `Community` type has no avatar, banner, tier, `agentSponsor`, rules or group URI. I read these defensively:
   - from `config` (the `community.config` record shape), or
   - from top-level fields I assumed: `avatar`, `banner`, `tier`, `agentSponsor`, `agentName`, `agentSponsorName`, `agentScope`, `runBy`, `rules`, `rulesUrl`, `groupUri`.

   The runtime contract needs to confirm these names.
2. **Agent DID on posts.** T8's `CommunityPostAuthor` has no `did`. Under N1 the screen labels a post as the agent only when `is_agent` is set and the author DID matches. Until the runtime returns `author.did`, no post gets the agent label. Suggest adding `did` to `CommunityPostAuthor`.
3. **Member list for walled communities.** The runtime has no member-list route, so the Members tab shows only the count.
4. **Agent scope fallback copy.** If the runtime sends no `agentScope`, the card says "Sees posts in this community only. It can't see your profile or your other communities." Product should confirm that this claim holds.
5. **Not built:** the mockup's "Episodes" tab (show-specific, not in scope) and the "See what joining shares" link (belongs to T9).
6. **T9 handoff.** When T9 lands, replace the body of `JoinConsentEntry` with `<JoinConsent />`. The screen does not change.
7. **T17 handoff.** When T17 lands, fill in `CommunityComposerEntry`. It already receives `communityId`.

## Not done

- No device or simulator run. Jest only.
- No intl extraction. The nightly CI job does that.
- Not reviewed yet. The PR is a draft and needs a separate reviewer.
