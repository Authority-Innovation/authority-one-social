# Autonomous build log

## 2026-10-28 - Communities W1-T1 flags + routes (task df17dfda)

- Branch `coord/communities-w1-t1-flags-routes-f-df17dfda`, base `569b3b240`, feature head `322245a40`.
- Changed: 5 dark env flags in `src/env/common.ts` (all off/empty, `BRAND` = `authority-one`); same keys set to defaults in all 7 `eas.json` profiles; `Community` `/c/:id` and `CommunityMembers` `/c/:id/members` in routes, types and `commonScreens`; placeholder `src/screens/Community` that renders nothing; flag off -> `/c/...` deep links land on Home.
- Tests: +10 (3 suites). Full suite 1421 -> 1431 passed; the same 2 pre-existing suite failures before and after (Windows CRLF artefacts).
- Verdict: done, draft PR, awaiting a separate reviewer.
- NOT done: no real community screen, no API, no intl extraction, no device test, no Cloudflare deploy CLI or check:bundle (deny-listed), no deploy or EAS build.
- Report: `docs/communities/W1-T1-flags-routes-report.md`.

## 2026-10-28 – Communities W1-T2: lexicon + codegen (task 98e02647)

- What changed:
  - Tracked the `com.authorityone.group.*` lexicons and added the draft `com.authorityone.community.config` lexicon under `lexicons/`.
  - Wired `@atproto/lex-cli` codegen (`pnpm lexgen`, `pnpm lexgen:check`) into the committed `src/lib/lexicon/generated`.
  - `src/state/queries/group.ts` now aliases the generated types under the same exported names. TODO(codegen) removed.
  - Added 18 tests.
- Deviation: I fixed two invalid spike lexicons (defs `groupViewBasic.creator`, getMemberships `membershipView`). The wire shape is unchanged, and the change is recorded in `lexicons/README.md`. The orchestrator questions were unanswered at the time of writing.
- Tests: before 1421 passed, 1 failed; after 1439 passed, 1 failed. The same pre-existing failure appears both times. Typecheck green.
- Verdict: done, as a draft PR awaiting a fresh review.
- NOT done: no UI, runtime calls or flags (out of scope). No wrangler, check:bundle or deploy (deny-listed or not allowed).
- Head and full detail: `docs/communities/w1-t2-lexicon-codegen-report.md`.

## 2026-10-28 – Communities W1-T8: communities client (task f45195a0)

- **Branch:** `coord/communities-w1-t8-communities-cl-f45195a0`, from `569b3b240`
- **Code head:** `b828226ec`. The report and this log are in a follow-up commit.
- **What changed:** new files `src/lib/agent-runtime/communitiesClient.ts` and `src/lib/agent-runtime/__tests__/communitiesClient.test.ts`. The client has 10 methods. Each returns a typed result and never throws. Requests carry no tenant id and never go to the PDS. The bearer comes from `getAgentRuntimeAccessToken()`. Nothing imports the client yet, so it is dark.
- **Tests:**
  - Before: 1387 passed, 1 failed, 28 todo (128 suites).
  - After: 1451 passed, 1 failed, 28 todo (129 suites).
  - The same 3 suites fail on base, all because of the environment.
  - The P2b `bearerCallSites` test passes on a local merge with the T4 branch.
- **Verdict:** ready for a separate review. The PR is a draft.
- **Not done:**
  - No UI, routes or walled store.
  - The runtime routes are assumed and still need the server side to match.
  - No `wrangler` or `check:bundle` (deny-listed), and no deploy.
- **Details:** `docs/communities/W1-T8-communities-client-report.md`

## 2026-10-28 - Communities W2-T10: combined feed adapter (task 0c775985)

- Branch `communities/w2-combined-feed`, base: build line `569b3b240` + T1, T2 and T8 merged with merge commits (`c20cdf753`, `86d248f28`, `43fb2d86e`). Code head `f25848f2d`; this log and the report are in the docs commit that follows.
- Changed: `communities` / `community|<id>` feed descriptors; `CommunitiesMergeFeedAPI` (`src/lib/api/feed/communities.ts`), which does an on-device reverse-chron merge with one fetch per community, each carrying only its own id; members-tier items mapped to a FeedViewPost view with `ao-community://<id>/<postId>`; one action guard (`src/features/communities/postActionGuard.ts`) applied in PostControls and PostFeedItem; community feeds have their own never-persisted query root with the account DID in the key, removed explicitly on account switch; community badge in PostFeedReason.
- Cache finding: `src/state/session/` does not reset query roots, but QueryProvider is keyed by DID (new QueryClient per account). Explicit removal was added on top.
- Tests: +95 (5 suites). Full suite 1479 -> 1574 passed; the same 3 environment suite failures before and after (missing compiled messages, CRLF).
- Verdict: done, draft PR, awaiting a separate reviewer.
- NOT done: no switcher UI (T11), no community home or thread (T12/T13), no members media rendering, no members likes (no runtime endpoint), no render test of the members row, no device check. No Cloudflare deploy CLI or check:bundle (deny-listed), no deploy or EAS build, no PDS writes.
- Report: `docs/communities/W2-T10-combined-feed-report.md`.

## 2026-10-28 – Communities W1-T3: composer no-PDS-write guard (task 1550eefa)

- Branch `coord/communities-w1-t3-composer-no-pd-1550eefa`, base `569b3b240`.
- Changed: `ComposerTarget` + pure fail-closed `guardComposerPdsWrite`
  (`src/lib/communities/composerTarget.ts`); `submitComposerThread`
  (`src/view/com/composer/state/submit.ts`); `ComposerOpts.target` threaded to
  `ComposePost`; composer refuses members/paid targets before publish, drafts and
  bsky video upload.
- Head: see `git log` (feature commit `f0a4c68d8`, then this log/report commit).
- Tests: base 1387 passed / 1 failed / 28 todo (128 suites, 3 failing);
  head 1406 passed / 1 failed / 28 todo (130 suites, same 3 pre-existing failures).
- Verdict: done, draft PR, awaiting separate review.
- NOT done: members write path (walled-store client), any UI that sets a
  community target, public-tier routing. No wrangler / check:bundle (deny-listed).
- Report: `docs/communities/W1-T3-composer-guard-report.md`.

## 2026-10-29 – W1-T3 composer guard fix pass r2 (task 5800b5d0)

- Branch `coord/fix-w1-t3-composer-guard-deleted-5800b5d0`, base `cc80918e1`.
- Major 1: `deleteDraft` added to `GUARDED_PDS_WRITES`; delete/cleanup hooks
  refuse members/paid; the drafts list hides delete for a refused target.
- Major 2: draft save/delete/cleanup hooks and `processVideo` take a required
  `target` and refuse before any server call; zero-write tests added. Also
  guarded the restore-draft-video upload, which had no guard.
- Major 3: **deviation from shared rule 1 (flags default off)**. The guard is
  not flagged, because a flag would weaken fail-closed. Open question for
  Elliott: accept it, or name a flag shape.
- Tests: 133 suites (3 pre-existing failures), 1435 passed / 1 failed / 28 todo.
- Not verified: no render test of `ComposePost` itself; no device run.
- Report: `docs/communities/W1-T3-composer-guard-report.md` (section "Fix pass r2").

## 2026-10-28 - Communities W2-T9: join and consent screen (task cfbd6f15)

- **Branch:** `communities/w2-join-consent`. Base `569b3b240` with T1 (`345180401`) and T8 (`d52f1bd82`) merged in with merge commits (`5ffec5997`, `41a6c2e55`).
- **Code head:** `fcbab086e`. The report and this log are in a follow-up commit.
- **What changed:**
  - New `src/screens/Community/JoinConsent.tsx` (mockup (d)) and `consent.ts` (logic).
  - New route `CommunityJoin` `/c/:id/join`, dark behind `EXPO_PUBLIC_COMMUNITIES_ENABLED`.
  - `join(id, consentVersion)` runs only after the box is ticked and the button is pressed. The version comes from the config, falling back to `'1'`.
  - `setAgentGrant(id, true)` runs only after a successful join, and only when the toggle is on.
  - The `invite` param is never read.
- **Tests:** +17.
  - Before: 1495 passed, 1 failed, 28 todo (132 suites).
  - After: 1512 passed, 1 failed, 28 todo (133 suites).
  - The same 2 suites fail on base, both from the environment (CRLF, AppDelegate template).
  - Typecheck and lint are clean.
- **Verdict:** ready for a separate review. The PR is a draft.
- **Not done:**
  - No community home or feed.
  - No device run and no intl extraction.
  - No Cloudflare deploy CLI or check:bundle (deny-listed), and no deploy.
  - The config fields for sponsor, agent name, rules and links are assumed. See the open questions.
- **Details:** `docs/communities/W2-T9-join-consent-report.md`

## 2026-10-28 – Communities W2-T12: community home screen (task 2f8fe123)

- **Branch:** `communities/w2-community-home`, base `569b3b240` with T1, T2 and T8 merged in by merge commits. Code head `5e2704fb4`. This entry and the report are in a follow-up docs commit.
- **What changed:**
  - `src/screens/Community/` is now the real community home. It replaces the T1 placeholder and the Group stub, which is deleted.
  - It has a header with the accent in the header only, an agent card (N1), and Posts and Members tabs.
  - A non-member sees the descriptor, placeholder rows and the Join slot (T9), and no timeline read is made.
  - A member reads the timeline through `communitiesClient.getTimeline`. Public tier reads through `group.ts`.
  - The composer slot receives `communityId` and renders nothing until T17.
- **Tests:**
  - Before: 1513 passed, 1 failed, 28 todo (133 suites).
  - After: 1538 passed, 1 failed, 28 todo (135 suites).
  - The same 2 pre-existing suites fail before and after.
  - Typecheck is green.
- **Verdict:** done, as a draft PR awaiting a separate reviewer.
- **NOT done:**
  - JoinConsent (T9) and the composer target (T17) are slots only.
  - The runtime has no member list for walled communities.
  - Agent labels on posts need `author.did` from the runtime.
  - No device run. No `wrangler` or `check:bundle` (deny-listed). No deploy.
- **Report:** `docs/communities/W2-T12-community-home-report.md`.

## 2026-10-28 – Communities W1-T4: merge Signature P2b dark (task a4ed5eb7)

- **Changed:** merged `feat/social-ao-signature-p2b` (589e00164) into the build
  line at 569b3b240 with a merge commit (da1fce83f). There were no conflicts.
  Added `src/screens/Login/__tests__/signInDark.test.tsx`: a snapshot taken at
  the pre-merge base, which the merged sign-in screen must match.
- **Branch:** `coord/communities-w1-t4-merge-signatur-a4ed5eb7`. Draft PR only.
- **Verdict:** Signature stays dark. No `EXPO_PUBLIC_AO_SIGNATURE_*` value is
  set anywhere. With it off, the bearer stays the PDS JWT. The scheme stays
  `one`. The parity, bearer call-site and dark tests pass. Full suite: no new
  failures compared with the base. The 2 CRLF failures were already there on
  this Windows checkout.
- **NOT done:** Signature is not on for anyone. No runtime allow-list entries.
  No deploy, no EAS build, no `wrangler` or `check:bundle` (deny-listed). Not
  reviewed yet: a separate reviewer must review before the PR is marked ready.
- Full report: `docs/communities/W1-T4-merge-p2b-dark-report.md`.

## 2026-10-28 - Communities W2-T15: brand config + config lint (task 0bf1fa47)

- Branch `communities/w2-brand-config`. Base: `569b3b240` with T1 and T4
  merged in (`baaf33d39`).
- Changed:
  - `brands/authority-one/brand.json` (the default brand).
  - `app.config.js` reads `brands/$BRAND/brand.json`. `BRAND` unset means
    `authority-one`. It replaces 16 literals.
  - `scripts/lint-brand-config.js` (`pnpm lint:brands`), with 5 rules and
    one fixture per rule.
  - A config-only test that resolving a brand config does not touch `src/`
    (not a build-level check).
- Byte compare: the default brand is identical to base in 72 of 72 env cases,
  as full JSON with nothing masked. The committed golden test masks only the
  release counters.
- Tests: +17 (2 suites). Full suite went from 1614 to 1631 passed. The same 2
  suite failures appear before and after; both are Windows artefacts.
  Typecheck and ESLint are clean.
- Verdict: done. Draft PR, awaiting a separate reviewer.
- NOT done:
  - No After Pride brand and no locked skin.
  - No EAS, prebuild or deploy.
  - No `wrangler` or `check:bundle` (both deny-listed).
  - `eas.json` was not touched.
  - `brand.json` `legal`, `signature`, `skinId` and `lockedCommunity` are not
    read by `app.config.js` yet.
- Report: `docs/communities/W2-T15-brand-config-report.md`.
