# VERIFY - communities app, round 485

- Task: `74171db9` (independent, read-only, one round)
- Date: 2026-11-05
- **Verified head: `4ef27cc219cf6ca244bf4c5941d49c62e7737e8e`** on `coord/independent-priority-normal-fix-a550de71`, read from the local copy of that ref
- Build report: `docs/FIX-communities-app-r484.md` on that branch
- This report's branch: `review/verify-communities-app-r485`. It contains only this document and does not contain the build.

## Verdict: READY as the build head with flags OFF. NOT READY to arm.

The code matches Elliott's rulings D1 and D2 and the F5 app half, and nothing has changed to make it reachable: the flag is off in every release profile. A1 to A4 are all still in the code, and all four only matter once flags are on. A1 must be fixed before arming.

**Limit on this verdict: `tsc` and jest were NOT RUN in this round.** This verdict rests on reading the code and on dependency-free tests, and the TSX has not been compiled or rendered here. The only compile and jest evidence is the earlier verify's, which I have not reproduced.

| Item | Verdict | One line |
| --- | --- | --- |
| A1: real member read as non-member | **OPEN** | `descriptor.ts:165` unchanged. Confirmed by running it. HIGH for arming, and worse than first reported (below) |
| A2: `community-feed` cache not cleared | **OPEN**, but not reachable today | Nothing clears it, but no screen at this commit shows that feed. Lower than first rated |
| A3: 404 on grant route lets leave proceed | **OPEN** in the app | Confirmed by running it. A store failure also answers 404. The door branch removes the harm once it ships |
| A4: v1 grants stay on silently | **OPEN** | No app or door code touches them. Needs Elliott |
| D1: open join, no invite, no approval | **FIXED** in the app | One join path, consent version only. Blocked end to end until the door names version 2 |
| D1: invites and approvals not built | **FIXED** | Only comments and an ignored route param remain |
| Join consent kept and sent | **FIXED** | No tick, no join. Body is exactly `{consentVersion: 2}` |
| D2 Option A: toggle off join, grant on home row, v2 | **FIXED** | Confirmed in the code |
| D2: fail closed unless join-info names 2 | **FIXED** | Gate table below |
| Members-only content hidden from non-joined people | **PARTLY** | Home posts and roster are hidden. A2's cache stays. Display only; the door is the enforcement |
| F5 app half: grant off first, stop on failure | **PARTLY** | Correct except the A3 404 path |
| Red before, green after | **PARTLY** | Counts reproduced and many reds are real, but several tests only match source text |
| Flags OFF | **FIXED** | No flag, route or config file changed |

## Can `fix/communities-r474` fast-forward?

**Yes.** `9321e90` is an ancestor of `4ef27cc21`: 5 commits ahead, 0 behind. Local and `origin` tracking refs for `fix/communities-r474` both read `9321e90`. I did not fetch, so the remote ref is as last seen locally. **I did not move it.**

## What I ran

All of this ran on a scratch extract of `4ef27cc21` inside this worktree, removed before finishing. Node v24.14.0.

| Check | Result |
| --- | --- |
| r484 and r474 dependency-free tests on head | **48 of 48 pass** |
| r484 tests on `9321e90` source | **21 fail, 5 pass**, the same as the build report |
| My probes on the real `descriptor.ts`, `consent.ts`, `memberActions.ts` | Results quoted below |
| 11 one-line mutations against the dependency-free tests | Table below |

### Could not run

| Check | Why |
| --- | --- |
| `tsc --noEmit -p tsconfig.communities.json` | **NOT RUN.** No `node_modules` in this worktree, and this round allows no installs |
| Community jest suites | **NOT RUN, so no pass or fail count from this round.** Same reason |
| ESLint, Prettier | **NOT RUN.** Same reason |
| Any device, web or clickthrough run; any live door | Not allowed in this round |

I asked whether I could link another worktree's `node_modules`. Dispatch ruled no: stay inside the worktree and report these as not run.

The earlier verify `e12995b0` reports `tsc` passing, 24 community suites with 439 tests passing, and 2 files failing Prettier on this same commit. **These numbers are not reproduced here.** It got them by linking another worktree's `node_modules`, which this round's ruling does not allow. Its report is at `docs/VERIFY-communities-app-r484.md` on `review/verify-communities-app-r484`.

## Door facts used

I read the runtime worktree for task `bebf5b5d` read-only: `fix/communities-door-r484` @ `3238661f`, `src/communities/door.js`. **That branch is not in runtime `main`, and its own report says it does not reach prod.** I read source only and ran nothing there. The runtime's flag values were not checked (see Process notes).

| Fact | Where | Effect |
| --- | --- | --- |
| `viewer_is_admin` is sent only with `communities.admins.enabled`, default off. No `role` either | `door.js:26`, `:239` | Confirms A1's condition |
| `GET /:id` is behind the membership check | `door.js:377` | A successful read does mean "member" |
| Grant routes match only with their flag on, otherwise 404 | `door.js:191-192` | The A3 404 |
| Any store failure on a member route answers 404 | catch block after `door.js:377` route switch | A second A3 404 that has nothing to do with the flag |
| Leave deletes membership and grant in one commit, whatever the grant flag says | `door.js` `leave()` | Removes A3's harm once shipped |
| Join clears any old grant | `door.js` `join()` | Makes the v2 "no access when you join" wording true for a rejoiner |
| A repeat join by a member answers `joined: true` | `door.js` `join()` | The build report's `joined: false` worry doesn't arise on this door |
| Membership records store `consentVersion` | `door.js` `join()`, `membership-commit.js:38` | The door could identify v1 members for A4 |

## A1 to A4

### A1 - HIGH for arming - OPEN

`src/screens/Community/descriptor.ts:165` is unchanged. Probe on the real function, with the door's admins-off shape:

```
A1 isMember= false postsSource= none       (no viewer_is_admin, no role)
A1 admins-on isMember= true                (viewerIsAdmin present)
```

**What the person sees:** they join, get "You're in", open the community and see the wall and a Join button. Joining again answers `joined: true` on this door, so "You're in" repeats and the loop never ends.

**This is worse than "fails closed".** The earlier verify and the build report describe a display problem. But `isMember` also gates the controls:

- `MemberActionsSection.tsx:44` returns null, so there is **no Leave button and no Export**.
- `AgentGrantSection.tsx:36` returns null and `queries.ts:150` disables the grant read, so there is **no grant row**.

So a member whose grant is on cannot see it, turn it off, or leave from the app. A new join starts with the grant off, so this needs a grant made earlier, for example before the admin flag was turned off, with the grant flag on. That is narrow, but it is the failure the F5 ruling exists to prevent.

**Reachability:** none with flags off. The Dev capture of 2026-10-30 carries `viewer_is_admin`, so Dev had admins on at that date; I can't say what it has now. It hits every member on any door with communities on and admins off, and off is that flag's default. No dependency-free test covers it: mutation C11 changed this line and nothing failed.

### A2 - OPEN in code - LOW today, MED once the feed is wired

`removeCommunityMemberContent` (`queries.ts:166`) clears timeline, grant and roster, not `community-feed`. `removeCommunityQueries` (`cache.ts:15`) has no caller on leave or refusal.

**I rate this lower than the earlier verify, which said the combined feed "can go on showing" the posts.** At this commit nothing appears to render that feed:

- Home takes its feeds from pinned feed infos (`Home.tsx:153`, `:331`), not from the switcher.
- `useSelectedCommunityFeed` is read only by the switcher, and `selected-community.tsx:10` says so.
- `getOfferedCommunityFeedDescriptors` has no caller.
- I found nothing else that builds a `communities` or `community|` descriptor for a feed.

This comes from searching and reading, not from running the app. The cache is also memory only (`react-query.tsx:230`). It should still be fixed before anyone wires the switcher to Home, because at that point the leak becomes real. No test would catch it.

### A3 - OPEN in the app - MED if the app ships before the door, LOW after

Probe on the real `leaveCommunity`:

| Grant answer | Leave called | Result |
| --- | --- | --- |
| **404** | **yes** | **`ok: true`** |
| 503, 403, network, signed out | no | `grant_off_failed` |
| 2xx `on: true` | no | `grant_off_failed` |
| 2xx `on: false` | yes | `ok: true` |

The code comment at `memberActions.ts:27` says a 404 means the agent route is off. **That is not the only cause:** the door's catch-all answers 404 on a store failure too. So a failed grant write can be read as "no grant", and the leave goes ahead.

- **Against a door without the r484 fix:** the grant can outlive the membership, which is what F5 is meant to stop.
- **Against the r484 door:** the leave removes the grant itself in one commit, so no harm remains.

**A false message on the same path, LOW:** if the grant call 404s and the leave then fails, `MemberActionsSection.tsx:66-71` sets the row to off and `:134` says "the community agent's access is off". After a 404 nothing confirms that.

Changing the 404 test alone would trap people while the grant flag is off, because leave would always stop. I would not change it; ship the door first.

### A4 - OPEN - MED if real people joined under v1

Nothing in the app addresses it. The door keeps it deliberately: its test is `a member who joined under consent version 1 keeps access until a re-consent is ruled`. The row does show "on" to a member whose grant read succeeds, so the grant is not hidden, but nobody is told or asked.

This only matters if real people joined under v1. I could not check that. The door report's branch table suggests prod has no door, which would leave only Dev test accounts, but that is an inference from git.

## Rulings

### D1 open join

- `agreeAndJoin` is the only caller of `join`, and the join screen is its only caller.
- The existing r484 test runs the real client against a stubbed `fetch`: the body is exactly `{consentVersion: 2}`.
- `JoinConsentEntry` is deleted with no references left. The home's Join button and the refused home both go to `CommunityJoin`.
- Added code naming invite or approval: comments and README text only. `lib/routes/types.ts:164` still says `invite` "may arrive from an invite link"; nothing reads it, and the comment is stale.
- **Not working end to end until the door names 2.** The Dev capture names 1, so the gate stops every join until the door branch ships.

### D2 consent v2, fail closed

Probe on the real `consentGateFor`:

| join-info `wording_version` | Gate |
| --- | --- |
| `2` | `ok`, version 2 |
| `1`, `3`, `2.5` | `unsupported` |
| `null`, missing, the string `"2"`, `NaN`, no join-info | `missing` |

Only `ok` renders the consent box and Agree button (`JoinConsent.tsx:157`, `:175`), and `agreeAndJoin` refuses any unsupported version without calling the door. The toggle, owner-agent query and grant call are gone from join, and `AgentGrantSection` still renders `AgentGrantRow` on the home.

### Members-only content

| Surface | Result |
| --- | --- |
| Home, `GET /:id` refused | Hidden, checked before the cached descriptor (`index.tsx:85`) |
| Posts, timeline refused | Wall over cached pages (`PostsSection.tsx:55`) |
| Members tab, timeline refused | Hidden (`MembersSection.tsx:68`) |
| Timeline, grant and roster caches on refusal or leave | Cleared. The roster's partial key should match by TanStack's prefix rules; not run here |
| Combined feed cache | Not cleared, not reachable today (A2) |

All of this is display. The door check is the real enforcement, and it's on the unshipped door branch.

### F5 app half

Grant off comes first, and every failure other than a 404 stops the leave (table under A3). `leaveCommunity` is the only caller of `leave`.

**New, LOW: last admin.** With admins on, the door refuses the last admin's leave with `409 last_admin`. The app has already turned the grant off by then, so the door test `the last admin refused by the leave guard keeps both membership and grant` doesn't describe what an app user gets. The person loses the grant and is told "Please try again", which will never succeed. This errs on the private side, so it's a wording and flow gap.

**New, LOW: join store failure.** The door answers a store failure on join with its refusal 404, so the app says the community "didn't accept your request" rather than "try again". That comes from the door's design and needs no action now.

## Are the tests real?

**Red before:** reproduced at 21 fail and 5 pass. The build report's own caveats are accurate: 5 tests were green at base, and `the join screen ignores an invite` was red only because of a code comment.

**Green after:** I broke one line at a time in the scratch copy and ran the 48 dependency-free tests, restoring and checking each file.

| Break | Tests failing |
| --- | --- |
| C1: a still-on grant counts as off | 1 |
| C2: any grant failure lets leave proceed | 2 |
| C3: a 404 no longer lets leave proceed | 1 |
| C4: version 1 supported again | 3 |
| C5: tick not required | 1 |
| C6: `joined: false` welcomed | 1 |
| C7: a 404 read isn't a refusal | 2 |
| C8: `canShowMemberContent` ignores refusals | 1 |
| **C9: the screen's gate check removed** | **0** |
| **C10: the screen no longer shows the unsupported state** | **0** |
| **C11: `isMember` always true** | **0** |

So the logic modules are really protected, but the dependency-free tests don't protect screen wiring or A1. C9 is backed up by `agreeAndJoin`'s own version check. The earlier verify reports wider gaps in the screen wiring when run under jest; I have not reproduced that.

C3 also shows that a test pins the A3 behaviour as intended, so a fix to A3 has to change that test.

## Flags

- `EXPO_PUBLIC_COMMUNITIES_ENABLED` at this commit is `"false"` in `base`, `development`, `preview`, `production`, `production-apk`, `testflight` and `testflight-android`. It is `"true"` only in `development-communities`.
- `COMMUNITIES_ENABLED` is true only for `'1'` or `'true'` (`src/env/common.ts:206`).
- Since the round 470 base `1cc4c02e`, there is no change to `eas.json`, `app.config.js`, `app.json`, `package.json`, `pnpm-lock.yaml`, `src/routes.ts`, `src/Navigation.tsx`, `src/lib/routes`, `src/env` or `src/lib/agent-runtime/config.ts`.

## What Elliott must decide

1. **Fast-forward `fix/communities-r474` to `4ef27cc21`?** It is clean. **Recommendation: yes.** Until then that branch lacks this work.
2. **A1: how does the app know someone is a member?** Must be settled before arming.
   - **Recommendation: treat a successful `GET /:id` as membership, in the app.** The door already gates that route, `toDescriptor` has one caller, and no door change is needed. This is display only, so a wrong answer can't expose anything the door refuses.
   - The alternative is an explicit field from the door. The earlier verify preferred it, and it is sturdier if the door ever serves non-members on this route, but it needs another door change.
   - Keeping the admin flag on wherever communities are armed also avoids A1, but leaves it waiting for the next flag change.
3. **A4: did real people join under v1, and what happens to their grants?** **Recommendation: turn those grants off in a runtime migration,** because the v1 wording named the wrong agent. If only test accounts exist, no action is needed. Membership records carry `consentVersion`, so the door can find them.
4. **A3: keep "404 lets leave proceed"?** **Recommendation: keep it, and don't release this app against a door without the r484 fix.** That makes the app and door ship together, which D2 already requires.

**No decision needed, but belongs in the plan:**

- Run `pnpm test` on this head somewhere with dependencies, since this round could not.
- Ship the app and door r484 together. Also needed for version 2 to work at all.
- Clear `community-feed` on leave and refusal before the switcher drives Home (A2).
- Correct the "access is off" message after a 404, and the last-admin "try again" message.
- Add tests for A1 and for the screen's gate (C9, C10, C11).
- Remove the stale `invite` comment.
- Run a device clickthrough of join, refusal and leave before any flag goes on.

## Process notes

- **The target was not changed,** and no branch but this one was pushed. No merges, deploys, installs or live calls.
- **One command was blocked.** A search of the runtime worktree named its wrangler config file, in order to read flag values, and hit the deny-list's `wrangler-any` rule. I was not running wrangler. I did not retry or read that file another way, so **the runtime's flag values are unchecked**, and the reachability above rests on code defaults and the 2026-10-30 capture.
- **My first push was blocked** (`git-push-unsafe`) because I had added an output redirect and pipe to the command. Nothing had been committed or pushed. I then ran the plain push command that the run rules prescribe.
- This worktree started from `main`, so the working copy's own `eas.json` is not the target's. Everything above was read from `4ef27cc21` directly.
- The other worktree was only read. Scratch files stayed inside this worktree, in untracked folders, and were never committed.
