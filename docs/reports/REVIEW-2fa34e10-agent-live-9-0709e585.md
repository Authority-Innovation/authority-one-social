# Review 2fa34e10: Agent Live piece 9 (One Live mode client) at `0709e585ace9`

- Repo `authority-one-social`, branch `coord/agent-live-9-app-client-v2`, head `0709e585ace9a8d910c1b436660e87baf53acb5c` (matches origin).
- Diff reviewed: `f92182b46..0709e585a` (32 files: plugins/agentLive, metro/react-native config, eas.json, `src/features/agentLive/**`, `src/screens/AgentLive/**`, routes, AgentHub).
- Design reviewed against: runtime repo `docs/design/AGENT-LIVE-MULTITENANT-DESIGN-2026-10-30.md` at `909332b3` (§1.1-1.6, §6, §8.1/§8.5), plus §12.9.8 (blind wire format) from addendum branch `a760fdb1` (`bdbce3ea`), which `909332b3` doesn't include.
- Review only. No code changed on the piece branch.

## Verdict

**CLEAN for piece 9: no BLOCKER and no HIGH.** There are four MEDIUMs and four LOWs. MEDIUM-3 is a design-ordering gap the builder scoped out openly. The orchestrator should confirm that scoping before a device build.

## What I ran

- `pnpm install --frozen-lockfile` (pnpm 11.5.2 via corepack). The deps installed. The `postinstall` (`intl:compile-if-needed`) failed because `pnpm` isn't on PATH for the script shell. I didn't fix it, because CLAUDE.md says not to run intl compile.
- Jest, as the builder ran it (`NODE_ENV=test node node_modules/jest/bin/jest.js --forceExit --testTimeout=20000`), on `src/features/agentLive`, `src/screens/AgentLive`, `src/screens/Community` and `scripts/__tests__/brandConfig.test.js`: **15 of 16 suites passed, 195 of 198 tests passed**. The 3 failures are the expected `brandConfig.test.js` golden failures (report assumption 3, LOW-6).
- Mutation checks, each reverted with `git checkout` (the working tree is clean afterwards):
  1. Add `did: agentDid` to the start body: `api.test.ts` **2 tests fail**. Good.
  2. Add `?owner=x` to every URL: `api.test.ts` **4 tests fail**. Good.
  3. Remove the owned-agent guard in `AgentLiveScreen` (`if (!agent?.did)` becomes `if (false)`): `AgentLive.test.tsx` **1 test fails**. Good.
  4. The binding's L6 logic (`room/livekit.tsx`) has no behavioural test. See MEDIUM-1.
- Not run: the full 191-suite jest run (the builder reports 2,367 passed and 5 failed), `pnpm typecheck`, lint, any device, simulator or E2E run.

## Checks that hold

- **Ruling 3 / X-TOK-1 (client half).** `api.ts` sends the bearer only. The start body is exactly `{agentDid}`, token is `{camera}`, end has no body, and the query is always empty. No `ownerDid`, `identity`, `tk` or `doId` goes out. The tests are real: mutations 1 and 2 fail them.
- **§6 step 1, owned agents only.** `AgentLiveScreen` resolves the route param only through `useOwnedAgent` (the owner roster). A deep link to someone else's agent renders "not available" and calls nothing. Mutation 3 fails the test. The runtime enforces the same rule (X-ROOM-1).
- **§6 "must never hold".** The app holds only its own LiveKit join token, in the controller closure. Nothing is persisted or logged (the `api.ts` catch logs a fixed string), and there are no keys or presigned URLs.
- **§12.9.8 blind.** The bytes are exactly `{"t":"blind","on":…,"src":…}`, carry no identity, and go reliably on `stage.reply`. They are sent only while `connected` on the owner's own session. The owner-only check on the receiving side belongs to the worker (piece 5).
- **Camera off by default (§6 step 4).** It publishes only after `POST …/token {camera:true}` and a rejoin. A refused token publishes nothing, and the tests cover this.
- **L6, owner side (code).** `autoSubscribe:false`. `setTrackSubscriptionPermissions(false, [agent:<sid>:*])` runs inside `connect()`, before the mic publishes, and again on each participant change. Only the agent's stage and mic are subscribed. Identities are runtime-minted, so the prefix check can't be spoofed by a client.
- **The AI label [CR-2]** is shown.
- **Ruling 1, the SDK gate.** Only `livekit.tsx` imports the SDK, through a dynamic import. Metro resolves the SDK to an empty module when the flag is off. The autolinking excludes and the plugin gate are covered by `buildGate.test.ts`. Native confirmation still needs the Mac (report, "Needs the Mac").

## Findings

### MEDIUM-1: the L6 subscription and permission rules in the binding have no behavioural test
- **Where:** `src/features/agentLive/room/livekit.tsx:59`, `:83-95` and `:121`. The only test touching the file is `buildGate.test.ts:202`, which checks that it loads.
- **Failure scenario:** someone changes `setTrackSubscriptionPermissions(false, …)` to `(true, …)`, drops `autoSubscribe:false`, or loosens `isAgent` to `startsWith('agent:')`. Every suite still passes. Once guests (`guest:`), edge senders or a stage display share the room (§1.3 grants), the owner's mic would be subscribable by every participant, and the client would subscribe to guest and edge media. The server backstop (`UpdateSubscriptions`) would be the only layer left. The task asks for isolation tests that fail on a wrong implementation, and this is the one client-side isolation rule without one.
- **Fix:** add a jest test that mocks `livekit-client` and `@livekit/react-native`. It should assert `connect(..., {autoSubscribe:false})`, that permissions are `(false, [{participantIdentity:'agent:<sid>:…'}])` before any mic publish, and that `guest:`/`edge:`/`agent:<othersid>:` publications never get `setSubscribed(true)`.

### MEDIUM-2: a failed camera rejoin leaves the screen "connected" with no room and a false "Mic on"
- **Where:** `src/features/agentLive/session.ts:394-404`.
- **Failure scenario:** the owner turns the camera on. `disconnect()` succeeds, then `connect()` with the camera token throws (network drop, or a token past its 5 min). The catch sets only `{cameraPending:false, error:'connect'}`. `phase` stays `connected` and `micOn` stays true. The owner is out of the room while the UI shows "Mic on" and live controls. The mic, blind and camera buttons call a disconnected room. A blind press would reject unhandled and silently not reach the agent. There is no recovery short of leaving the screen.
- **Fix:** in that catch, set `{phase:'failed', micOn:false, cameraOn:false, stage:null}`, or rejoin with a fresh non-camera token from `requestLiveToken({sid, camera:false})`.

### MEDIUM-3: media starts on mount, before any consent, and `consentRequired` is ignored
- **Where:** `src/screens/AgentLive/index.tsx:89-113` (it calls `start()` on mount) and `src/features/agentLive/session.ts:350` (it turns the mic on right after connect). `consentRequired` is parsed in `api.ts:157` and never read.
- **Failure scenario:** design §6 step 3 says the consent sheet comes "before any media". Opening `/agents/<own agent>/live`, including from a tapped link, creates a runtime session and publishes the owner's mic with no tap. Nobody can hear it today: the runtime doesn't start the agent without `ai_process` [CR-1], and track permissions are agent-only. So this isn't a leak, but the client inverts the ordering the design specifies, and the "Mic on" indicator comes up unprompted. The builder lists the consent sheet as out of scope. That scoping needs the orchestrator's OK.
- **Fix:** don't call `setMicrophoneEnabled(true)` (or don't connect at all) while `consentRequired` is non-empty. Start the session from an explicit "Start" tap, not on mount.

### MEDIUM-4: the start-failure path leaves a half-open room and an active runtime session while the screen stays up
- **Where:** `src/features/agentLive/session.ts:348-353`.
- **Failure scenario:** `connect` succeeds but `setMicrophoneEnabled(true)` throws (for example, the mic permission is denied). The phase goes to `failed` and the screen says "Couldn't start…", but the room stays connected with the AudioSession running. The runtime session (one per owner and agent) stays active until the owner leaves the screen, when the unmount `end()` cleans up. There is no retry, and a fresh mount gets `reused:true`.
- **Fix:** in that catch, `await r.disconnect().catch(()=>{})` and `await api.endLiveSession({sid})`, then clear `session`/`room`.

### LOW-5: ruling 3 vs `agentDid` is still unconfirmed
- **Where:** `src/features/agentLive/api.ts:69`.
- **Scenario:** the task title says "no DID sent". The client sends the agent's DID, and design §6 step 2 (`POST /live/sessions {agentDid}`) supports that. The builder's question `a61d98cf` is unanswered. If the ruling means no DID of any kind, this one field is wrong.
- **Fix:** the orchestrator confirms. If needed, send an opaque agent ref the runtime maps, and tighten the test to "no `did:` anywhere".

### LOW-6: the branch is red on `brandConfig.test.js` (3 tests) until the golden decision is made
- **Where:** `plugins/agentLive/withAgentLiveExcluded.js`, as added to the flag-off app config, against `scripts/brand-config/base-config.golden.json`.
- **Scenario:** merging as is breaks CI for every brand.
- **Fix:** answer `c90b77b4`. Option A (regenerate the golden in its own labelled commit) is right for ruling 1.

### LOW-7: `end()` during a camera rejoin can bring the room back after the end
- **Where:** `src/features/agentLive/session.ts:397-400`.
- **Scenario:** the owner presses End while `connect()` with the camera token is in flight. `end()` disconnects and posts `/end`. Then `connect` settles and `setMicrophoneEnabled`/`setCameraEnabled(true)` run on a room that may be connected again, publishing mic and camera until the runtime deletes the room.
- **Fix:** after each await in `setCamera`, check `phase() === 'connected' && session`. If it isn't, disconnect and return.

### LOW-8: rejections from `setMic`/`setBlind` go unhandled
- **Where:** `src/features/agentLive/session.ts:363-379`, and `index.tsx:216` and `:227` (`void controller?.…`).
- **Scenario:** a `publishData` failure is an unhandled rejection, and the owner gets no sign the blind didn't go. The state stays unblinded, so it fails safe but silently.
- **Fix:** wrap both in try/catch and set `error:'connect'` so the screen can show it.
