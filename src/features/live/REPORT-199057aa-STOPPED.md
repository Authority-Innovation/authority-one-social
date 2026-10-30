# Agent Live 9 (task 199057aa): Live mode in the One app, client only, STOPPED before code (r2)

*Repo `authority-one-social`. Worktree branch `coord/agent-live-9-live-mode-in-the-on-199057aa`, based on
`b4ee62daa` (= `03ea8768d` + the previous STOPPED report from 2ff3ffbf). `origin/communities/integration` has since
moved to `f92182b46`; this branch was not rebased onto it. PC builder, 2026-10-30. No code, config, `eas.json`
line or test was written. Nothing was run, built, deployed or merged. This file is the only change.*

## What changed since 2ff3ffbf

The review findings that stopped 2ff3ffbf (CR-1, L2, K-7, CR-2, L4, L6) are all resolved in r2
(`docs/design/AGENT-LIVE-MULTITENANT-DESIGN-2026-10-30.md` at `909332b3` on
`coord/agent-live-r2-fix-pass-merge-pr-3ed1e356`). I read the D table, §1.2 to §1.5, §6 and §8 in full. The
§6 flow is now clear and buildable. The blockers below are the ones that remain against this task's binding
rules.

## STOPPED: four blockers

I asked the orchestrator on 2026-10-30. The first ask timed out on the client side. The follow-up qid
`51fabf10` was still unanswered after about 27 minutes (three waits). The task rules say to stop rather than
decide, invent fields, or edit paths I don't own, so I stopped.

1. **No LiveKit SDK, and adding one is outside the owned paths.** `package.json` has no `@livekit/react-native`,
   `@livekit/react-native-webrtc` or `livekit-client`. Adding them needs edits to `package.json`, the pnpm
   lockfile and the Expo config plugins (`app.config.js`), which this task does not own. The task's "flag off means no LiveKit
   import" test also assumes the SDK exists.
   *Proposed:* either allow those three files, or build against an injected room interface (pure, mockable)
   and bind the real SDK in a follow-up task.

2. **There is no real-shape token fixture on `deploy/dev-communities`.** At `cca6020d` it has no `/live` route; the
   only LiveKit mentions are ElevenLabs ConvAI comments in `src/index.js` and `src/elevenlabs-agents.js`. The
   only built route is task 1's `25f183f1` on `coord/agent-live-1-tenant-do`. It takes body `{agent}` and returns
   `{sid, room, region, wsUrl, token, expiresAt, reused}` with one session per pair, which is the **r1** shape.
   r2 §6 step 2 says body `{agentDid}` and returns `{sid, region, wsUrl, token, consentRequired, recordPolicy,
   voiceMode}` with a new room per session [L4]. The spec forbids inventing fields, and neither source matches
   both "deploy/dev-communities" and r2.
   *Proposed:* fixtures from the r2 §6 field list, or from an r2 route once it lands on dev-communities.

3. **The blind message has no wire format.** Task 8 (stage contract) is still STOPPED (`3527ae5c`). P1.F's
   `bob-live/stage/contract.js` (`origin/coord/bob-live-p1-f-stage`) defines `{type, id, payload}` on topic `stage`
   with no `blind` type. P1.B's `bob-live/agent/blind-mode.js` has only an in-process `blindMode(bool)` hook
   ("the hotkey and on-screen button will call later"). r2 §6 doesn't name a blind message either.
   *Proposed:* `{type: "blind", id, payload: {on: boolean}}` on `stage.reply`, accepted by the agent only from the
   `owner:<sid>:*` identity. This needs task 8 or Elliott to fix it.

4. **The spec conflicts with the design on the DID.** The task says the token is "requested with the owner's DID"
   and that "the token request carries the DID only". r2 §6 step 2, R3 and X-TOK-1 say identity comes from the
   owner bearer only, and any `ownerDid` in a body is ignored.
   *Proposed:* bearer plus body `{agentDid}` only, with a test asserting the body keys are exactly `["agentDid"]`
   and that no owner DID appears in the body, the query or any log line.

**Also outside the owned paths:** a `Live` route has to be registered (`src/Navigation.tsx`,
`src/lib/routes/types.ts`, `src/routes.ts`), and the "Go live" button has to be mounted on an agent surface that
already exists. Neither is under `src/features/live/**` or `src/screens/Live/**`. Without them the button and screen
are orphan code.

**Scope question (not a blocker):** r2 §6 step 3 puts a consent sheet before any media, and the agent doesn't
start without the owner's `ai_process` [CR-1]. The task's screen list doesn't mention it. A ruling is needed on
whether this task includes a minimal consent step (`POST /live/sessions/:sid/consent`).

## Ready-to-build plan (once ruled)

- `src/features/live/flag.ts`: `EXPO_PUBLIC_AGENT_LIVE_ENABLED === 'true'`.
- `src/features/live/LiveButton.tsx`: renders null when the flag is off. The screen module, the only importer of
  the SDK, is reached only through navigation, so flag-off pulls no LiveKit module (tested with `jest.isolateModules` +
  a `jest.mock` factory spy that must not be called).
- `src/features/live/api.ts`: `startSession({agentDid})`, `postConsent`, `requestToken({camera})`, `endSession`. Uses the owner
  bearer only. Errors carry status and `sid`, never the token or a DID.
- `src/screens/Live/index.tsx`: the agent's `stage` track full screen (subscribe only to the `agent:<sid>:*`
  identity's `stage` track [L6]), a mic indicator, a blind/mute control, and a camera toggle off by default. Turning the
  camera on calls `requestToken({camera: true})` and publishes only after that. The agent row shows an AI label [CR-2].
- `eas.json`: a new `development-live` profile (copy of `development-communities`) with
  `EXPO_PUBLIC_AGENT_LIVE_ENABLED: "true"`. `"false"` stays the default everywhere else, and it is never set in
  `production` or `preview`.
- §8 IDs on this surface: X-TOK-1 (client half: body is `{agentDid}` only, no owner DID or identity fields) and
  X-LOG-1 (client half: no token or DID in any logger call, asserted with a logger spy), plus the task's own
  flag-off, camera-default-off, camera-publishes-only-when-on and stage-full-screen assertions. TA/TB: the client
  has no tenant switch, so the isolation assertion is that a TA-session token is never reused for a TB agent
  (each `startSession` replaces the held token, and nothing persists to disk).

## Read, and not verified

Read: r2 design (D table, §1.2 to §1.5, §6, §8.1 to §8.7) at `909332b3`, the 2ff3ffbf STOPPED report,
task 1's `live-routes.js` at `25f183f1`, P1.F `contract.js`, P1.B `blind-mode.js`, `eas.json`, and `package.json`.
Not verified: whether Elliott has answered off the bus. Tests: none run (no code), so `tests_green` is unset.
