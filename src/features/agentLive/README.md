# Agent Live (One Live mode, client)

The owner talks to one of their own agents live, with the agent's stage full
screen. Design: runtime repo `docs/design/AGENT-LIVE-MULTITENANT-DESIGN-2026-10-30.md`
§6 (client), §1.3 (grants), §12.9.8 (blind). Dark unless
`EXPO_PUBLIC_AGENT_LIVE_ENABLED=true` (only the `development-live` EAS profile).

## Files

| File | What |
| --- | --- |
| `flag.ts` | `AGENT_LIVE_ENABLED`, exactly `'true'` |
| `api.ts` | The owner's `/live` calls (contract below). Bearer only, no owner DID or identity field, empty query. `captureLiveAuth` pins a session to the account that started it |
| `consent.ts` | The consent sheet's rules: per kind, all off, every kind decided, `ai_process` needed to go live |
| `pop.ts` | Device-key proof of possession for bound join tokens (Ed25519, `@noble/curves`) |
| `deviceKey.ts` | The per-account device key seed in expo-secure-store (`deviceKey.web.ts`: none) |
| `permissions.ts` | Mic and camera access, asked before anything is created on the runtime |
| `blind.ts` | `{"t":"blind","on":bool,"src":"*"\|"<sourceId>"}` on `stage.reply`, reliable |
| `session.ts` | The flow, connection handling and end. Plain TS, no SDK |
| `room/` | `LiveRoom` seam. `room/livekit.tsx` is the only SDK importer, reached only through `loadLiveRoomFactory()` (dynamic `import()`) |
| `GoLiveButton.tsx` | On the AgentHub for an owned agent. Renders nothing when off, or on Android |
| `../../screens/AgentLive` | The session screen, route `AgentLive` (`/agents/:agent/live`), and its consent sheet |

## Runtime contract

Built to `authority-one-runtime` `agent-live/integration` @ 3dd4ac1
(`src/live/tenant/live-routes.js`, `live-consent-routes.js`):

| Call | Body | Reply |
| --- | --- | --- |
| `POST /live/sessions` | `{agentDid, devicePubKey?}` | `{sid, region, wsUrl, token: null, expiresAt: null, popRequired, consentRequired, recordPolicy, reused, consentMissing: true}` before consent |
| `POST /live/sessions/:sid/consent` | `{decisions, textVersion, devicePubKey?}` | `{admitted, missing, token, expiresAt, popRequired, agent}` |
| `POST /live/join/prove` | `{token, sig}` (no bearer) | `{ok, token, expiresAt}`: join with THIS token, the proven one is always traded and never joins (R2 rev 4); a plain `{ok: true}` is a runtime before R2 v2 (`server_outdated`); 401 `bad_proof` |
| `POST /live/sessions/:sid/token` | `{camera, devicePubKey?}` | `{token, expiresAt, popRequired}`; 403 `consent_required` |
| `POST /live/sessions/:sid/end` | none | `{ok}` (idempotent) |

Join tokens last at most 60 s and are single use. A token minted with a
device key joins only after the proof; a proven token from the same key may
replace the connected owner (the camera rejoin), an unbound one can't.

`__fixtures__/live.json` is what those routes answered, produced by
`node scripts/agentLive/generateLiveFixtures.mjs <runtimeRoot>` over the
runtime's own test world (real DOs, the real room-service client over its fake
LiveKit, the real join backstop). Re-run it against a newer runtime commit to
refresh the contract; never edit it by hand.

## Flow

Nothing happens on arrival (a deep link included). The owner taps Continue:
mic access → `POST /live/sessions` (a session, no media) → if `reused`, the
open-session panel → the consent sheet → `consent` → proof → join → mic on.

The open-session panel (the server said `reused`; ruling on reviews
7919b5692, 563477989 and 7f87024af):

- this device held the session itself (`heldSessions.ts`, so it has the
  holder's key, R3 `mayReplace`): "Still open on your other device" with
  "Take over here";
- bound, but another device holds it: "Still open on your other device", no
  takeover;
- unbound: "Couldn't reconnect";
- always "End the live session" (every device, `/end`), and Not now / Done,
  which leave it running.

A reused session is the other device's until a join of ours stays up past the
10 s refused window (`tookOver`). Until then nothing ends it on its own: every
failure or leave says it is still open and sends no `/end`
(`still_open_elsewhere`, `left_open`). Only the panel's End does.

After any refusal (a refused proof or mint, a consent refusal including
`admitted: false`, a join removed as refused) the client never sends `/end` on
its own; it says the session was refused and wasn't ended (`refused`,
`refused_reconnect`). The record is per reconnect ladder: the 16 s give-up is
an outage, with `/end` on this device's own session, only if no rung of that
ladder was refused. Only the owner's own actions end a session this device
holds: End, deliberately going back, Cancel, sign-out or an account switch.
Being covered (a push, a notification), backgrounded or unmounted by the OS
does not: Live keeps running (an unmount leaves the room, so no mic is live
with no screen, and the session stays owed to sign-out). Any other failure
that is not an outage stops here with no `/end` and says so (`leftRunning`).

The camera publishes only after camera access, a
proven camera token and a rejoin. A session whose `recordPolicy` isn't `off`
shows a recording indicator, on the sheet and on the stage.

Connection (join gate R2, runtime design `AGENT-LIVE-JOIN-GATE-REVISED` @ adeeadb):
the edge refuses every LiveKit resume, so the SDK's own resume and reconnect are
off (`room/livekit.tsx` `NO_SDK_RECONNECT`) and a lost connection is reported as
Disconnected at once. The rule is `rejoin.ts`, the runtime workers' own
(`live-agent/src/rejoin.js` @ 58b8dd6): the same backoff and the same FINAL reasons
(CLIENT_INITIATED, DUPLICATE_IDENTITY, PARTICIPANT_REMOVED, ROOM_DELETED,
ROOM_CLOSED, USER_REJECTED), which end the session; anything else, including no
reason (the SDK giving up), rejoins.
Any other drop is a full rejoin: a fresh token from `POST /live/sessions/:sid/token`
(never the one in hand), its proof, a new join, the mic and camera restored;
backoff 1, 2, 4, 8, 16 s (31 s, longer than LiveKit's 30 s departure timeout),
then the session stops with a visible "Couldn't reconnect". An unbound token (no
device key) is removed while the dead participant is still held, so for an
unbound session a removal is one failed attempt, not the end; the next mint
says whether the session is really over. The
screen shows Reconnecting meanwhile, with the controls off. A `/rtc/v1` 404 is
handled inside the SDK (a ServiceNotFound from `/rtc/v1/validate` retries the
join on `/rtc`); `__tests__/sdkContract.test.ts` fails if an upgrade changes
that or the no-retry behaviour.

Stop path: End calls `/end`, which stops the agent's job and deletes the room.
The screen stays on "Ending…" until it answers; if it gives up, the screen says
the agent may still be live and offers Try again and Leave anyway. Signing out
or switching account ends any open session first (`registry.ts`, called from
`state/session`).
It goes out with the bearer of the account that started the session (also on
sign-out or account switch, when the screen unmounts) and is retried; it keeps
running after the screen has gone. There is no separate "Stop agent" control
in this client: End is it.

## Build gate (`plugins/agentLive`)

- On: `@livekit/react-native-expo-plugin`, `@config-plugins/react-native-webrtc`
  and `withAgentLiveBackgroundAudio` (adds `audio` to iOS `UIBackgroundModes`).
- Off: the LiveKit native packages are not autolinked. `react-native.config.js`
  sets their platforms to null, and `use_expo_modules!(exclude:)` /
  `expoAutolinking.exclude` drop the Expo module. Metro resolves every LiveKit
  import to an empty module.
- The flag is read at prebuild, pod install, Gradle and Metro time. Set it in
  the environment for all four on a local build. EAS sets it from the profile.
- `scripts/ios-archive-guard.sh pre` refuses a local archive whose `ios/` was
  prebuilt with the flag on (an `audio` background mode, LiveKit pods, no
  autolinking exclude) when the archive's flag is off, and a flag-on archive
  unless `AO_ARCHIVE_ALLOW_AGENT_LIVE=1`.

## Background audio (iOS)

A live session keeps running with the phone locked or the app in the
background:

- `UIBackgroundModes` gets `audio` in the on-build only. The other builds keep
  `['remote-notification', 'location']` exactly as `app.config.js` sets them.
- `room/audioSession.ts` is the AVAudioSession policy: `playAndRecord` in every
  engine state (`videoChat` mode with voice processing, `default` without),
  speaker by default, Bluetooth and AirPlay allowed, no `mixWithOthers`. The
  SDK default would switch to `playback` while the mic is off, and iOS will not
  start recording from the background after that category change, so unmuting
  on a locked phone would fail.
- No `voip` mode. It is for PushKit VoIP pushes and CallKit, which the app does
  not use; `audio` alone keeps the app running while the session plays or
  records. LiveKit's README lists `voip` alongside `audio` for "simple
  background processing", but its only other stated need is background camera
  (iOS 18+, `enableMultitaskingCameraAccess`), which we do not enable. Add
  `voip` together with CallKit if a more robust background is ever needed.
- Android: no microphone foreground service yet, so Android cuts the mic in
  the background. Go live is hidden on Android and the screen is off there.

## Rules the tests hold

- Ruling 1 (dark): `__tests__/buildGate.test.ts`, `screens/AgentLive/__tests__`.
- Ruling 2 (blind): `__tests__/blind.test.ts`, `__tests__/session.test.ts`.
- Ruling 3 (identity) and the contract: `__tests__/api.test.ts`, over `live.json`.
- Consent before media, drops, end, failed starts, camera: `__tests__/session.test.ts`
  (the real `api.ts` over `live.json`) and `screens/AgentLive/__tests__`.
- Proof of possession: `__tests__/pop.test.ts` (the app's signatures equal the
  ones the runtime accepted).
- The LiveKit binding (subscriptions, drop reasons, audio session, camera off):
  `__tests__/livekitBinding.test.ts`.
- Background audio: `__tests__/backgroundAudio.test.ts`.
- The archive guard: `scripts/__tests__/iosArchiveGuard.test.js`.
