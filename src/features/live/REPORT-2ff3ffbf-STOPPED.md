# Agent Live 9 (task 2ff3ffbf): Live mode in the One app, client only, STOPPED before code

*Repo `authority-one-social`, branch `coord/agent-live-9-app-client`, base `origin/communities/integration`
at `03ea8768d` (the head named in the spec). PC builder, 2026-10-30. No code, config, `eas.json` line or test was
written. Nothing was run, built, deployed or merged. This file is the only change.*

## STOPPED

The independent design review (task 70e45d94, runtime branch
`origin/coord/review-only-fresh-opus-multi-ten-70e45d94`, commits `ef62a5e6` + `35d3a333`,
`docs/reports/REVIEW-70e45d94-AGENT-LIVE-MULTITENANT.md`) rates the design (`1e00dbdb`) "not fit to approve as
written", and five of its findings change §6 (the One app client), D10 and the §1.3 grants this client is built
on. **CR-1** moves agent dispatch after the owner's consent (or has the job subscribe to nothing until consent),
so the §6 step 2 to step 3 order changes, and `ai_process` now gates whether the agent hears a person at all.
**L2** removes presigned playback URLs from the app: §6's "never hold" list ("it only gets presigned URLs
valid ≤10 min") is replaced by a gated decrypting route, and X-STO-3 becomes X-STO-5. **K-7** asks the One app
to support hybrid voice (on-device STT sending text on the data channel), which changes this task's "mic in"
path. **CR-2** says the agent is never `hidden` and is listed with an AI label, which changes what the session
screen shows. **L4/L6** change the room (one per session, not per pair, which also changes D1), the token TTL
and refresh model the reconnect step (§6 step 8) relies on, and restrict stage subscriptions to the agent's
`stage` track. Separately, two inputs this task depends on do not exist: the **stage contract from task 8** was
never built (task 71ba7f17 also STOPPED on this review, commit `3527ae5c`), so the "blind" message and the
stage track shape are undefined; and `origin/deploy/dev-communities` (`17586054`) has **no live token route**
(no `/live/sessions`, no LiveKit token response anywhere under `src/`), so there is no real-shape fixture to
read and the spec forbids inventing fields. Which review fixes to adopt is Elliott's decision, not this
builder's, so per the task spec I stopped here.

## Also needs a ruling (spec vs design)

- The task says the room token is "requested with the owner's DID" and the test asserts "the token request
  carries the DID only". The design (§6 step 2, R3, test X-TOK-1) says identity comes from the owner bearer
  only and an `ownerDid` in the body is ignored. These conflict. Unless Elliott rules otherwise, the client
  should send the bearer and `agentDid` only.

## What would unblock it

1. Elliott's rulings on CR-1, L2, K-7, CR-2, L4 and L6 as they affect §6 and D10 (a revised design, or a note).
2. Task 8's stage contract landed (stage track name and shape, the `stage` / `stage.reply` data topics, the
   "blind" message format).
3. The runtime's `POST /live/sessions` and `POST /live/sessions/:sid/token` response shape on
   `deploy/dev-communities`, so the client tests use real fixtures.
4. The DID-in-request question above.

## Planned shape (for the next session, once unblocked)

- `src/features/live/`: `flag.ts` (`EXPO_PUBLIC_AGENT_LIVE_ENABLED === 'true'`), `LiveButton.tsx` (renders
  nothing when off; LiveKit loaded only from the screen module), `api.ts` (owner-bearer session and token
  calls, no token in any log), `README.md`.
- `src/screens/Live/`: `index.tsx` session screen (stage full screen, mic indicator, blind/mute control,
  camera toggle default off; camera token requested only on toggle), `__tests__/`.
- `eas.json`: one new `development-live` profile with `EXPO_PUBLIC_AGENT_LIVE_ENABLED: "true"`, and nowhere else.
- §8 IDs on this surface: X-TOK-1 (client half: no DID or identity in bodies) and X-LOG-1 (client half: no
  token or DID in log lines), plus the task's own flag-off/no-import, camera-default-off and
  camera-publishes-only-when-on assertions.

## Read, and not verified

Read: the design's Decisions table, §1.2, §1.3, §6 and §8 at `1e00dbdb`; the full review 70e45d94; the STOPPED
reports of agent-live tasks 5, 6, 7 and 8 (all stopped on the same review); a grep of
`origin/deploy/dev-communities` `src/` for live and LiveKit routes. Not verified: whether Elliott has ruled on
the review anywhere off the bus. Tests: none run (no code), so `tests_green` is left unset.
