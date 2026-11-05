# FIX - communities app, round 487: A1, and tests for C9, C10 and C11

- Task: `b9e12e87` (independent, one round, a single verify follows)
- Date: 2026-11-05
- Base: `4ef27cc21`
- Task branch: `coord/independent-priority-high-fix-co-b9e12e87`
- Target: `fix/communities-r474`

## Result

A1 is fixed in the app, and tests now catch mutations C9, C10 and C11. All 81 dependency-free tests pass.

**`tsc`, jest, lint and Prettier did not run,** because this worktree has no `node_modules` and installs are not allowed. So the TSX is still neither compiled nor rendered, and the jest cases added here have never run.

Open join, the consent step and D2 Option A are unchanged, and flags stay off. Nothing was merged or deployed, and no live calls were made.

## Step 0: fast-forward

| Check | Result |
| --- | --- |
| `origin/fix/communities-r474` before this round | `9321e9003` |
| Is `9321e9003` an ancestor of `4ef27cc21`? | **Yes, a plain fast-forward** |
| This round's work | Built directly on `4ef27cc21` |

**How the target moves:** run rule 5 allows a push to the task branch only, while this spec names `fix/communities-r474`. I asked, and Dispatch approved one plain fast-forward push of the final head to `origin/fix/communities-r474`. That single push carries both `4ef27cc21` and the r487 commits, so there was no separate push at step 0. The local ref is checked out in worktree `562efc37`, and I did not touch it, so it stays at `9321e9003` until someone updates it.

## A1

**The bug:** with its admin role off, the door sends neither `role` nor `viewer_is_admin`, so `descriptor.ts` read a real member as a non-member. That person saw the wall and a Join button, and had no Leave, Export or grant row.

**Which option I picked: derive membership from the join record.** The record is the caller's own community list, `GET /app/communities` (`listMyCommunities`). The app already has this client call and the door already serves the route.

| Door response and list | Result |
| --- | --- |
| Door states membership (`role`, or `viewer_is_admin` present) | Member. The list is not read |
| Door omits it, list names this community | Member, never admin |
| Door omits it, list does not name it | Non-member: wall and Join button |
| Door omits it, list read fails (including 403 and 404) | **Existing error state: no member content, no wall, no Join button** |
| Door refuses `GET /:id` | Refusal, as before. The list is not read |

**Why this option:**

- **Refusing to show the wall until the door states membership would not fix A1.** With admins off the door never states it, so a member would wait forever and still have no Leave button.
- **"A successful `GET /:id` means member" was the r485 verify's recommendation, but I did not use it.** It is one line, but it is the same code as mutation C11 (`isMember` always true), which this spec requires a test to catch. It would also stop failing closed if the door ever served non-members on that route.
- **It adds no new UI.** The change is `readCommunityHome` in `access.ts`, a `joined` option on `toDescriptor`, and one call changed in `queries.ts`.
- **A failed list is never passed on as a refusal.** A refusal offers Join, and the r485 verify found the door can answer 404 on a store failure.

**Costs and limits:**

- Viewers whose door omits membership make one more request per home read. Doors with admins on make none.
- The list is read fresh rather than through the switcher's cache, so a join shows at once.
- A brief list failure during a background refetch replaces the home with the error state. A failed `GET /:id` already does this.
- **If the door's `GET /:id` succeeds but the list leaves the community out, the app shows the wall and Join.** That fails closed for member content, and joining again is safe on the r484 door. The door should not produce this, but I did not read or run the door in this round.
- All of this is display. The door remains the enforcement.

## Tests

```
node --import ./scripts/communities/r474/register.mjs --test "scripts/communities/r487/*.test.mjs"
node scripts/communities/r487/mutations.mjs
```

### Red before, green after

| Run | Source | Tests | Pass | Fail |
| --- | --- | --- | --- | --- |
| Red | `access.ts`, `descriptor.ts`, `queries.ts` from `4ef27cc21`; r487 tests | 33 | 19 | **14** |
| Green | Fixed; r487 tests | 33 | 33 | 0 |
| Green | Fixed; r487, r484 and r474 tests | 81 | 81 | 0 |

**The 19 that pass on the old source do not show A1:**

- 16 are C9 and C10 tests. They guard wiring that was already correct, so only mutation can turn them red (table below).
- 3 are in the A1 file: both C11 tests and `the join record gives membership and never admin`. These only assert `false` values, which the old code also gave. They turn red under mutation.

### Mutations

The runner breaks one line at a time, runs the 33 r487 tests and restores the file. It exits 1 if a mutation survives. **All 9 were caught.**

| Mutation | Tests failing, of 33 |
| --- | --- |
| **C9:** the handler drops its gate check | 5 |
| **C9:** the screen builds an always-ok gate | 10 |
| **C10:** the unsupported state is never shown | 3 |
| **C10:** a missing version no longer shows the load error | 2 |
| **C11:** `isMember` always true | 4 |
| A1: the join record is ignored (the original bug) | 3 |
| A1: a failed list reads as a non-member | 5 |
| A1: a failed list passes through, so a 404 reads as a refusal | 2 |
| A1: any entry on the list counts as this community | 2 |

The r485 report did not record its exact C9 and C10 edits, so these are my reading of its one-line descriptions. Line numbers in that report predate this change. C11's line is now `isMember: doorStatesMembership(community) || joined`.

### How much these prove

- **The A1 tests run real code:** `descriptor.ts`, `access.ts` and, in one test, the real client against a stubbed `fetch`.
- **The C9 and C10 tests are stronger than text matching, but they are not a render.** They lift statements out of `JoinConsent.tsx` and run them: the gate line, the `onAgreeAndJoin` handler and the conditions of the branch chain. They then read the test ids in the source of the branch those conditions pick. So they rely on the file's Prettier layout, and they fail loudly if it changes.
- **Not covered:** a mutation that changes what a branch renders while its test ids stay in place.

### Jest cases added, not run

- `CommunityScreen.test.tsx`: a new `the door omits viewer_is_admin` block covers a joined member, someone not on the list, and a failed list (network and 404). `listMyCommunities` is added to the mock, defaulting to an empty list, so existing non-member cases should keep their meaning.
- `descriptor.test.ts`: the join record gives membership, never admin.
- `JoinConsent.test.tsx`: not changed. It already renders the unsupported and missing states.

## Earlier rulings

| Ruling | State |
| --- | --- |
| Open join, no invite, no approval | Unchanged. No new invite or approval UI |
| Join consent step | Unchanged |
| D2 Option A: toggle off, consent v2, fail closed unless join-info names 2 | Unchanged. `JoinConsent.tsx` and `consent.ts` were not edited |
| A2, A3, A4 | Unchanged and still open |
| Flags | Off. No flag, route or config file changed |

## Could not run

| Check | Why |
| --- | --- |
| `tsc --noEmit -p tsconfig.communities.json` | No `node_modules`, and no installs in this round |
| Jest, including the new cases and the existing community suites | Same |
| ESLint, Prettier | Same. I formatted the changed source and jest files by hand |
| Device, web or clickthrough run; any live door | Not allowed in this round |

I did not run `tsc`, so the type-correctness of `readCommunityHome` and of the `it.each` table is unproven.

## For the verify

- Run `pnpm test` on this head where dependencies exist. It is the main gap in this round and the r485 round.
- Check on the runtime side that the list route is served with admins off and names only current memberships. I took this from the client's comment and the door fixtures, not from door code.

## Commits

| Commit | What |
| --- | --- |
| `dce141330` | r487 tests for A1, C9, C10 and C11, written before the fix |
| `f33f52310` | A1 fix, jest cases and README |
| `67baba236` | Mutation runner |

Later commits on the branch tidy jest formatting and add this report.
