# Agent Live: review fix pass (2026-11-01)

Fixes for `~/authority-one-spike/reviews/REVIEW-ONE-APP-LIVE-MODE-2026-11-01.md`
(B1, B2, H1–H3, M1–M7). Branch `fix/agent-live-review-2026-11-01`, off
`agent-live/app-integration` @ e7e56631e. Nothing merged into a shared branch,
no EAS or TestFlight build. Still dark everywhere except `development-live`.

Runtime contract: `authority-one-runtime` `agent-live/integration` @ 3dd4ac1.

## Commits

| Commit | What |
| --- | --- |
| `chore(agent-live): pin @noble/curves 1.9.7` | Ed25519 for the device-key proof |
| `test(agent-live): /live fixtures generated from the runtime` | `scripts/agentLive/generateLiveFixtures.mjs` → `__fixtures__/live.json`; `piece1Live.ts` removed |
| `fix(agent-live): client on the current runtime contract; …` | B1, B2, H1–H3, M1–M4, M7, the app half of M5 |
| `build(ios): archive guard refuses a stale Agent Live prebuild` | M5 |
| `test(brand): golden gains the flag-off LiveKit exclusion plugin entry` | M6 (option A) |
| `docs(agent-live): …` | README, this report |

## Findings → fixes

| Finding | Fix | Held by |
| --- | --- | --- |
| **B1** contract drift | `api.ts` reads `token: null` + `consentMissing`, the consent route, `popRequired`, 403 `consent_required`, `/live/join/prove`, 60 s tokens (`expiresAt` used: an expired token is replaced before joining) | `api.test.ts` over `live.json` |
| **B2** no consent, mic hot on mount | Nothing starts on arrival; Continue → mic access → start (no media) → consent sheet (per kind, all off, every kind `given`/`refused`, AI processing required) → Go live → proof → join → mic. Recording indicator when `recordPolicy !== 'off'` (sheet and stage) | `session.test.ts` B2, `AgentLive.test.tsx` |
| **H1** dead room looked connected | Room seam reports reconnecting/reconnected/drop + reason. Removed / room deleted / other device end it with the reason shown; network drops rejoin with a fresh proven token (mic and camera restored), else end. Control errors are notices | `session.test.ts` H1, `livekitBinding.test.ts`, screen tests |
| **H2** end with the wrong bearer, fire-and-forget | `captureLiveAuth` pins the session to its account; every call uses that account's bearer (its current one while still signed in). `/end` is retried (idempotent) and outlives the screen. End is the stop path (job stopped, room deleted) | `api.test.ts` owner scope, `session.test.ts` H2 |
| **H3** failed start left things running | Mic asked before any runtime call; any failure after the session exists leaves the room and ends it; room factory throw handled; "Microphone access is off" → Settings | `session.test.ts` H3, screen tests |
| **M1** camera rejoin race | The camera token is bound and proven before the old connection is dropped; the runtime's replace-while-held rule admits it (unbound would be `duplicate_identity`, shown in `live.json` `media`). Audio kept across the gap. On failure: rejoin without the camera | `session.test.ts` camera |
| **M2** reuse ignored | "Continue here?" first; Not now leaves the open session running; a `duplicate_identity` drop reads "moved to another device" and does not end it | `session.test.ts` M2, screen tests |
| **M3** no device binding | Per-account Ed25519 key, expo-secure-store `AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY`, sent as `devicePubKey`, proof before every join | `pop.test.ts` (signatures equal the runtime-accepted ones) |
| **M4** no recording indicator | See B2 | screen tests |
| **M5** Android / stale prebuild | Go live hidden and the screen off on Android; `ios-archive-guard.sh pre` refuses a stale flag-on `ios/` under a flag-off archive, and a flag-on archive without `AO_ARCHIVE_ALLOW_AGENT_LIVE=1` | `iosArchiveGuard.test.js`, real prebuilds (below) |
| **M6** brand golden red | Regenerated in its own commit after proving the only drift is the one plugin entry (with it removed, all 72 hashes equal the old golden) | `brandConfig.test.js` green |
| **M7** test gaps | New: binding tests, fake room failures/events, contract tests over real replies, account switch/sign-out, `/end` failures, deep-link mount | as above |

Found on the way: the stage video never appeared, because React Compiler
memoized `controller.room().StageVideo` on the controller (which exists before
the room). It is now read with the stage.

## Verification

- Jest, Live suites (14 suites incl. brandConfig, archive guard, routeTable,
  flags): 192 passed.
- Full Jest suite: 195/196 suites, 2527 passed, 1 failed, 28 todo. The one
  failure is `src/lib/lexicon/__tests__/lexicon.test.ts` (group/post.json hash),
  which comes from Communities commit b424c48a6 and fails on the base branch
  too; not Live, not touched here. brandConfig (red on the base) is green.
- `tsc -p tsconfig.communities.json`, `tsgo -p tsconfig.check.json`: clean.
- ESLint on `src/features/agentLive`, `src/screens/AgentLive`: clean.
- Prebuild (`expo prebuild --platform ios --no-install --clean`):
  - flag off: `use_expo_modules!(exclude: [3 livekit pkgs])`, no livekit
    podspecs source, `UIBackgroundModes` = remote-notification, location, fetch;
    archive guard OK;
  - flag on: livekit podspecs source, `audio` added, no `voip`; that `ios/`
    under a flag-off archive is REFUSED; a flag-on archive without the allow
    flag is REFUSED; with it, OK.
- `live.json` regenerates byte-identically.

## Not done / not verified

- No device or simulator run (permission prompts, LiveKit's real disconnect
  reasons, keychain, the rejoin under a real media server, lock screen).
- Sign-out: `/end` uses the session's pinned bearer. If the PDS rejects an
  access token once its session is deleted, the runtime answers 401 and the
  session ends at its own timeout; a logout hook that awaits `/end` first was
  not added (it touches `state/session`).
- No consent withdrawal control mid-session (End covers stopping; the runtime
  route exists).
- LOW findings not in scope: Sentry breadcrumb scrub (L1), usage strings (L6).
  L3 (End with no back stack opens the agent's hub), L4 (notices shown) and L5
  (stale 5 min comments) are fixed along the way.

## Addendum (2026-11-02): join gate R2

Dispatch: the revised join gate (runtime `docs/agent-live-join-gate-revised` @
adeeadb, R1) refuses LiveKit resumes and answers `/rtc/v1` with 404. Built to
R2 in that design doc; the exact contract promised from session local_9cc13bda
was not yet in AUTONOMOUS-LOG and that session could not be reached, so this
follows the doc and must be re-checked against it when it lands.

- `room/livekit.tsx`: `reconnectPolicy` = `NO_SDK_RECONNECT` (always null), so
  the SDK never sends `reconnect=1` and never re-uses the single-use token for
  a full reconnect; a loss is Disconnected at once.
- `session.ts`: every rejoin mints a fresh token (`mintJoin`, never the token
  in hand), proves it if bound, joins; backoff `REJOIN_BACKOFF_MS` = 1, 2, 4,
  8 s, then `reconnect_failed` ("Couldn't reconnect, so the live session has
  ended."), the room left and `/end` sent.
- `/rtc/v1` 404: handled by livekit-client 2.23.0 itself (ServiceNotFound from
  `/rtc/v1/validate` → the same join on `/rtc`), as long as the 404 body doesn't
  say "requested room does not exist" (R1 item 3). `sdkContract.test.ts` pins
  that and the null-policy behaviour to the installed SDK.
- Not verified: the real SDK against an R1 edge on a device (the design's own
  open item). R3 (same-session identity replacement) is not needed by this app,
  because its rejoin tokens are bound and proven with the same key.

### Follow-up: the workers' rejoin rule (58b8dd6)

`rejoin.ts` mirrors the runtime's `live-agent/src/rejoin.js` on
`feat/agent-live-r2-workers` @ 58b8dd6: backoff 1, 2, 4, 8 s; FINAL reasons
CLIENT_INITIATED, DUPLICATE_IDENTITY, PARTICIPANT_REMOVED, ROOM_DELETED,
ROOM_CLOSED, USER_REJECTED end the session, anything else rejoins, one rejoin
at a time. Two behaviour changes from 44f69af93: a CLIENT_INITIATED drop the app
did not ask for now ends the session (it rejoined before), and USER_REJECTED
ends it (it was treated as a network drop). The SDK's give-up under the
no-retry policy carries no reason (livekit-client esm.mjs ~25360/35782), so it
still rejoins. The binding names reasons through the real protocol enum.
