# REVIEW - Wave 4 communities end to end (read-only)

- Task: `c7a487e1` (independent, priority normal, read-only)
- Reviewer: Authority One PC builder (headless), 2026-11-01
- Social head reviewed: `communities/integration` at **`1cc4c02e`** (this review branch, `review/communities-wave-r302`, is cut from it)
- Runtime heads reviewed: `origin/main` **`e4e6ba29`** and `origin/deploy/dev-communities` **`cca6020d`**. There are no `communities/*` branches on the runtime remote. Runtime findings are in full in **`docs/REVIEW-WAVE-COMMUNITIES-RUNTIME-e4e6ba29.md`** on this branch, which is summarised in section 2. It lives here rather than in the runtime repo because the builder deny-list blocks writes outside this worktree.
- Rollout doc: `docs/PROD-STAGED-ROLLOUT-MAIN-2026-10-30.md` at runtime `e1e19bc1` (branch `origin/docs/prod-staged-rollout-main`)

## 0. What was run

| Run | Result |
| --- | --- |
| `pnpm install --frozen-lockfile` (pnpm 11.5.2 via npx; local node 24.14.0, below `engines` 24.15.0) | ok. The install touched `package.json` (line endings only), and it was restored with `git checkout` |
| `pnpm test -- src/lib/communities src/view/com/composer src/features/communities src/features/communityAgent src/screens/Community src/lib/api src/lib/agent-runtime/__tests__/communitiesClient src/state/queries/__tests__/post-feed-communities`, run with `--config.script-shell=bash` because the `NODE_ENV=test` syntax in the script fails under cmd.exe. The script also runs `tsc --noEmit -p tsconfig.communities.json` first | **tsc (communities project) passed; jest: 36 suites, 692 tests, all passed** |
| Runtime `node --test test/communities-*.test.js` at main `e4e6ba29` / dev `cca6020d` | 199/199 and 186/186 pass (see the runtime report) |
| Full jest, full `pnpm typecheck`, `pnpm lint`, e2e | **NOT RUN** |

Nothing was deployed, no live system was contacted, and no feature branch was changed. The app-side sweep was done by one read-only sub-agent. The reviewer then checked its MEDIUM-and-above claims (the video pick path and the eas.json profiles) against the code directly.

## 1. App-side findings (social `1cc4c02e`)

### HIGH-A1 A picked video for a members target is uploaded off-device before any target check (members target rule)
- **File:** `src/view/com/composer/Composer.tsx:398-460` (`onSelectAuthorityVideo` calls `uploadAuthorityVideo` with no gate), callers at `:2665-2675` (`onSelectAssets`, video branch) and `:2741-2744` (`SelectVideoBtn`); `videoBtnDisabled` at `:2694` does not look at the target
- **Scenario:** Communities are on, and `EXPO_PUBLIC_VIDEO_POSTS_ENABLED` is `"true"` in every eas profile. A member opens the composer from `CommunityComposerEntry` with a members-tier target and picks a video. The original bytes go at once to the runtime video pipeline (`src/lib/agent-runtime/videoUploadClient.ts`, R2 then Stream), and the status poll starts. At publish, `writeGate.ts:59-64` refuses `authorityVideo` for a members target, so no PDS `uploadBlob` happens: that one, at `Composer.tsx:1357`, is behind `assertComposerPdsWrite`. But a copy of the members-only video now sits outside the walled store. The spec names `uploadVideo` explicitly, so this is rated HIGH even though it is only reachable with the flag on.
- **Fix:** Call `gateComposerWrite(targetResolution, {kind: 'select-video'})` (or `guardComposerPdsWrite`) at the top of `onSelectAuthorityVideo` and return early on refusal. Also disable `SelectVideoBtn` and the video branch of `onSelectAssets` when the target routes to communities.

### LOW-A2 Link-card resolution sends a members post's URLs to a third party while the member types
- **File:** `src/view/com/composer/ExternalEmbed.tsx:88` (`useResolveLinkQuery`), host `src/lib/constants.ts:159` (cardyb)
- **Scenario:** A member pastes a private URL into a members-only post. The URL and the member's IP go to cardyb. `submit.ts:100-104` drops the card at publish, but by then the request has already been made.
- **Fix:** Skip link and GIF embed resolution while the target routes to communities.

### LOW-A3 Content warnings, threadgate and postgate are silently dropped on members posts; a multi-post thread can half-post
- **File:** `src/view/com/composer/state/submit.ts:114-131`, `:79-96`
- **Scenario:** A member adds a "graphic media" label and posts. The post lands with no warning. In a 3-post thread, if reply 2 fails, post 1 is already live.
- **Fix:** Refuse (`unsupported-content`) when labels, threadgate or postgate are set for a members target, or hide those controls. Single-post only for members targets until the door supports threads.

### LOW-A4 Client id check lets `.` and `..` through
- **File:** `src/lib/agent-runtime/communitiesClient.ts:94-101`, `:122-124`
- **Scenario:** `getCommunity('..')` builds `<runtime>/app/communities/..`, which resolves to `/app/` with the bearer attached. Deep links normalise dot segments in `router.ts:62` (NOT VERIFIED on React Native's URL polyfill), so the remaining route in is ids taken from responses or from `navigate()`. Impact is low: the runtime refuses ids outside `COMMUNITY_ID_RE`, and the request only reaches the caller's own runtime with their own token.
- **Fix:** Reject pure-dot ids in `validId`, or align it with the runtime's `^[a-z0-9][a-z0-9_-]{0,63}$`.

### LOW-A5 One eas profile turns the flag on; the "false in every profile" premise is not literally true
- **File:** `eas.json:67-68` (`development-communities`: `EXPO_PUBLIC_COMMUNITIES_ENABLED: "true"`, `EXPO_PUBLIC_COMMUNITY_SWITCHER: "true"`)
- **Scenario:** This is a dev-client, internal-distribution profile pointed at the Dev runtime, and it shares channel `development`. OTA updates are on only for testflight/production (`app.config.js:209`), so a prod update cannot carry it. The risk is someone building or submitting from the wrong profile. Every other profile (`:11, :39, :93, :125, :157, :188, :220`) is `"false"`.
- **Fix:** Make the flags test assert per profile that only `development-communities` may be true, and that `production*`/`testflight*` are false.

### LOW-A6 Stale comment hides a public-tier reply path
- **File:** `src/lib/communities/feedPostTarget.ts:5-11` vs `src/lib/api/feed/communities.ts:84-99`
- **Scenario:** With the flag on, a reply from the merged feed to a public-tier group post (`PostFeedItem.tsx:211`) resolves to the `profile` target and posts an unbound reply. The content is public, so nothing members-only leaks, but the comment's claim that "there is no community feed source yet" no longer holds.
- **Fix:** Carry the group target on public-tier feed items, or correct the comment and pin the behaviour with a test.

### INFO-A7 Gates that depend on the runtime alone
These are client display rules that the runtime must enforce. Runtime status is given for each.
- **Admin launch control:** shown only on `viewerIsAdmin === true` (`isCommunityAdmin.ts:7-9`, `AgentLaunchControl.tsx:46-51`). Runtime: enforced (`launch.js:76-90`).
- **Member UI and timeline fetch:** gated by `isMember` (`descriptor.ts:165`, `queries.ts:73-77`). Runtime: enforced per request.
- **Consent checkbox:** client-only (`consent.ts:109`). Re-consent on a wording bump is not enforced for existing members, on either side (`consent.ts:15-18`; runtime only checks at join).
- **Agent grant toggle:** runtime: enforced on agent reads, but it survives leave (runtime MEDIUM-1).

### Verified safe (app)
- **Flag parsing:** only `'1'`/`'true'` turn it on, and absent means off (`src/env/common.ts:205-207`). It is fixed at build time, with no remote, persisted or query-param override in community code. The web deploy workflow does not set it (`.github/workflows/deploy-web.yml:123-133`). No checked-in `.env` sets it (`.gitignore:102-103`).
- **W1-T1 route gate:** `applyCommunitiesFlag` sends `Community`, `CommunityMembers` and `CommunityJoin` to Home (`src/screens/Community/linking.ts:21-27`). The router is wired at `src/routes.ts:125-127`, and `LINKING.getStateFromPath` uses it (`src/Navigation.tsx:978-979`, `:1139`). The screens also return null when off (`src/screens/Community/index.tsx:61-63`, `JoinConsent.tsx:70-78`), all community routes are `requireAuth` (`Navigation.tsx:730-742`), and every community query has `COMMUNITIES_ENABLED` in `enabled` (`queries.ts:42, 73, 108, 147`). A deep link with the flag off reaches Home, and no community request is sent.
- **Non-screen surfaces:** switcher/drawer (`switcher/util.ts:13-15`, `Drawer.tsx:643`), `AgentGrantRow.tsx:38`, `AgentLaunchControl.tsx:47`, `CommunityComposerEntry.tsx:36`, the feed (`post-feed.ts:506-509` → `EmptyFeedAPI`), `feedDescriptors.ts:34`, and the composer target (`resolveTarget.ts:203, 229` → `communities-disabled`). The binding write throws when off (`src/lib/api/index.ts:102`).
- **Members target rule at publish:**
  - `gateComposerWrite` runs before any write (`Composer.tsx:1202-1214`), and the communities branch returns before the PDS, post-as-agent and video branches (`:1240-1270`).
  - `submit.ts:79-96` sends members targets only to `communitiesClient.post`/`.reply` and refuses media and quotes (`:114-119`).
  - bsky-video `selectVideo` checks the target (`Composer.tsx:589-593`), and so do `processVideo` (`state/video.ts:276`) and draft video restore (`Composer.tsx:673`).
  - Drafts: save, update and delete assert (`drafts/state/queries.ts:141, 247, 302`), and restore is guarded (`writeGate.ts:100-104`).
  - Replies inherit the parent's target, and an unknown parent is refused (`resolveTarget.ts:164, 188-198`).
  - The only gap is HIGH-A1.
- **DID-keyed cache:**
  - Each DID gets its own QueryClient (`lib/react-query.tsx:263-268, 284`), and community keys carry the viewer DID (`queries.ts:31-36, 90-94, 132-135`, `useMyCommunitiesQuery.ts:11-12`, `post-feed.ts:110-118`).
  - Nothing community-related sets `persistedVersion`. `community-feed` is in `NEVER_PERSIST_QUERY_ROOTS`, which is re-applied on restore (`react-query.tsx:224-231, 252-260`).
  - Community queries are removed on account switch and unmount (`src/features/communities/cache.ts:23-38`, mounted at `react-query.tsx:326`).
- **Public-tier gate:** tier comes from the id shape (`at://` means public, via the AppView group timeline, and anything else is members, via the runtime door: `feed/communities.ts:63-65`). Members items use a synthetic `ao-community://` URI with `embeddingDisabled` (`membersPost.ts:94-123`). `MembersPostControls` never calls the PDS agent (`PostControls/index.tsx:68-76`). Translate, analytics and interactions are skipped (`PostFeedItem.tsx:184-190, 256-258, 539`). No notification or search code references communities. Logs carry `safeMessage`/kinds only, never text or DIDs.

## 2. Runtime findings (summary; full detail in `docs/REVIEW-WAVE-COMMUNITIES-RUNTIME-e4e6ba29.md`)

| Id | Sev | File:line (runtime main unless noted) | One line |
| --- | --- | --- | --- |
| HIGH-1 | HIGH | `src/communities/door.js:476-525` | **Privacy wall is consent-only.** Any provisioned customer can self-join any directory community with the current `consentVersion`, then read all history. No invite, allow-list or approval. Whether open join is intended is NOT VERIFIED. |
| HIGH-2 | HIGH | `door.js:163-185`, `admins.js:122-156` | **No server-side member remove or ban.** Leave is self-only, and the member can rejoin. Admins cannot delete others' posts. |
| HIGH-3 | HIGH | `deploy/dev-communities` door + router; `seed-config.js:311-314` | **No code-level prod pin.** On the dev line, the door opens with `communities.enabled` + `COMMUNITIES_STORE_ENABLED` (config alone). `dev-clear.js:19-21` says config and env are shared with prod. Whether Dev and prod share `AO_ACCOUNT_CONFIG` is NOT VERIFIED (deploy config not readable by builders). |
| MEDIUM-1 | MEDIUM | `door.js:345-363`, `agent-slot.js:162-170` | Agent grant survives leave and rejoin. Grant `consentVersion` is never compared. |
| MEDIUM-2 | MEDIUM | `seed-config.js:252-298, 346-356` | Changing `agent` keeps the old `agentSponsor`, and config seeds are not ledgered. |
| MEDIUM-3 | MEDIUM | `agent-slot.js:247-318` | Revoking a grant does not void queued top-level agent proposals (not wired yet). |
| MEDIUM-4 | MEDIUM | `src/index.js:1481-1483`; `door.js:464-468` | Main's door never gets `getStore` (dead), and `itemsOf` drops the DO's bare-key list (empty timelines). Fixed only on `deploy/dev-communities`. Tests use Map fakes. |
| LOW-1..3 | LOW | `keys.js:15-29`; `launch.js:68-132`; `console.js:435-441` | Cleartext member ids in DO keys; any admin can take over sponsorship and no ledger read route exists; non-expiring static customer tokens can join. |

**Spec items, end to end:**
1. **Privacy walls:** server side, every member route re-reads membership per request, responses are `no-store`, the store is tenant-pinned and sealed, and the app caches are DID-keyed and never persisted. The weak point is admission (HIGH-1), not leakage.
2. **Grants and revoke:**
   - The agent grant is set by the member themselves, server side (`door.js:435-446`), and read from the store on every agent read with no caching.
   - A revoke takes effect on the next read.
   - The gaps are that the grant survives leave (MEDIUM-1) and that already-queued proposals are not re-checked (MEDIUM-3).
   - Membership itself cannot be revoked (HIGH-2).
   - A stale client list or an already-issued token cannot read past a leave, because membership is re-read per call.
3. **Admin role:**
   - The first admin is the config `creator`, seeded only when no admin exists (`admins.js:173-188`). After that, only current admins can grant or revoke, atomically, with the last admin guarded.
   - The agent can never be admin.
   - Grant, revoke and launch are ledgered, but there is no ledger read route. Operator config seeds are not ledgered.
   - An admin cannot act on another community.
   - An admin cannot give themselves anything beyond admin and sponsor. Any admin can take sponsorship (LOW-2).
4. **Storage:**
   - The DO is keyed per tenant, and per-community record names are prefixed.
   - No cross-community read path was found. Two communities mapped to one tenant share a DO, and safety then rests on the prefixes.
   - v12 (`new_sqlite_classes = ["CommunityStoreDO"]`) is the one irreversible step (rollout stage 2): never add `deleted_classes` once data exists. R1 needed no new class.
5. **Flag-off gate:**
   - App: complete (W1-T1 route gate plus screen and query gates).
   - Runtime main: the door is unreachable even with the flags on (only because of MEDIUM-4). Seed and dev-clear are gated by config plus `ADMIN_TOKEN`.
   - The flag can be turned on by config alone on the dev line (HIGH-3), and on the app side only by a build profile (LOW-A5).
6. **Members target rule:** no PDS write is reachable at publish, on either side. The runtime makes no PDS call from `src/communities/*`. The one breach is the pre-publish runtime video upload (HIGH-A1).

## 3. Triage (proposed fix tasks for Dispatch; not fixes)

| # | Title | Target branch | Priority | Depends on |
| --- | --- | --- | --- | --- |
| T1 | Gate `onSelectAuthorityVideo` and the video pickers on the composer target (HIGH-A1) | social `communities/integration` | high | none |
| T2 | Product ruling: open join vs admission; then a server-side admission check in the join commit (HIGH-1) | runtime `main` | high | Elliott ruling |
| T3 | Admin remove-member / ban / post moderation, atomic with the ledger and the grant delete (HIGH-2) | runtime `main` (+ app UI later on `communities/integration`) | high | T2 |
| T4 | Code-pinned non-prod guard for door, seed and dev-clear; a human checks whether Dev shares `AO_ACCOUNT_CONFIG` with prod (HIGH-3) | runtime `main` + `deploy/dev-communities` | high | human read of the deploy config |
| T5 | Land the dev-communities door/router wiring + `itemsOf` fix on main, with a bare-key fake-store test (MEDIUM-4) | runtime `main` | normal | T4 |
| T6 | Delete the grant on leave; `agentMayRead` requires current membership + matching consentVersion (MEDIUM-1) | runtime `main` | normal | none |
| T7 | Seed route clears the sponsor on agent change, and every config seed is ledgered (MEDIUM-2) | runtime `main` | normal | none |
| T8 | Composer: no link/GIF resolution, no labels/gates, single post only for members targets (LOW-A2, LOW-A3) | social `communities/integration` | normal | none |
| T9 | Per-profile eas flag test; `validId` rejects dot ids; fix the feedPostTarget comment and pin the behaviour (LOW-A4..A6) | social `communities/integration` | low | none |
| T10 | Re-check proposal sources at execute; hashed member ids; ledger read route; sponsor-change approval; exclude token-map callers (MEDIUM-3, LOW-1..3) | runtime `main` | low | T3 |
