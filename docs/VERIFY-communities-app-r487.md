# VERIFY - communities app, round 487

- Task: `94fb1cfe` (independent, read-only, one round)
- Date: 2026-11-05
- **Verified head: `5a54c68b4c7cf0889873e8bc79304dd68768a3df`**, the tip of `origin/fix/communities-r474` when fetched. It contains `4ef27cc21`.
- Build report: `docs/FIX-communities-app-r487.md` on that branch
- This report's branch: `review/verify-communities-app-r487`. It contains only this document and does not contain the build. The target was not changed.

## Verdict: READY for arming planning, with flags OFF. Not yet clear to arm.

A1 is fixed and fails closed, and tests catch C9, C10 and C11. The rulings are intact and the flag is off in every release profile.

**`tsc`, jest, ESLint and Prettier were NOT RUN.** This worktree has no `node_modules`, and this round allows no installs or junctions. The verdict rests on reading the code, the dependency-free tests, my own mutations and a probe. The TSX has not been compiled or rendered in this round, and the new jest cases have never run.

Arming needs two checks that this round could not do: the jest and compile run, and a look at the door's list route. **The first matters more than usual: no dependency-free test notices if the A1 fix is unwired (below).**

| Item | Verdict | One line |
| --- | --- | --- |
| A1: real member read as non-member | **FIXED**, fails closed | Correct in every door and list case I probed. The screen's wiring to it is protected only by jest that has not run |
| C9: screen's gate check | **FIXED** | Caught. All 8 mutations that weaken the handler or gate line fail tests |
| C10: unsupported and missing states | **FIXED** | Caught. All 6 mutations fail tests. Not a render |
| C11: `isMember` always true | **FIXED** | Caught. All 6 mutations fail tests |
| Open join, no invite, no approval | **FIXED** in the app | Unchanged. Body is exactly `{"consentVersion":2}` |
| Join consent step | **FIXED** | Unchanged. No tick, no door call |
| D2 Option A: toggle off, v2, fail closed | **FIXED** | Unchanged. Only join-info naming the number 2 offers join |
| F5 app half | **PARTLY** | Kept and unchanged. The A3 404 path remains, as r485 found |
| Flags OFF | **FIXED** | No flag, route or config file changed |
| A2, A3, A4 | **OPEN** | Not touched in this round, and not in its scope. See r485 |

Nothing tested here is **WRONG**.

## What I ran

All of this ran on a scratch extract of `5a54c68b4` in an untracked folder inside this worktree, removed before finishing. Node v24.14.0.

| Check | Result |
| --- | --- |
| r487, r484 and r474 dependency-free tests on head | **81 of 81 pass** |
| r487 tests with `access.ts`, `descriptor.ts`, `queries.ts` from `4ef27cc21` | **14 fail of 33**, all in the A1 file, the same as the build report |
| The builder's `mutations.mjs` | **9 of 9 caught**, with the same counts as the build report |
| My own 42 mutations, plus a plain revert of the wiring | Tables below |
| Probe: real home read and real client against a stubbed `fetch` | Tables below |

### Not run

| Check | Status |
| --- | --- |
| `tsc --noEmit -p tsconfig.communities.json` | **NOT RUN.** No `node_modules`, no installs |
| Jest, including the new cases and existing community suites | **NOT RUN,** so no pass or fail count from this round |
| ESLint | **NOT RUN** |
| Prettier | **NOT RUN.** The r484 verify reported `access.ts` and `MembersSection.tsx` failing. `access.ts:25` is still 81 columns, and it predates this round |
| Device, web or clickthrough run; any live door | Not allowed in this round |

## A1 - FIXED, fails closed

The screen's only home read is `useCommunityQuery` (`queries.ts:49`), which now calls `readCommunityHome` (`access.ts:45`). `toDescriptor` has no other caller, and `isMember` is `doorStatesMembership(community) || joined` (`descriptor.ts`).

Probe through the real client:

| Door `GET /:id` | List `GET /communities` | Result | List read? |
| --- | --- | --- | --- |
| Omits membership | Names this id | **Member, not admin**, member content shown | Yes |
| Omits membership | Other ids, or empty | Non-member: wall and Join, no content | Yes |
| Omits membership | 500, 503, 403, 404, 401, network failure | **Error state:** no content, wall or Join | Yes |
| Omits membership | 200 with no `communities` key, not an array, or not JSON | **Error state** | Yes |
| `viewer_is_admin` true | Not read | Member, admin | No |
| `viewer_is_admin` false | Not read | Member, not admin | No |
| 403 or 404 | Not read | Refusal: "for members" and Join | No |
| 500 | Not read | Error state | No |

- A failed list is never passed on as a refusal, so a 404 from the list can't offer Join to someone already in.
- `index.tsx` checks `refused`, then `isError`, then `community`, so a failed refetch hides a cached descriptor. I confirmed this by reading it, not by rendering it.
- `viewerIsAdmin` comes only from the door, so the list can't make anyone an admin.
- `MemberActionsSection` and `AgentGrantSection` gate on `isMember`, so a joined member gets Leave, Export and the grant row back. I read this and did not render it.
- All of this is display. The door is the enforcement.

## Mutations

One line at a time on the scratch copy, each restored afterwards. I confirmed the 7 source files I mutated were back to their committed content before the plain revert below. I wrote these separately from the builder's list and included its edits. Counts are failing tests, for the 33 r487 tests and for all 81.

### C9, C10, C11

| ID | Group | Mutation | r487 | All |
| --- | --- | --- | --- | --- |
| V01 | C9 | Handler: gate check dropped | 5 | 5 |
| V02 | C9 | Handler: only `unsupported` blocked | 2 | 2 |
| V03 | C9 | Handler: only `missing` blocked | 3 | 3 |
| V04 | C9 | Handler: tick check dropped | 1 | 1 |
| V05 | C9 | Handler: pending check dropped | 1 | 1 |
| V06 | C9 | Gate line: always ok | 10 | 10 |
| V07 | C9 | Gate line: ignores join-info | 10 | 10 |
| V08 | C9 | Handler: hard-codes version 1 | 1 | 1 |
| V09 | Button | Button joins directly, skipping the handler | **0** | **0** |
| V10 | Button | Button no longer disabled until ticked | **0** | **0** |
| V11 | C10 | Unsupported branch: condition false | 3 | 3 |
| V12 | C10 | Unsupported branch deleted whole | 3 | 3 |
| V13 | C10 | Missing version no longer shows load error | 2 | 2 |
| V14 | C10 | `isError` no longer shows load error | 1 | 1 |
| V15 | C10 | Consent box inside the update state | 3 | 3 |
| V16 | C10 | Update state test id removed | 3 | 3 |
| V17 | C11 | `isMember: true` | 4 | 4 |
| V18 | C11 | `isMember: ... \|\| true` | 4 | 4 |
| V19 | C11 | `doorStatesMembership` always true | 10 | 10 |
| V20 | C11 | `joined` defaults to true | 1 | 1 |
| V21 | C11 | Home read: `joined` always true | 2 | 2 |
| V22 | C11 | `postsSource` ignores `isMember` | 1 | 2 |

**V09 and V10 are not C9 bypasses.** The Agree button exists only in the `ok` branch, which V11 to V16 guard. V09 alone still leaves the button disabled until ticked, and V10 alone still leaves the handler's checks. They would matter only in combination. The jest case at `JoinConsent.test.tsx:262` covers V10, but it has not run here.

**How much the C9 and C10 tests prove:** they lift real statements from `JoinConsent.tsx` and run them, which is stronger than matching text, but they are not a render. They read test ids from a branch's source, so a change to what a branch shows that keeps its test ids would pass.

### A1

| ID | Mutation | r487 | All |
| --- | --- | --- | --- |
| V23 | Join record ignored in descriptor (the original bug) | 3 | 3 |
| V24 | Home read doesn't pass `joined` | 2 | 2 |
| V25 | Failed list reads as non-member | 5 | 5 |
| V26 | Failed list reads as member | 5 | 5 |
| V27 | Failed list passed through, so a 404 reads as a refusal | 2 | 2 |
| V28 | Any list entry counts | 2 | 2 |
| V29 | Id match inverted | 4 | 4 |
| V30 | Join record grants admin | 1 | 1 |
| V31 | Door refusal no longer returned early | 1 | 1 |
| V32 | List read even when the door states membership | 3 | 3 |
| **V33** | **`queries.ts` stops using `readCommunityHome`** | **0** | **0** |
| **V34** | **`index.tsx` `isError` branch removed** | **0** | **0** |

### Rulings

| ID | Group | Mutation | r487 | All |
| --- | --- | --- | --- | --- |
| V35 | D2 | Version 1 supported again | 2 | 5 |
| V36 | D2 | Missing version falls back to 2 | 4 | 5 |
| V37 | D2 | Wording constant back to 1 | 4 | 12 |
| V38 | D2 | String version accepted | 1 | 1 |
| V39 | Consent | Tick not required in `agreeAndJoin` | 0 | 1 |
| V40 | F5 | Grant no longer turned off first | 0 | 6 |
| V41 | F5 | Failed grant-off no longer stops the leave | 0 | 3 |
| V42 | F5 | Still-on grant counts as off | 0 | 1 |

## Findings

### 1. MED for arming: no dependency-free test notices if A1 is unwired

I also reverted `queries.ts` to exactly what it was at `4ef27cc21`, the direct `getCommunity` plus `toDescriptor` read. **That brings A1 back for real users, and all 81 tests still pass.** V34 likewise survives.

The r487 tests call `readCommunityHome` directly, and nothing checks that the screen uses it. The jest block `the door omits viewer_is_admin` in `CommunityScreen.test.tsx` renders the screen and should catch both, but it has never run. Its test ids do exist in the source (`communityMemberBadge`, `communityWallPlaceholder`, `communityError`).

The code is correct today, so this is a gap in protection and not a defect. It is why the jest run has to come before arming.

### 2. MED for arming: the fix depends on a door route nobody has checked

The fix report asks for a runtime-side check that the list route is served with admins off and names only current memberships. **I did not read the door,** because this round stays in this worktree. So this is still open.

The only evidence here is `communitiesClient.contract.test.ts:122`, whose list envelope carries `id` and is copied from an older door (`b30ba816`), not the r484 branch. If the check goes badly:

- **List route not served, or failing:** every member on an admins-off door gets the error state and has no Leave, Export or grant row. No content leaks, but this is A1's control loss again.
- **List omits a real member:** that person sees the wall and Join, and also has no Leave.

### 3. LOW: the error state has no way to retry

`retry` is `false` by default (`react-query.tsx:207`), and `communityError` has no button. So one failed list read replaces a member's whole home, including Leave, until a refetch happens. A failed `GET /:id` already behaves this way, and the fix report states this cost. A "Try again" button is worth adding before arming, and it isn't a blocker.

### 4. LOW: the list match is an exact id match

A list entry `C` does not match a route id `c`, so that person reads as a non-member. This matters only if the door accepts more than one form of an id, which I did not check. It belongs with the door check in finding 2.

### 5. LOW, not new: a stated role is taken at face value

`role: "none"` and `viewer_is_admin: null` both read as member, with no list read. Neither is in the door contract, and a non-member never gets a successful answer on this route according to the r485 door reading. It is display only.

### 6. LOW, not new: leftovers from r485

- `lib/routes/types.ts:164` still says `invite` "may arrive from an invite link". Nothing reads it.
- After a grant-route 404, the "access is off" message and the last-admin "try again" message remain as r485 described. `MemberActionsSection.tsx` and `memberActions.ts` did not change in this round.

## Rulings

### Open join and consent

- `agreeAndJoin` is the only caller of `join`, and the join screen is its only caller.
- Through the real client, a ticked v2 join sends `POST /app/communities/c/join` with `{"consentVersion":2}` and nothing else.
- Unticked gives `no_consent`, and version 1 gives `unsupported_version`. Neither makes a door call.
- In the Community screens, invite and approval appear only in comments saying they aren't needed. No such UI was added.

### D2 Option A

`JoinConsent.tsx` and `consent.ts` have no changes since `4ef27cc21`. The join screen has no toggle, and the new v2 row says the agent gets no access from joining. `AgentGrantSection` stays on the home.

| join-info `wording_version` | Gate |
| --- | --- |
| `2` | `ok`, version 2 |
| `1`, `3`, `2.5`, `0` | `unsupported` |
| `null`, missing, `"2"`, `NaN`, `Infinity`, `true`, `[2]`, no join-info | `missing` |

Joining still can't work end to end until the door names 2. The r484 door branch does that, and r485 found it is not in runtime `main`.

### F5 app half

`memberActions.ts` is unchanged. Probe:

| Grant answer | Leave called | Result |
| --- | --- | --- |
| 2xx `on: false` | Yes, after grant off | `ok` |
| **404** | **Yes, after grant off** | **`ok`** (A3) |
| 2xx `on: true`, 403, 503, network, signed out | No | `grant_off_failed` |

A1 makes this path easier to reach, because admins-off members now have a Leave button. The r484 door removes the harm by clearing the grant in the leave itself, which is another reason to ship the app and door together.

### Flags

- `EXPO_PUBLIC_COMMUNITIES_ENABLED` and `EXPO_PUBLIC_COMMUNITY_SWITCHER` are `"false"` in `base`, `development`, `preview`, `production`, `production-apk`, `testflight` and `testflight-android`. They are `"true"` only in `development-communities`.
- `COMMUNITIES_ENABLED` is true only for `'1'` or `'true'` (`src/env/common.ts:205`).
- `useCommunityQuery` is `enabled` only with the flag on, so the new list read can't happen with it off.
- **This round changed only 10 files:** the report, the r487 scripts, the Community README, two jest files, `access.ts`, `descriptor.ts` and `queries.ts`.
- Since `1cc4c02e`, there is no change to `eas.json`, `app.config.js`, `app.json`, `package.json`, `pnpm-lock.yaml`, `src/routes.ts`, `src/Navigation.tsx`, `src/lib/routes`, `src/env`, `src/lib/agent-runtime/config.ts` or `.env*`.

## The build report's claims

| Claim | Result |
| --- | --- |
| 81 tests pass, 33 in r487 | Reproduced |
| Red run: 14 fail, 19 pass | Reproduced for the 14 failures, all in the A1 file |
| 9 mutations caught, with its counts | Reproduced |
| Tests committed before the fix | Commit order agrees: `dce141330`, then `f33f52310` |
| `tsc`, jest, lint and Prettier not run | Consistent. This round couldn't run them either |
| Dispatch approved the fast-forward push | **Not checked.** The target's tip is `5a54c68b4` and contains `4ef27cc21`, but I can't see that approval |

## What Elliott must decide

1. **Accept the join record as the way the app settles membership?** The r485 verify recommended treating a successful `GET /:id` as membership, and the builder chose differently. **Recommendation: accept it.** It stays fail-closed if the door ever serves non-members on that route, and it needs no door change. The cost is one extra request per home read with admins off, and the dependency in finding 2.
2. **Where do jest, `tsc`, lint and Prettier run, and who checks the door's list route?** Installs and junctions are not approved here, and two verify rounds in a row have not been able to run them. **Recommendation: approve one run on `5a54c68b4` where dependencies exist, and make both checks conditions of arming.**
3. **A4: did real people join under v1, and what happens to their grants?** Still open from r485. **Recommendation is unchanged:** turn those grants off in a runtime migration, or take no action if only test accounts exist.
4. **A3: keep "404 lets leave proceed"?** Still open from r485. **Recommendation is unchanged:** keep it, and don't release this app against a door without the r484 fix.

**No decision needed, but belongs in the plan:**

- Ship the app and the r484 door together. Version 2 needs it too.
- Clear `community-feed` on leave and refusal before the switcher drives Home (A2).
- Add a "Try again" button to the home's error state.
- Fix the Prettier failures once Prettier can run, and remove the stale `invite` comment.
- Run a device clickthrough of join, refusal and leave before any flag goes on.

## Process notes

- **The target was not changed,** and only this report's branch was pushed. No merges, deploys, installs, junctions or live calls.
- **One command was blocked.** A cleanup used `rm -rf` on a path containing `..`, and the deny-list stopped it (`destructive-fs-escape`). Nothing had run. I put that scratch copy inside the existing scratch folder instead, so that delete wasn't needed.
- One backup of the scratch `queries.ts` went to the shell's temp folder, outside this worktree, by accident. It held only that committed file, and I deleted it.
- This worktree started from `main`, so its own files are not the target's. Everything above was read from `5a54c68b4` directly, or from `4ef27cc21` where stated.
