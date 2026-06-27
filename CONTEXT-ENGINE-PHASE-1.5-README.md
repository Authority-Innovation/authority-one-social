# Context Engine — Phase 1.5: all-day background "where we went"

Branch: **`feat/context-engine-background`** (isolated; do NOT merge to the shippable
`feat/authority-one-theme`). Phase 1.5 adds **Always-location + a background-location
mode**, which raises App Store review scrutiny — keeping it off the shippable branch lets
build 12 stay clean.

Phase 1.5 **reuses the entire Phase 1 pipeline** (derive → conclusion → store → sync →
Bob memory) and changes ONLY the location **source**: from foreground interval sampling
to OS background updates. Output is unchanged: **CONCLUSIONS ONLY** (place + dwell), never
a raw GPS trail.

---

## What changed

### Config (this branch only) — `app.config.js`
- `infoPlist.UIBackgroundModes`: added `'location'` (was `['remote-notification']`).
- `infoPlist.NSLocationAlwaysAndWhenInUseUsageDescription`: honest justification string
  (all-day place context for the agent; conclusions stored on-device, never a trail).
- `expo-location` plugin: `isIosBackgroundLocationEnabled: true`,
  `isAndroidBackgroundLocationEnabled: true`, plus the Always + when-in-use permission
  strings.

### Capture (battery-light, background) — `src/state/contextEngine/backgroundLocation*.ts`
- `backgroundLocation.native.ts`: a `TaskManager.defineTask` background task +
  `startLocationUpdatesAsync`/`stopLocationUpdatesAsync` controls.
  - **Battery:** balanced (not high) accuracy, `deferredUpdatesInterval` ~5 min /
    `deferredUpdatesDistance` ~120 m, `pausesUpdatesAutomatically`. NO continuous
    high-accuracy GPS.
  - **TODO(CLVisit):** expo-location does NOT expose iOS `CLVisit` (true OS visit
    detection — arrival/departure, system-grade battery). This deferred/distance-filtered
    update path is the pragmatic visit approximation. A small native module wrapping
    `CLLocationManager.startMonitoringVisits` + `didVisit:` would give visit-grade
    fidelity and lower battery; the derive/store/sync pipeline would be reused unchanged
    (a visit → a conclusion). Clearly marked in the source.
- `backgroundLocation.ts`: web/non-native stub (everything reports unsupported / no-ops).

### Derive / store / sync — REUSED, not rebuilt
- The background task calls the EXISTING `derivePlace` and a new PURE `advanceDwell`
  (visit-style: on departure to a new place, flush the previous dwell as a `ContextEvent`
  with its elapsed minutes), then the EXISTING `appendEvent` (local store) and
  `postContextEvents` (runtime sync `/app/context/events` → Bob memory).
- `store.ts`: `loadPrefs`/`savePrefs` carry the new `backgroundEnabled`; added
  `loadOpenDwell`/`saveOpenDwell`/`clearOpenDwell` so the stateless background task can
  compute dwell across wakes. Raw coordinates are reduced to a conclusion in the task and
  discarded — never stored or synced.

### Opt-in (separate, higher) — `ContextEngineProvider` + Settings screen
- New `ContextPrefs.backgroundEnabled` (OFF by default), independent of Phase 1
  `enabled`. The provider exposes `backgroundSupported`, `backgroundPermissionGranted`,
  `backgroundActive`, and `setBackgroundEnabled`.
- The Context Engine settings screen gains a **distinct "All-day place context" toggle**
  with its own active indicator + transparency copy, below the existing when-in-use
  section. Turning it on requests the **Always** permission and starts background updates;
  off stops them. **Existing when-in-use Phase 1 behavior is untouched** for users who
  don't enable background.
- **Defence in depth:** the background task re-checks `backgroundEnabled` on every wake,
  so nothing is captured if the user turned it off after the OS queued an update.

---

## App Store review justification (Always-location background use)

Reviewers scrutinize Always-location + the `location` background mode. The honest,
review-ready framing:

- **Purpose:** the app's AI agent gives the user all-day context ("you spent the afternoon
  at a venue downtown") so it can be genuinely helpful. That requires noticing the coarse
  places the user goes even when the app is closed.
- **Data minimization (the key point):** the app does **not** collect or transmit a
  location trail. Each background update is reduced **on-device** to a coarse CONCLUSION
  (a place band like home/work/venue/out + dwell minutes) and the raw coordinates are
  discarded. Only conclusions are stored locally and optionally synced.
- **Transparency + control:** background context is **OFF by default**, a separate
  explicit opt-in distinct from when-in-use, with an in-app active indicator and one-tap
  off; the system Always-permission prompt and (on Android) a foreground-service
  notification surface it too.
- **Permission string:** see `NSLocationAlwaysAndWhenInUseUsageDescription` in
  `app.config.js` — states the all-day-context purpose and the conclusions-only,
  no-trail guarantee.

---

## Verified here vs. needs a device

- **Verified:** typecheck (no new errors — 8 baseline = pre-existing `approvals`/`tts`
  tests only), ESLint clean on changed files, and the Context Engine test suites green
  (28 tests) — including the Phase 1.5 background gate, visit-style `advanceDwell`, the
  `backgroundEnabled` pref round-trip, and open-dwell persistence.
- **Needs a device + provisioning** (cannot run here): the actual background updates and
  the `TaskManager` task firing while the app is suspended. Build with the new config
  (`npx expo prebuild --clean -p ios`, then run on a device), grant **Always** location,
  move between places, and confirm conclusions appear in the context log and reach the
  runtime. iOS background location does not work in the simulator.

## Notes
- `expo-task-manager ~14.0.9` was added (required by `expo-location`'s background API).
  Run `pnpm install` after checking out this branch if your `node_modules` predates it.
- The background task is registered at module top level (`backgroundLocation.native.ts`),
  imported via the provider so it registers on app launch — including a background launch
  the OS triggers to deliver a queued location.
