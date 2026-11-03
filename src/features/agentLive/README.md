# Agent Live (One Live mode, client)

The owner talks to one of their own agents live, with the agent's stage full
screen. Design: runtime repo `docs/design/AGENT-LIVE-MULTITENANT-DESIGN-2026-10-30.md`
§6 (client), §1.3 (grants), §12.9.8 (blind). Dark unless
`EXPO_PUBLIC_AGENT_LIVE_ENABLED=true` (only the `development-live` EAS profile).

## Files

| File | What |
| --- | --- |
| `flag.ts` | `AGENT_LIVE_ENABLED`, exactly `'true'` |
| `api.ts` | `POST /live/sessions` `{agentDid}`, `/:sid/token` `{camera}`, `/:sid/end`. Bearer only, no owner DID or identity field, empty query |
| `blind.ts` | `{"t":"blind","on":bool,"src":"*"\|"<sourceId>"}` on `stage.reply`, reliable |
| `session.ts` | Start, mic, blind, camera, end. Plain TS, no SDK |
| `room/` | `LiveRoom` seam. `room/livekit.tsx` is the only SDK importer, reached only through `loadLiveRoomFactory()` (dynamic `import()`) |
| `GoLiveButton.tsx` | On the AgentHub for an owned agent. Renders nothing when off |
| `../../screens/AgentLive` | The session screen, route `AgentLive` (`/agents/:agent/live`) |

## Build gate (`plugins/agentLive`)

- On: `@livekit/react-native-expo-plugin` and `@config-plugins/react-native-webrtc`.
- Off: the LiveKit native packages are not autolinked. `react-native.config.js`
  sets their platforms to null, and `use_expo_modules!(exclude:)` /
  `expoAutolinking.exclude` drop the Expo module. Metro resolves every LiveKit
  import to an empty module.
- The flag is read at prebuild, pod install, Gradle and Metro time. Set it in
  the environment for all four on a local build. EAS sets it from the profile.

## Rules the tests hold

- Ruling 1: `__tests__/buildGate.test.ts`, `screens/AgentLive/__tests__`.
- Ruling 2: `__tests__/blind.test.ts`, `__tests__/session.test.ts`.
- Ruling 3: `__tests__/api.test.ts`.
- Camera off by default, and published only after the camera token and a
  rejoin: `__tests__/session.test.ts`, `screens/AgentLive/__tests__`.

Fixtures (`__fixtures__/piece1Live.ts`) follow piece 1's route shapes. They
were not captured from Dev, because Dev has no `/live` route yet. Re-capture
them once it does.
