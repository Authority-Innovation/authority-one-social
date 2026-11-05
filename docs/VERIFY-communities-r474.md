# VERIFY - communities fix round 474

- Task: `0c301907` (independent, read-only, one round)
- Date: 2026-11-05
- **Verified head: `9321e90033ea12ba61c59b7b6c0a6de4c2b44952`** (`fix/communities-r474`)
- Base: `1cc4c02e14a9ec5e1c38d08fea20bf4a986f8878` (`communities/integration`)
- Checked against: `docs/REVIEW-communities-2026-11-05.md` (`review/communities-r470`) and `docs/FIX-communities-r474.md`
- Method: code reading, the dependency-free regression tests, and scratch probes and mutations in the worktree. The scratch files were deleted and not committed. No fix-branch code was changed.

## Verdict for arming: NOT READY

All three BLOCKERs are still open in effect: F1 and F3 wait on Elliott, and F2 cannot moderate anything until the runtime adds routes. F6 is still open too. **F4 is the only finding fixed**, and neither F4 nor F5 has been compiled or rendered.

The fix doc is accurate. Its counts reproduce, F1 and F3 are reported open and were not silently fixed, and F2 does not claim moderation works. This round found three things the doc does not mention (N1 to N3), and all three are in the F2 and F5 code.

| ID | Severity | Verdict | One line |
| --- | --- | --- | --- |
| F1 | BLOCKER | **OPEN** | No admission control. Reported open, and no code change remains. Needs D1 and the runtime |
| F2 | BLOCKER | **PARTLY** | App half on a proposed contract. Report, remove and ban all reach no working route today. Block hides posts on one device only |
| F3 | BLOCKER | **OPEN** | The join toggle still names the person's own agent and grants the community's. Consent is still version 1. Needs D2 |
| F4 | HIGH | **FIXED** (app; not compiled) | The target is checked before any upload, on both picker paths |
| F5 | HIGH | **PARTLY** | Leave, delete and export now have UI, and leave turns the grant off first. The runtime bug is open, and one path leaves the grant on (N2) |
| F6 | HIGH | **OPEN** | Nothing in this repo can close it. Needs a door review at the armed runtime sha |

## Test results

Run with Node 24.14.0, using the command in the fix doc.

| Run | Result |
| --- | --- |
| Head `9321e900` | **22 of 22 pass** (F2 10, F4 5, F5 7) |
| Base `1cc4c02e` from `git archive`, plus the final test files | **0 of 22 pass**, all 22 fail |

The fix doc's counts are correct, and so is its warning that most of the red is weak: at base, the functions under test do not exist yet.

To test more strongly, I broke copies of the head code one change at a time and re-ran the suite.

| Change made to a copy of the head | Result |
| --- | --- |
| F4: the helper starts the upload with no check | Caught (3 fail) |
| F4: the Composer calls the upload directly, bypassing the guard | Caught (1 fails) |
| F5: leave without turning the grant off | Caught (3 fail) |
| F5: a failed grant-off is ignored | Caught (1 fails) |
| F5: leave runs before the grant-off | Caught (3 fail) |
| F2: a 404 is reported as done | Caught (1 fails) |
| F2: a network failure is reported as done | Caught (1 fails) |
| F2: admin actions are offered to everyone | Caught (1 fails) |
| F2: an unknown report reason is sent | Caught (1 fails) |
| F4: the media-picker path at `Composer.tsx:2686` calls something else (a proxy for "not guarded") | **Not caught** |
| F2: any HTTP error other than 403 or 404 is reported as done | **Not caught** |
| F2: the 404 message is changed to "Report sent." | **Not caught** |
| F5: the timeline cache is not cleared on leave | **Not caught** |

**What the 4 misses mean:** the code is correct in all four places today, which I confirmed by reading it and, for the HTTP errors, by a probe. But no test protects them. The most important is the 404 message: **the honest "nothing was sent" wording has no regression test.**

## Per-item detail

### F4 - FIXED (app)

- `uploadAuthorityVideo` has one call site in app code, `Composer.tsx:409`, inside `startAuthorityVideo`. The only route to that function is the guard at `Composer.tsx:495-501`.
- Both picker paths use the guarded callback (`Composer.tsx:2686`, `:2757`). The fallback bsky path with the video flag off has its own gate (`:600`).
- **It fails closed.** Members, paid and unresolved targets are refused by the tests. Public is not in the tests, but a probe confirmed it is refused and nothing starts.
- Profile posts still upload. The `save-draft` gate used to disable the button and the `select-video` gate used for the upload give the same answer, because `gateComposerWrite` only treats `publish` differently.
- `requestedTarget` is a prop, with no control inside the Composer to change it, so I found no way to start an upload on a profile target and then switch to a members target.
- **Remaining limit:** the edit to `Composer.tsx` has not been compiled or run.

### F5 - PARTLY

**Confirmed: the leave flow turns the grant off first.** `leaveCommunity` (`memberActions.ts:30-43`) calls `setAgentGrant(id, false)` before `leave`. If that fails with a 403, a 5xx, a network error or a malformed response, the person stays a member and is told why. The cases I probed behaved this way. Delete and export now have real callers.

**What remains open:**

- Runtime MEDIUM-1: the runtime still keeps the grant after a leave. A grant set outside this flow, or a leave made directly through the API, keeps the grant on. This repo cannot fix that.
- N2 below: this flow itself can leave the grant on.
- A person's posts stay after they leave unless they delete them first. The confirmation says so, and that is honest.
- Nothing here has been rendered.

### F2 - PARTLY, honestly labelled except for one line

**What a person gets today:**

- **Report, Remove post, Remove member and Ban** send a request to a route that does not exist. The person sees "This isn't available yet, so nothing was sent." (`MemberPostMenu.tsx:87`). Success wording appears only on a 2xx response. Probes confirmed 400, 409, 429, 500, 503, signed-out and malformed responses all read as `failed`, and 403 reads as `not_allowed`.
- **Moderation does not work.** A harassed member still cannot reach an admin, and an admin still cannot remove anyone. The menu items look live until pressed, so the person learns this only after trying.

**What "Block only hides posts on this device" means:**

- The blocked person is not told and stays a member.
- They can still read and reply to the blocker's posts.
- The blocker still sees them on the Members tab, because only the timeline is filtered (`PostsSection.tsx:34`).
- On another device or a reinstall, the block may be gone: it lives in this device's account storage.
- Nothing reaches the server, and no admin learns of it.
- The fix doc's view that this probably does not satisfy App Review guideline 1.2 on its own looks right to me. I did not check store submission.

The Block prompt states most of this plainly. The doc and code comments label the routes as PROPOSED, and I found no claim in them that moderation works. The one misleading line is N3.

### F1 - OPEN, confirmed

- `JoinConsent.tsx` and `consent.ts` are byte-identical to base. `join` still sends only `consentVersion` (`communitiesClient.ts:261`), and `route.params.invite` is still not read (`JoinConsent.tsx:74`).
- "Members only" remains on screen (`JoinConsent.tsx:221`, `CommunityHeader.tsx:133`).
- `4b583ae7c` is fully reverted by `907ba5d7f`, and its test file is gone. It stays in the history under a `fix(communities): F1` subject, so reading the log alone could mislead. The fix doc explains this.
- The doc reports it OPEN and needing D1.

### F3 - OPEN, confirmed

- **No consent version bump:** `CONSENT_WORDING_VERSION` is still `'1'` (`consent.ts:31`).
- **No toggle removal:** the toggle and "Let {myAgentName} read this community for me" are still there (`JoinConsent.tsx:243-256`), and it still calls `setAgentGrant(id, true)` (`consent.ts:125`).
- `AgentGrantSection.tsx` is byte-identical to base, so the hidden settings row is still open too: "you can turn it off any time" is not always true.
- `72087128e` is fully reverted by `344a0ae74`. The doc reports it OPEN and needing D2.
- **Note for D2:** the new Leave prompt and error text say "the community agent's access". That matches the client contract and the F3 recommendation, but a person who ticked "Let Bob read" at join will see a different agent named at leave. If D2 goes the other way, this copy changes as well.

### F6 - OPEN, confirmed

No runtime code was read in this round either, and the fix doc makes no claim about it. The door needs reviewing at the exact sha being armed, including route wiring and the production pin. All runtime statements here are second-hand, from the earlier reviews.

### Flags - OFF, unchanged

`eas.json` is byte-identical to base, and the fix diff touches no flag definitions. Both community flags are `"false"` in every profile except `development-communities` (`eas.json:67-68`), which is the internal Dev client and was already `"true"` at base.

## New findings

N1 to N7 are in new code from this fix round.

### N1 - MED - Block can report success and do nothing

- **Where:** `moderation.ts:47`, `:71-77`; `MemberPostMenu.tsx:116-120`; `memberRows.ts:72`.
- **Failure scenario:** The door sends an item with a DID-shaped `authorId` and no `author` object. `memberId` is set, so Block is offered, but `blockKeysFor` returns no keys. The person confirms and sees "You won't see their posts here on this device", and the posts stay. A probe confirmed the empty keys and that the row stays visible.
- **Same cause:** `isOwnPost` returns false for that row even when the DID is the viewer's own. The person gets Report and Block on their own post, and no Delete.
- **Reachability:** Rare path. The Dev capture and fixtures use non-DID `authorId` values, and the Dev capture also sends `author.did`. However, `memberRows.ts` handles the DID-shaped case on purpose, and the F2 test uses that exact shape without checking Block. Per the original review (F7), `author` is not sent when the runtime's agent flag is off.

### N2 - MED - Leave can go ahead with the grant still on, after saying it was turned off

- **Where:** `memberActions.ts:35-38`; `MemberActionsSection.tsx:134`.
- **Failure scenario:** A person has a grant on. The runtime's agent flag is then turned off, so the grant route answers 404. They leave, having been told "The community agent's access to your content is turned off first". The 404 is treated as "no grant to turn off", and the stored grant stays on. With runtime MEDIUM-1 open, if the flag comes back on, the agent may be able to read a former member's posts again. Any other 404 on that route has the same effect.
- **Second case:** `leaveCommunity` checks only that the call succeeded, not the answer. A probe confirmed that a door replying `{on: true}` to a request to turn off still proceeds to leave. This needs a door bug, so it is LOW on its own.
- **Reachability:** Rare path: it needs the flag turned off and back on, and it needs MEDIUM-1 still open. The fix doc states the 404 assumption but not this outcome. The runtime fix (R5) removes it.

### N3 - LOW - The Block prompt points to a dead end

- **Where:** `MemberPostMenu.tsx:152`.
- **Failure scenario:** The prompt says "To have someone removed, report their post." Today a report only returns "This isn't available yet", and report goes to admins who have no way to remove anyone. A person being harassed is sent to something that cannot help.
- **Reachability:** Reachable in practice once armed, with today's runtime. This is the one place I found the app implying moderation works.

### Smaller items

| ID | Sev | Where | Failure scenario | Reachability |
| --- | --- | --- | --- | --- |
| N4 | LOW | `MemberActionsSection.tsx:64-66` | The grant-off succeeds and the leave fails. The person is told only "Couldn't leave", and the settings row can still show the grant as on, because the cached value was not updated | Rare |
| N5 | LOW | `MemberActionsSection.tsx:69-74` | After leaving, the timeline and community caches are cleared, but `communityRoster` and `communityAgentGrant` are not. Rosters hold who posted, not post text | Reachable, low harm |
| N6 | LOW | `moderation.ts:24`; `MemberPostMenu.tsx:114` | A Delete on a post already gone answers 404 and shows "This isn't available yet", and the list does not refresh. The same wording will mislead once moderation routes exist | Rare |
| N7 | LOW | `MemberActionsSection.tsx:55` | A rejected `shareText` (for example, a clipboard failure on web) is not caught, so the person sees nothing | Rare |
| F11 | LOW, existing | `communitiesClient.ts:95` | Not touched by this round, and the new routes widen it. A probe showed a member id of `..` turns the ban URL into `/c/moderation/ban`. The ids come from the door. The F2 test covers `/` only | Rare |

F16 also now affects F5: where membership is misread as non-member, Leave and Export do not show. That fails closed, but it is a rollout dependency.

## Fix doc accuracy

| Claim | Result |
| --- | --- |
| 22 tests: 22 red at base, 22 green at head | Reproduced |
| F1 and F3 files match base | Confirmed for all named files. The `communitiesClient.ts` diff is an added block only |
| Flags unchanged, MED and LOW untouched | Confirmed |
| F2 limits | Accurate. N1 and N3 are not mentioned |
| F5 limits | Accurate. The N2 outcome is not spelled out |
| Scratch files left in `/tmp/r474` | Not checked: it is outside this worktree. **Please delete that folder.** |

## Needed before arming

1. **Elliott:** rule on D1 (F1) and D2 (F3).
2. **Runtime:** admission check (R1), moderation routes and a real block (R2), grant ended on leave (R5), door review at the armed sha (R3, R4; F6).
3. **App, once those land:** N1, N2, N3, and regression tests for the 4 uncaught changes.
4. **First, on any machine with dependencies:** `pnpm install`, `pnpm test`, `pnpm typecheck`, `pnpm lint`, then a device clickthrough of the post menu and Leave. Until that happens, none of this UI is known to compile or render.

## Could not run

| Check | Why |
| --- | --- |
| `pnpm test` (jest, all suites, including the edited `CommunityScreen.test.tsx`) | No `node_modules`; install not approved |
| `tsc` / `pnpm typecheck` | Same. **The new TS and TSX are not type-checked.** By reading only: imports, icon exports, query keys and `Prompt.Basic` props resolve to real names |
| `pnpm lint`, prettier | Same |
| Any render of `MemberPostMenu`, `MemberActionsSection` or the Composer | Same. The tests that touch them read the source as text |
| Device or app run, live door, runtime read | Not allowed in this task. All runtime statements are second-hand |

## Process notes

- `review/verify-communities-r474` started on `main` (`571924785`). I fast-forwarded it to the fix head, as the spec requires. This doc is the only commit on top. Nothing was pushed to the fix branch, and nothing was merged.
- **One command was blocked.** A compound read-only shell command was stopped by the deny-list as `env-dump`. It was not reading the environment. Its git filters named flag-related paths and patterns, which is probably what matched, but I did not confirm the trigger. I did not retry that form. The test run from it went as its own command, and the flag facts came from the fix diff, `git diff --quiet` and the search tool.
- The scratch probes and mutation copies were in `.verify-tmp/` and `scripts/communities/.probe/` inside this worktree. Both were removed before this commit.
