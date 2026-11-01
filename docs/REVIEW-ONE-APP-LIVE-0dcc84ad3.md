# Review: One app Live mode, build 43, 7f87024af..0dcc84ad3

Task 302c2986. Independent, read-only re-review of `fix/agent-live-review-2026-11-01` @ 0dcc84ad3 (97f00efaa plus 0dcc84ad3), against
review 46f57f86 (282f31e46). No device run, no deploy, no EAS, no TestFlight, no live system touched. The feature branch was not changed.

## Verdict: NOT CLEAN for build 43 (1 HIGH)

N1 to N5 are closed, J1 is reversed, the split is right on all three panels, and no path ends another device's session. Proof and mint
refusals send no `/end`, and neither does a consent call answered with a 4xx. One refusal still sends `/end`.

- **HIGH: P1. A consent reply of `admitted: false` still sends `/end` (`session.ts:1006-1008`), and a test pins it (`session.test.ts:280`).**
  The runtime answers 200 with `admitted: false` and a `missing` list. The code calls `fail('consent_incomplete')` without marking the session
  refused, so `finish()` sends `/end`. The commit covers "a refused consent call" only, meaning a 4xx.
- **MEDIUM: P2. The refused record is per session, not per ladder (`session.ts:297`, `:434`).** A refusal that recovered stops `/end` on every
  later outage-only ladder, and the owner is told the joins were refused.
- **MEDIUM: P3. `end()` passes `owner: true` for every caller (`session.ts:1134`).** Blur, unmount and sign-out are treated as the owner's End,
  so `/end` goes out during a refused ladder with no End pressed.
- **MEDIUM: P4. Other `/end` paths are neither the owner's End nor an outage (`session.ts:636`, `:819`, `:865`, `:1011`, `:1017`, `:568` via `:865`).**
  All are on this device's own session.
- **MEDIUM: P5. Refusal paths with no test: mutations stay green.** The brief's mutations (a3, d, e) plus b3, b5 and n6.
- **LOW:** P6 to P9, section 15.

**Questions for the orchestrator (they decide the verdict):**

1. **Is `admitted: false` a "consent refusal"?** I rated it as worded: the ruling lists "consent refusal" and says NEVER, and this is the only
   consent reply that refuses without an error status. The honest limit: `decisionsFor` (`consent.ts:39-45`) answers every kind the runtime
   listed, so a real `admitted: false` needs the runtime's required list to change between start and consent, or a runtime fault. It only hits a
   session this device just created (a reused one is guarded at `:430`). **If the ruling means only 4xx consent answers, P1 falls to LOW, the
   highest finding is MEDIUM, and this is clean for build 43 by the "any BLOCKER or HIGH" rule.**
2. **P3: are blur, unmount and sign-out "an explicit user action"?** They are pre-existing, tested behaviour (review f2caccaa F1, 679a9d48 H2),
   and the ruling as worded does not allow them. The owner's call. I did not rate them HIGH: the session is this device's own.
3. **P4: same question** for the paths listed there.

| # | Check | Result |
| --- | --- | --- |
| 1 | N1: refused proof and mint | CLEAN (`session.ts:571`, `:738`, `:848`, read at `:434`) |
| 2 | N2: Cancel during `wasHeldHere` | CLEAN (`session.ts:430`, `:975`; `session.test.ts:1624`). LOW: `:975` untested (P7) |
| 3 | N3 | CLEAN (`removalSeen` gone; `session.test.ts:1571`) |
| 4 | N4 | CLEAN (`session.ts:430`; `session.test.ts:1536`) |
| 5 | N5 to N8 | N5 CLOSED. N6 PARTIAL. N7 PARTIAL. N8 PARTIAL (all LOW) |
| 6 | J1 | CLEAN: reversed (`session.ts:771`; `session.test.ts:1083`). K1 stays final, now no `/end`. FINDING, MEDIUM (P5, no new-session test) |
| 7 | Consent refusal | 4xx CLEAN by probe, **FINDING, HIGH (P1, `session.ts:1006-1008`)**. FINDING, MEDIUM (P5, mutation d green) |
| 8 | Join removed as refused | CLEAN in code (`session.ts:666`, `:674`, `:698`, `:681`). FINDING, MEDIUM (P5, mutations e, e2 green) |
| 9 | Non-refusal outage | CLEAN on an outage-only ladder (`session.ts:830`; `session.test.ts:1499`). **FINDING, MEDIUM (P2, `session.ts:434`)** |
| 10 | No path ends another device's session | CLEAN. FINDING, MEDIUM (P3, P4: paths that are neither End nor outage) |
| 11 | The split | CLEAN on all three panels. FINDING, MEDIUM (P5, mutation n6: End on the bound non-holder panel has no test) |
| 12 | End on all three panels | CLEAN (`index.tsx:479-488`, `:265-268`, `session.ts:1138-1146`). Bearer confirmed by probe |
| 13 | Earlier closures; 16 s give-up | CLEAN within one ladder (`session.ts:830`, `:434`). FINDING, MEDIUM (P5, a3: no one-refused-rung test). LOW: G4 argument (P7) |
| 14 | Mutations | a, a2, b, c RED. **a3, d, e, e2 GREEN: FINDING, MEDIUM (P5)** |
| 15 | Flag gate | CLEAN (`eas.json:103`) |
| 16 | Tests | Live 293/293. Full suite: 4 suites fail, none Live; 2 of them pass on LF |
| 17 | Typecheck | tsc clean. tsgo 82 errors, all in `src/locale`, 0 elsewhere |
| 18 | Prebuild gate | NOT RUN (Windows). No native change |
| 19 | Scope | 6 files, all Live. None outside |
| 20 | Device items | NOT VERIFIED |

**Prebuild gate: NOT RUN on Windows. The Mac runs `expo prebuild --platform ios --no-install --clean` flag off and on. No native change in the range.**

**Flag gate: CLEAN. Only `development-live` sets the flag true (`eas.json:103`; the other 8 profiles are false). `eas.json` is not in the range. No new code runs outside the flag.**

**The split: CLEAN. Bound non-holder "Still open on your other device", no takeover, End. Unbound "Couldn't reconnect", End. Holder "Still open on your other device" plus "Take over here", End.**

## How the rule works at 0dcc84ad3

`finish()` (`session.ts:409`) holds it:

| Line | Rule | Effect |
| --- | --- | --- |
| `:430` | `endRuntime && s?.reused && !s.tookOver && !everywhere` | No `/end`. Copy `left_open` or `still_open_elsewhere` |
| `:434` | `endRuntime && s?.refused && !owner && !everywhere` | No `/end`. Copy `refused` or `refused_reconnect` |
| `:448` | Otherwise | `endOnRuntime` |

`s.refused` (`:297`) is set at: `:571` (proof), `:738` (ladder mint), `:848` (first mint), `:1002` (consent call), `:666`, `:674`, `:698` (removals).
`isRefusal` (`:480-498`): `bad_proof`, `not_found`, `consent_required`, `signed_out`, `invalid_argument`, or `http` 4xx except 408 and 429.
503 is `unavailable`, a timeout or a network failure is `network`, and an unreadable reply is `bad_response`: all outages (`api.ts:339-343`, `:383`, `:392-395`).

## 1. N1: refused proof and mint: CLEAN

Every `/end` goes through `endOnRuntime` (`:360`), from three places only: `finish` `:448`, `begin` `:965`, `retryEnd` `:1151`.

| The prior report's line | Now | Refusal branch before it | Probe, new session | Test that goes red |
| --- | --- | --- | --- | --- |
| `:746` first join throws | `:865` | `prove` `:571` | Proof 401, 404, 403: `refused`, `/end` 0 | `session.test.ts:1432`, `:1840`; `AgentLive.test.tsx:910` |
| `:711` ladder out | `:830` | `:571`, `:698`, `:666`, `:674` | Section 13 | `session.test.ts:1455`, `:1028`, `:623` |
| `:649` ladder mint refused | `:771` | `:738` | 400, 403, 409: `refused`, `/end` 0; 404: `ended_elsewhere`, 0; 401: `signed_out`, 0 | `session.test.ts:1083` |
| `:730` first mint | `:849` | `:848` | 403: `refused`, `/end` 0 (by the test, no separate probe) | `session.test.ts:1439` |

Mutations: `:571` removed gives 4 red. `:738` removed gives 3 red. `:848` removed gives 1 red. The `:434` rule off gives 10 red.

## 2. N2: CLEAN

`begin()` awaits `wasHeldHere` at `:974`. `end()` in that window reaches `:430`, which stops `/end` whatever the phase, then `:975` returns. Test `session.test.ts:1624`. Mutation: `:430` off gives 11 red, including it.

`:975` itself is untested (P7).

## 3. N3: CLEAN

`removalSeen` is gone. `s.refused` is sticky and `rejoin()` (`:723`) does not clear it. Test `session.test.ts:1571`: refused, a plain drop, then an outage, no `/end`. That test runs on a reused session, so `:430` also protects it. A new session in the same sequence is P2's other side and is correct in the probes.

## 4. N4: CLEAN

The prior `:730` and `:746` are now `:849` and `:865`, both through `fail`, then `:430`. An outage on the first takeover join sends no `/end` and says "still open, and it wasn't ended" (`index.tsx:554`). Tests `session.test.ts:1536` (row "an outage (503)"), `AgentLive.test.tsx:928`.

There is still no ladder on the first join: one try. The copy is now honest and nothing is ended, so I do not raise it.

## 5. N5 to N8

| Id | Status | Where | Note |
| --- | --- | --- | --- |
| N5 | **CLOSED** | `session.ts:984` | `session.test.ts:897`; mutation 1 red |
| N6 | **PARTIAL** | Still-open copy `AgentLive.test.tsx:928`; rejoin record `session.test.ts:1641` (mutation 1 red); timeouts `api.test.ts:279` | K2's order at `session.ts:796-798` still has no test (mutation j2 green) |
| N7 | **PARTIAL** | The "Reconnect failed" comment is gone; testID is `agentLiveReuseTitle` (`index.tsx:440`) | `session.ts:7` and `:1130` still say "continue here?" |
| N8 | **PARTIAL** | `README.md:50-68` describes the panel and the reused rule | Nothing on 0dcc84ad3's rule for new sessions; `:92` onward does not mention it |

N9 (K4's copy point) was not claimed and stays OPEN, LOW.

## 6. J1 reversed: CLEAN

**The brief's description and the prior report's IDs differ.** The prior report's **J1** is "a refused mint sends `/end`" (`:643-649` at 7f87024af). "401 final, not retried" is its **K1** (`:629-631` there). I checked both.

| Id | At 0dcc84ad3 | Against the ruling |
| --- | --- | --- |
| **J1** | `session.ts:760-776`: `finish(..., {endRuntime: true})`, turned into no `/end` by `:738` then `:434`. Copy `refused`, no longer `ended_elsewhere` | **Reversed, matches.** `session.test.ts:1083` (400, 403, 409), `:1546` (reused). Mutations b and l red |
| **K1** | `session.ts:754-757`: 401 is `signed_out`, final, not retried, no `/end` (`:738`) | Final is consistent: a 401 is a token 4xx. Probe: `/end` 0. Test `session.test.ts:1558` is reused only, so `:430` protects it. **No test on a new session** (mutation b5 green, P5) |

## 7. Consent refusal

| Answer | Line | `/end` | Test |
| --- | --- | --- | --- |
| 401 | `:1002-1003` | 0 (`signed_out`) | **None** |
| 403, 404, 409 | `:1002-1003` | 0 (`refused`) | **None**: mutation d green (P5) |
| **200 `admitted: false`** | **`:1006-1008`** | **1 (P1)** | **`session.test.ts:280` pins the `/end`** |
| 408, 429, 500, 503, network | `:1003` | 1, outage, allowed | None for 408, 429 (mutation b3 green) |

### FINDING, HIGH: P1

```ts
if (!res.data.admitted) {
  await fail('consent_incomplete')
```

Nothing marks the session refused. Probe: phase `failed`, `consent_incomplete`, `/end` 1. The fixture is the runtime's own recorded reply (`live.json:65`, `consentPartial`). The first join's mint answering 403 `consent_required` says the same thing and is treated as a refusal (`:848`), so the two disagree. The copy "Your agent can't join until every choice is made" (`index.tsx:532`) does not say the session was ended.

Fix sketch: `s.refused = true` before the `fail`, keep `consent_incomplete` in `KEEP_ON_LEFT_OPEN` or accept the `refused` copy, and turn `session.test.ts:280` round. The limit on reach is at the top of this report.

**The owner's Cancel on the sheet** (`session.test.ts:294`) sends `/end` on a new session. That is an explicit user action, not a refusal by the runtime, so I do not count it. On a reused session `:430` stops it.

## 8. Join removed as refused

| Path | Line | `/end` | Copy | Test |
| --- | --- | --- | --- | --- |
| Removal in a rejoin's first 10 s, or a continued session's first join | `:661-668` | 0 | Next rung, then `refused_reconnect` | **New session: none, mutation e green.** Reused: `session.test.ts:1342` (`:430` protects) |
| Removal, unbound | `:670-676` | 0 | Next rung | **Flag: none, mutation e2 green.** Behaviour: `session.test.ts:953` |
| Removal while the rejoin finishes | `:693-702` | 0 | Next rung | `session.test.ts:1028`; mutation e3 red |
| Removal outside 10 s, final | `:678-681` | 0 | "You were removed from the live session." (`index.tsx:544`) | `session.test.ts:373`, `:834`, `:1059`; mutation e4 red |

The probes confirm `:666` and `:674` work: `/end` 0 on both. Only the tests are missing. Refused copy: `index.tsx:548`, `:550`, `:554`. **Panel:** the Finished panel (`index.tsx:563`), Done only. The copy sends the owner to Live again, where the reuse panel has End.

## 9. Non-refusal outage

| Sequence | Line | Probe | Test |
| --- | --- | --- | --- |
| Ladder, 503 five times | `:830` | `reconnect_failed`, `/end` 1, 1/2/4/8/16 s | `session.test.ts:1499`, `:478`; mutation b8 red |
| Ladder, network five times | `:830` | Same | None of its own (timeout is `network`, `api.ts:342`) |
| Ladder, 500, 408, 429, 503, network | `:830` | Same | None |
| Taken over, then lost the network | `:830` | `/end` 1 | `session.test.ts:1375` |
| First proof 408, 429, 503, network | `:865` | `/end` 1 | None for 408, 429 |

In the same path a refusal sends none (`session.test.ts:1455`, `:1028`).

### FINDING, MEDIUM: P2

`s.refused` is never cleared, so a refusal in a past ladder decides a later one. All three start from a connected session, stay connected an hour, then run an outage-only ladder:

| Probe | Earlier event | Result | `/end` |
| --- | --- | --- | --- |
| **Control** | A 503 rung, recovered | `failed` / `reconnect_failed` | **1** |
| Sticky | A 401 proof rung, recovered | `ended` / `refused_reconnect` | **0** |
| Sticky, unbound | A removal in the unbound wait, recovered (the normal unbound path) | `ended` / `refused_reconnect` | **0** |
| Sticky, camera | A 401 on a camera proof, recovered | `ended` / `refused_reconnect` | **0** |

The orchestrator's ruling is per ladder: outages only, on no rung refused, is an outage and `/end` is allowed. Item 9 rates a missing `/end` there MEDIUM. The owner also reads "this device's joins were refused" (`index.tsx:548`) about a plain outage, and the agent stays up to its time limit.

Fix sketch: a `ladderRefused` reset at the top of each non-carried `rejoin()`, read for `reconnect_failed`; keep the sticky flag or not for the other paths as the owner prefers.

## 10. Every `/end`, and what gates it

| Call | Trigger | Gate | Kind |
| --- | --- | --- | --- |
| `:1144` | Panel End | `:1141` phase `reuse` | **Owner's End.** Only way to end a reused session not taken over |
| `:1134` | Stage End, Cancel | `:430`, phase not `reuse` | **Owner's End** |
| `:1134` | Blur `index.tsx:223`, unmount `:151`, sign-out `session.ts:957` | Same | **Not explicit: P3** |
| `:965` | Left while start was out | `:964` not reused | Own new session, after Cancel or a blur |
| `:1151` | Try again; sign-out `:957` | `endPending` from a `/end` already allowed | Retry |
| `:830` | Ladder out | `:430`, `:434` | Outage on own session |
| `:865` | Network, 5xx, timeout on the proof | `:430`, `:434` | Outage on own session |
| `:849` | First mint outage | `:430`, `:434` | Outage on own session |
| `:1003` | Consent outage | `:430`, `:434` | Outage on own session |
| **`:1007`** | **`admitted: false`** | `:430` only | **Refusal: P1** |
| `:636` | `CLIENT_INITIATED` not asked for | `:430`, `:434` | **Neither: P4** |
| `:819` | `server_outdated` on a rung (also `:865` first join) | `:430`, `:434` | **Neither: P4** |
| `:865` | `connect`, mic or room factory fails; no key to sign (`:568`) | `:430`, `:434` | **Neither: P4** |
| `:1011`, `:1017` | Consent with no token; agent didn't start | `:430`, `:434` | **Neither: P4** |
| `:755`, `:771` | Refused mint, 401 | `:738` then `:434` | No `/end` in practice |

**No path ends another device's session: CLEAN.** A session reaches `:448` only if it is new here (`reused: false`), taken over past the 10 s window (`tookOver`), or the panel's End. Runtime R3 requires the same key to replace a holder, and keys never leave a device, so a session this device made cannot normally move to another key (a mixed-build holder is the prior report's edge). Mutation `:430` off: 11 red.

### FINDING, MEDIUM: P3

`end()` (`:1132-1135`) passes `owner: true` for every caller. The comment at `:417` says "the owner's explicit End (button, or the back swipe that is End)". Blur (a deep link or a notification pushes over Live, `index.tsx:218-225`), unmount (`:151`) and sign-out (`session.ts:956-958`) are other callers. Probe, a refused proof rung then held in the ladder:

| Probe | `/end` |
| --- | --- |
| `endOpenLiveSessions()` (sign-out hook) | **1** |
| `end()` (what blur and unmount call) | **1** |

So a notification tapped during a refused ladder sends `/end` with no End pressed. On a session with no refusal the same exits send `/end` too, which is F1 and H2's design (`session.test.ts:1187`). That design and the ruling's "ONLY on an explicit user action" disagree. Question 2.

### FINDING, MEDIUM: P4

Probes, new session: unasked `CLIENT_INITIATED` `/end` 1 (`session.test.ts:392` pins it). `connect()` rejects on the first join `/end` 1 (`:1806` pins it). `connect()` rejects on every rung `/end` 1. Agent not started `/end` 1 (`:1326` pins it). A token that needs a proof with no key on the device `/end` 1, because `:568` throws `bad_proof` without `noteRefusal` although `isRefusal` lists that kind.

None is a refusal on the ruling's list, and none is an outage or an End. A LiveKit refusal could arrive as a `connect()` rejection rather than a removal. Whether it does is NOT VERIFIED (device), and if so that would be a refusal counted as an outage. Question 3.

## 11. The split

The panel is `Reuse`, `index.tsx:420-501`, reached at `session.ts:976` (`canTakeOver`: `:973-974`, `!!key && wasHeldHere`; `reuseBound`: `!!key`).

| Panel | Condition | Heading | Actions | Test | Mutations |
| --- | --- | --- | --- | --- | --- |
| **a. Bound non-holder** | Key, not held | "Still open on your other device" `:443`; body `:455-458` | **No Take over** (`:467`). End `:479-488`, Done `:489-498` | `AgentLive.test.tsx:889`; `session.test.ts:1654` | Take over on `bound`: red. **End hidden here only: GREEN (n6, P5)** |
| **b. Unbound** | No key | "Couldn't reconnect" `:445`; body `:460-464` | No Take over. End, Done | `AgentLive.test.tsx:901`, `:942`; `session.test.ts:1654` | Always "Still open": red. `reuseBound` true: red. End hidden: red (`:942`) |
| **c. Holder** | Key, held | "Still open on your other device" `:443`; body `:450-453` | **"Take over here"** `:467-478`. End, "Not now" | `AgentLive.test.tsx:877`; `session.test.ts:1654` | Holder check off: red. End hidden: red |

The code is right on all three: the End button is unconditional. No panel misses its action, copy or End. The holder's heading is the same string as the bound one, and the brief's "Still open" reads as that.

## 12. "End the live session": CLEAN

One control on all three panels: `testID agentLiveEndOpenButton`, `index.tsx:479-488`, label "End the live session on every device". Handler `:265-268`: `setLeaveWhenEnded(true)`, `controller.endOpen()`. Controller `session.ts:1138-1146`, `everywhere: true`, then `endOnRuntime` `:368`, `api.endLiveSession({sid, auth: s.auth})`.

**Bearer:** `s.auth` comes from `captureLiveAuth` at the start of this begin (`session.ts:928`, `:954`). `bearerFor` (`api.ts:293-302`) uses the account's current token while it is still signed in, otherwise the pinned one. Probe on `endOpen`: `Authorization: Bearer <the owner's>`, `/end` 1. The End tests themselves count the call. The header is asserted on the same route at `session.test.ts:1187`, `:1733`.

## 13. Earlier closures and the 16 s give-up

`api.ts` and `rejoin.ts` are not in the range. Line numbers have moved from the brief's.

| Item | Now at | Status | Mutation |
| --- | --- | --- | --- |
| H1 give-up behind a push | `session.ts:384-387`, `index.tsx:150`, `:219-231` | CLOSED | 2 red |
| H2 request bound | `api.ts:322`, `:339-343` | CLOSED | 1 red |
| H2 Leave anyway, 8 s | `session.ts:232`, `:363-365`, `index.tsx:578-597` | CLOSED | 2 red |
| H2 mic off | `session.ts:439-445` | CLOSED | 18 red |
| H3 drawer lock | `index.tsx:211-212` | CLOSED, not in the changed lines. Device NOT VERIFIED | Not re-run |
| H4 swipe on after unmount | `index.tsx:198-201` | CLOSED, not in the changed lines | Not re-run |
| H5 stale comment | `index.tsx:203-206` | CLOSED | n/a |
| G4 mic intent | `session.ts:342`, `:796`, `:858` | CLOSED by reading. **`:796` forced to `true`: 0 red** (P7) | Green |
| Prove `{token, sig}`, no exchange | `api.ts:249` | CLOSED | 2 red |
| Join on the returned token | `session.ts:574` | CLOSED | 7 red |
| Ladder 1/2/4/8/16 s, no reset | `rejoin.ts:36-38`, `session.ts:731-733`, `:667` | CLEAN | Reset: 1 red |
| After 16 s "Couldn't reconnect" | `session.ts:830`, `index.tsx:527`, `:548` | See below | a2, b8 red |
| Bound removal outside 10 s final | `session.ts:663`, `:678-681` | CLEAN | 30 s: 1 red |
| Refused mint final, any 4xx but 401, 408, 429 | `session.ts:760-776` | CLEAN | Retried: 3 red |
| 401 mint final | `session.ts:754-757` | K1, section 6 | b5 green |
| Unbound wait | `session.ts:670-676` | CLEAN, 31 s | e2 green on the flag only |

### The 16 s give-up: an outage or a refusal

**The code makes the distinction, within one ladder, as the orchestrator's ruling requires.**

| What | Where |
| --- | --- |
| The record | `Session.refused`, `session.ts:297` |
| Set on a refused rung | Proof `:571`; removal `:666`, `:674`, `:698`. (A refused mint is final at once: `:738`, `:771`) |
| Read at the give-up | `:830` `fail('reconnect_failed')`, `:454`, then `:434` |
| Rev 4 with `/end` | Outage only: `failed` / `reconnect_failed`, `/end`, "Couldn't reconnect, so the live session has ended." |
| The ruling, no `/end` | Any refused rung: `ended` / `refused_reconnect`, no `/end`, "Couldn't reconnect... The live session wasn't ended" |

| Case | Test | Probe |
| --- | --- | --- |
| **Outage-only ladder calls `/end`** | `session.test.ts:1499`, `:478`; mutation b8 red | `/end` 1 |
| Every rung refused, no `/end` | `session.test.ts:1455`, `:1028`, `:623`; mutation a2 red | `/end` 0 |
| **A ladder with ONE refused rung, no `/end`** | **NONE. FINDING, MEDIUM (P5, a3)** | **`/end` 0** on a refused proof at each of rungs 1 to 5, and on one removed rung |

A give-up that calls `/end` after a refused rung: **not found** in one ladder. Two gaps in the record: it is per session (P2, the other direction, no `/end` when allowed), and a `connect()` rejection counts as an outage (P4). A `connect()` rejection on every rung sends `/end`.

## 14. Mutations

Each ran `session.test.ts` and `AgentLive.test.tsx` (173 tests); the closure batch in section 13 added `api.test.ts` (211). Each file was restored.

| Brief | Mutation | Red | Tests |
| --- | --- | --- | --- |
| (a) | Proof branch `:571` removed | **4** | `session.test.ts:1432`, `:1455`, `:1840`; `AgentLive.test.tsx:910` |
| (a2) | Give-up ignores the record, `:434` | **3** | `session.test.ts:623`, `:1028`, `:1455` |
| **(a2 variant)** | **The ladder forgets a refused rung on a later outage rung (a3)** | **0: GREEN** | **MEDIUM** |
| (b) | Ladder mint `:738` removed | **3** | `session.test.ts:1083` x3 |
| (b) | First mint `:848` removed | **1** | `session.test.ts:1439` |
| (c) | `:430` guard off | **11** | Including `session.test.ts:1624` |
| **(d)** | **Consent `:1002` removed** | **0: GREEN** | **MEDIUM** |
| **(e)** | **Removal flag `:666` removed** | **0: GREEN** | **MEDIUM** |
| **(e)** | **Removal flag `:674` removed** | **0: GREEN** | **MEDIUM** |
| (e) | Removal flag `:698` removed | **1** | `session.test.ts:1028` |
| (e) | Final removal sends `/end` | **3** | `session.test.ts:373`, `:834`, `:1059` |

Others: the whole `:434` rule off 10 red. `!owner` removed 1 red (`session.test.ts:1476`). `everywhere` removed 2 red. End on reuse sends `/end` 3 red. `tookOver` at once 6 red; never 2 red. J1 back 5 red. `refused` copy removed 1 red.

**Green beyond the brief's list:** b3 (408, 429 as refusals), b5 (`signed_out` not a refusal), c2 (`:975` removed), j2 (K2 order), n6 (End hidden on the bound non-holder panel), m2 (`refused_reconnect` copy), m3 (`left_open` copy), G4 (`:796` forced true).

### FINDING, MEDIUM: P5

The code is correct on each of these by probe. The tests would not catch a regression: a3, d, e (`:666`), e2 (`:674`), b3, b5, n6. Items 13 and 14 rate a3, d and e MEDIUM. I rate b3, b5 and n6 the same because they guard the ruling's own exceptions and item 11's End control.

## 15. The other findings

**P6, LOW: copy that says the wrong thing.**
- `server_outdated` on a takeover: `/end` 0, while `index.tsx:525` says "so this session was ended". `KEEP_ON_LEFT_OPEN` keeps it (`session.ts:457-461`). Probe.
- Blur on the reuse panel: `/end` 0, `endReason: 'local'` (`session.ts:1132-1135`; `:430` needs `endRuntime` true, so `leftOpen` doesn't run). Coming back, the owner reads "Live session ended." (`index.tsx:560`) about a session still running. Probe.
- Refused 401: "You're signed out" says nothing about the session left running.

**P7, LOW: tests a mutation does not turn red.** j2 (K2), c2 (`:975`: the panel could open after Cancel), m2, m3 (fallback "Live session ended." about a running session), G4's argument at `:796`.

**P8, LOW: stale text.** `session.ts:7`, `:1130` ("continue here?"). `session.ts:721` ("give up and end"), `:827-829` (mentions only the reused exception). `session.test.ts:10` ("any failure... ends it"). README has nothing on the refused rule (section 5). Comment `session.ts:417` (P3).

**P9, LOW, for the owner's eye: End on the stage in the first 10 s of a takeover does not end it.** `session.ts:430`; `session.test.ts:1592`. The owner presses End, and it reads "You left the live session. It's still open on your other device and wasn't ended." Deliberate and honest, in the 97f00efaa message. The ruling allows `/end` on End, and does not require it. On a holder device, the "other device" is often this one (K4).

The timer at `:525-530` sets `tookOver` only if the phase is `connected` when it fires. An SDK `reconnecting` phase at that instant loses it until the next rejoin; the SDK's resume is off, so this should not arise. NOT VERIFIED on a device.

K4, J3, J4, J6, J7, J10, G5, G8, F8, and the "mic off blocks the panel" edge from the prior report: not touched, OPEN, LOW.

## 16. Tests

Node 24.14.0 (`package.json` asks for >=24.15.0). I ran the binaries directly, as the brief's commands name them, rather than the `pnpm` scripts CLAUDE.md prefers. Checkout is CRLF.

**Live suites: 14 suites, 293 tests, all passed.** Pattern `features/agentLive|screens/AgentLive|state/shell`. This matches the commit's 293.

**Full suite, `NODE_ENV=test jest --forceExit --maxWorkers=4`: 198 of 202 suites passed; 2614 passed, 2 failed, 28 todo, of 2644.** Exit 1.

| Failed suite | CRLF checkout | LF export of 0dcc84ad3 | Live? |
| --- | --- | --- | --- |
| `src/lib/lexicon/__tests__/lexicon.test.ts`, group/post.json (Communities) | Fails | **Still fails** | No |
| `__tests__/lib/string.test.ts`: cannot find `locale/locales/en/messages` (compiled by CI) | Fails | Fails | No |
| `plugins/uiSceneLifecycle/__tests__/withUISceneLifecycle.test.js` | Fails to run | **Passes** | No |
| `src/lib/contextEngine/__tests__/noBackgroundLocationShipped.test.ts` | Fails | **Passes** | No |

The commit message lists string, lexicon and a brandConfig golden as its 3 failures. brandConfig did not fail here. Not in the range.

**New tests:**

| Case | Test |
| --- | --- |
| Refused proof, new session | `session.test.ts:1432`, `:1840`; `AgentLive.test.tsx:910` |
| Refused first mint | `session.test.ts:1439` |
| Refused ladder mint | `session.test.ts:1083` |
| Every rung refused | `session.test.ts:1455`, `:1028` |
| Recovered refusal, then End | `session.test.ts:1476` |
| Reused, not taken over | `session.test.ts:1536`, `:1546`, `:1558`, `:1571`, `:1592`, `:1601`, `:1610`, `:1624` |
| The split | `AgentLive.test.tsx:877`, `:889`, `:901`, `:942`; `session.test.ts:1654` |
| Non-refusal outage | `session.test.ts:1499`, `:1375`, `:478` |
| Refused copy | `AgentLive.test.tsx:910`, `:928` |

## 17. Typecheck

- `tsc --noEmit -p tsconfig.communities.json`: exit 0.
- `tsgo -p tsconfig.check.json`: exit 2, 82 errors, **all 82 in `src/locale`**, 0 elsewhere. The same as the prior report: the compiled messages are absent here, and I did not compile them (CLAUDE.md, CI's job).

eslint: NOT RUN.

## 18. Prebuild gate

**NOT RUN on Windows. The Mac runs `expo prebuild --platform ios --no-install --clean` flag off and on.**

**No native change in the range:** no `ios/`, `android/`, `plugins/`, `app.config.js`, `package.json`, `pnpm-lock.yaml` or `eas.json`.

## 19. Scope

Every file in `7f87024af..0dcc84ad3`:

```
src/features/agentLive/README.md
src/features/agentLive/__tests__/api.test.ts
src/features/agentLive/__tests__/session.test.ts
src/features/agentLive/session.ts
src/screens/AgentLive/__tests__/AgentLive.test.tsx
src/screens/AgentLive/index.tsx
```

**Outside the Agent Live client, the session controller, the reuse panel, the rejoin code, the navigation and the Live screen: none.**

**Flag:** `index.tsx:68` returns the Notice with the flag off or on Android, so `LiveSession` never mounts. All the range's code is inside that. Only `development-live` sets it true (`eas.json:103`; false at `:16`, `:45`, `:74`, `:130`, `:163`, `:196`, `:228`, `:261`).

## 20. NOT VERIFIED (device or live system)

- The physical takeover on two devices, both the admitted and the refused path.
- The swipe, the lock screen, a phone call, permissions, background, stage rendering, the iOS archive.
- How LiveKit reports a refused join: a `connect()` rejection or a removal, and in which order (P4).
- Whether a real runtime answers `admitted: false` once the app decides every listed kind (P1). Read from the client and the recorded fixture only; the runtime source was not read in this run.

## 21. How this was run, including one departure from the brief

- **Branch name.** The brief names `review/0dcc84ad3-one-live-b43-r346`. That local branch already exists, checked out in another live worktree, `C:\ao\worktrees\1b4f3c1b-independent-priority-hig` (untracked `.review-scratch/`, no report, nothing on origin when last checked). It looks like a second session on the same review. Git will not check it out here, and I did not touch that worktree or read its scratch folder, so this review stays independent of it. I asked (`d1f3b8df`) and had no answer while working, so this report is on **`review/0dcc84ad3-one-live-b43-r346-302c2986`**, created from 0dcc84ad3 and pushed plainly under that same name. **The two reviews may both report. Compare them.**
- This worktree's local `fix/agent-live-review-2026-11-01` sat at 571924785, not the head under review (`origin` had 0dcc84ad3). I detached at 0dcc84ad3 to review. The local branch was not moved and nothing was committed to it.
- Probes (a temporary copy of `session.test.ts` with cases added) and 50 source mutations ran in this worktree. `git status` showed only my scratch folder afterwards. All of it was deleted before this commit. The report is the only file committed.
- `node_modules` was a junction to `C:\ao\worktrees\f2caccaa-independent-priority-hig\node_modules` (`package.json` and `pnpm-lock.yaml` identical to 0dcc84ad3), used read-only and removed before the commit.
- Read from another worktree, no writes: that worktree's git state and folder listing, to explain the branch collision.
