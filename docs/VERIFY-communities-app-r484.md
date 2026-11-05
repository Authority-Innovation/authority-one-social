# VERIFY - communities app, round 484

- Task: `e12995b0` (independent, read-only, one round)
- Date: 2026-11-05
- **Verified head: `4ef27cc219cf6ca244bf4c5941d49c62e7737e8e`** on `coord/independent-priority-normal-fix-a550de71`
- Build report: `docs/FIX-communities-app-r484.md` on that branch
- This report's branch: `review/verify-communities-app-r484`, created from that head

**The target is not on the branch the spec names.** `fix/communities-r474` is still at `9321e9003`, the round 474 head, and does not contain this work or the build report. The builder's task branch sits directly on top of it, so it can fast-forward. Nothing was pushed to either branch.

## Verdict: READY for arming planning with flags OFF. Not ready to arm.

The code matches both of Elliott's rulings, and it compiles and passes its tests, including the jest suites the builder could not run. Open join cannot work until the runtime changes ship, and three app gaps below should go into the plan. None of them can reach a user while the flags are off.

| Item | Verdict | One line |
| --- | --- | --- |
| D1: anyone can join, no invite, no approval | **PARTLY** | The join path asks for neither. Join is blocked until the door names version 2, and a real member can still look like a non-member (A1) |
| D1: invites and approvals not built | **FIXED** | No code or UI. Only comments and an ignored route param remain |
| Join consent stays and is recorded | **FIXED** (app) | No tick, no join, and the version is sent. Storing it is the door's job and was not checked |
| Members-only content hidden from non-members | **PARTLY** | Home posts and roster are hidden. The combined feed cache is not cleared (A2) |
| D2 Option A: toggle removed, grant on home row, version 2, fail closed | **FIXED** | All four confirmed in code and by rendered jest tests |
| F5 app half: grant off first, stop on failure | **PARTLY** | Correct, except that a 404 on the grant route lets the leave go ahead (A3) |
| Regression tests | **PARTLY** | They run and most reds are real, but four of six one-line breaks went uncaught |
| Flags OFF, no invite or approval UI, no prod routing change | **FIXED** | No flag, route or config file has changed since the round 470 base |

## What I ran

The builder could not run `tsc`, jest or lint because this worktree has no `node_modules`. I linked the `node_modules` of worktree `c7a487e1`, whose `pnpm-lock.yaml` has the same hash, using a temporary junction. Nothing was installed, and the junction has been removed.

`pnpm` is not on this machine, so I ran the commands behind the scripts directly. `CLAUDE.md` asks for the pnpm scripts, so this is a deviation. I left out `--bail` so the full jest run would finish.

| Check | Result |
| --- | --- |
| `tsc --noEmit -p tsconfig.communities.json` | **Pass** (exit 0) |
| `tsgo --project ./tsconfig.check.json` (whole app) | Exit 2: 82 lines of output, **all** missing `src/locale/locales/*/messages`. Those catalogs are compiled by CI. No other errors |
| Jest, community paths | **24 suites, 439 tests, all pass**, including the edited `JoinConsent.test.tsx` and `CommunityScreen.test.tsx` |
| Jest, full suite | 186 of 190 suites pass; 2,390 tests pass, 2 fail, 28 todo. See below |
| ESLint, the 14 changed `src` files only | **Pass** (exit 0). The rest of the repo was not linted |
| Prettier, the same files, ignoring line endings | **2 files fail:** `access.ts`, `components/MembersSection.tsx`. Style only |
| Dependency-free tests at head, r484 and r474 | **48 of 48 pass** |
| r484 tests on `9321e9003` source | **21 fail, 5 pass**, the same as the builder's count |

**The 4 failing jest suites.** Round 484 changed none of their files, and none are about communities. I did not re-run them on another commit or with LF line endings, so the causes below are my reading of the errors.

| Suite | Error | Likely cause |
| --- | --- | --- |
| `__tests__/lib/string.test.ts` | Cannot find `locales/en/messages` | Catalogs not compiled here |
| `plugins/uiSceneLifecycle/.../withUISceneLifecycle.test.js` | Template pattern not found | Windows CRLF checkout |
| `src/lib/lexicon/__tests__/lexicon.test.ts` | A file hash differs | Windows CRLF checkout |
| `src/lib/contextEngine/.../noBackgroundLocationShipped.test.ts` | Substring with a newline not found | Windows CRLF checkout |

## Still unverified

- Any device or web run. Jest renders the join screen and home with mocks, and nothing has run in the real app.
- The clickthrough harness.
- **The whole door side.** I did not read the runtime. Task `bebf5b5d` is separate, so these remain assumptions:
  - the door accepts version 2 on join and stores it
  - `joined: false` means refused, and not "already a member"
  - a 404 on the grant route only means the agent flag is off
  - the door enforces membership on every member read
- `MemberPostMenu`, `MemberActionsSection` and `AgentGrantSection` behaviour on failure paths. See the mutation results below.

## Findings to carry into the plan

### A1 - HIGH for arming - A real member can look like a non-member

- **Where:** `src/screens/Community/descriptor.ts:165`
- **Scenario:** `isMember` is true only if the door sends `role` or `viewer_is_admin`. The door sends no `role`, and the code comment says `viewer_is_admin` is present only with the admin role on. With that role off, someone joins, sees "You're in", opens the community and gets the wall and a Join button again. If they join again, the result depends on what the door answers an existing member, which is unverified.
- **Why it matters:** this fails closed, but it breaks D1 for everyone in that configuration. Both door fixtures carry `viewer_is_admin`, so no test shows it.
- **Status:** the builder reported this accurately. It was also F16 in the round 470 review. By the code's own comment, `GET /:id` only answers current members, so a successful read could itself mean "member". That needs a door check first.

### A2 - MED - Members-only posts stay in the combined feed cache after a leave or refusal

- **Where:** `MemberActionsSection.tsx:76-83`, `index.tsx:81`, `src/features/communities/cache.ts:15`
- **Scenario:** a person leaves, or is refused by the door, and lands on Home. `removeCommunityMemberContent` clears the community's timeline, grant and roster, but not the `community-feed` root. `removeCommunityQueries` is only called on an account switch. The combined feed can go on showing that community's members-only posts until it refetches.
- **Limits:** this comes from reading the code; I did not reproduce it. The cache is memory only and is never persisted. The server is unaffected, and a refetch drops the source.
- **Status:** the build report says other surfaces were not audited, but does not name this one.

### A3 - MED - A 404 on the grant route still lets a leave go ahead

- **Where:** `src/screens/Community/memberActions.ts:36-39`
- **Scenario:** this is N2 from the round 474 verification. The 2xx `on: true` half is now fixed. The 404 half is still open: if the agent flag is off, or the route 404s for any other reason, the leave proceeds with the stored grant unknown. The runtime half (`bebf5b5d`) is what closes it.
- **Related, LOW, not in the build report:** if the grant call 404s and the leave then fails, `MemberActionsSection.tsx:66-71` and `:134` set the row to off and say "the community agent's access is off". After a 404, nothing confirms that.

### A4 - MED - Grants made under the wrong version 1 wording stay on

- **Where:** the toggle removed from `JoinConsent.tsx`
- **Scenario:** version 1 said "Let Bob read this community for me" but granted the community's agent. Anyone who turned it on still has that grant, and is never told or asked again, because the door does not report which version a member accepted. The build report covers not re-asking, but not the leftover grants.
- **Limits:** this only matters if real people joined under version 1. With flags off that may be test accounts only, which I could not check.

### A5 - LOW - The misleading message and the hidden row

- `JoinConsent.tsx:181` says "This community needs a newer version of the app" when the door is the older side. Every join on the Dev door shows this until `bebf5b5d` lands. Dispatch ruled for this behaviour, so it is not a defect, but testers will see it. The `development-communities` profile has the flag on.
- `AgentGrantSection.tsx:37` hides the row if the grant read fails. Under D2 this row is now the only control for the grant, so a failed read leaves no way to turn it off except leaving. The build report lists this.
- `src/lib/routes/types.ts:164` still says `invite` "may arrive from an invite link". Nothing reads the param. The comment is stale against D1, and the invite tests in `JoinConsent.test.tsx` still pin the route shape.
- The `door.json` fixture has a community `wording_version` of 3 and a null join-info. The tests set `{wording_version: 2}` themselves, so no captured door payload shows the version 2 path.

## Ruling by ruling

### D1 - open join

- **Join sends only the version.** `communitiesClient.join` builds the body as `{consentVersion}`. The real client was exercised against a stubbed `fetch`, and the body was exactly `{consentVersion: 2}`.
- **Only one path joins.** `agreeAndJoin` in `consent.ts` is the only caller of `join`, and the join screen is its only caller.
- **Nothing built.** Since the round 470 base, the only added non-test lines naming invite, approval or admission are five comment and README lines saying they are not required. The earlier invite-only commit stays reverted.
- **The home's Join button** now goes to `CommunityJoin`. The holding sheet is deleted. A refused home offers the same route.
- **Join is not reachable end to end today.** The Dev capture names version 1, so the gate stops every join until `bebf5b5d` ships.

### Consent step

The tick is required in `agreeAndJoin` and in the screen. The version comes from join-info through the gate. There is no fallback for a missing version. A 2xx with `joined: false` no longer shows a welcome (`consent.ts:142`).

### Members-only content

| Surface | Result |
| --- | --- |
| Home, door refuses `GET /:id` | Hidden, including over a cached descriptor. Jest confirms |
| Posts, door refuses the timeline | Wall shown over cached pages. Jest confirms |
| Members tab, door refuses the timeline | Hidden by code reading. **No test protects it** (M4) |
| Grant, timeline and roster caches on refusal or leave | Cleared. The partial roster key matches, by reading how TanStack matches keys. **No test protects the calls** (M2, M6) |
| Combined feed | **Not cleared** (A2) |

This is display only, as the ruling says. Real enforcement is on the door and is finding F6, which remains open.

### D2 Option A

Confirmed in code and by rendered jest tests:

- There is no agent toggle or owner-agent query on the join screen. The only `Toggle.Item` left is the consent tick.
- `consent.ts` no longer imports `setAgentGrant`, and joining cannot set a grant.
- `AgentGrantSection` still renders `AgentGrantRow` on the home for a member of a community with an agent.
- `CONSENT_WORDING_VERSION` is `'2'`, and it is the only supported version.
- The gate returns `unsupported` for 1 and 3 and `missing` for null, and no Agree button appears. `agreeAndJoin` also refuses version 1 without calling the door.

### F5 app half

`leaveCommunity` calls `setAgentGrant(id, false)` first. Network, signed-out, malformed, 403 and 500 answers all stop before `leave`, and so does a 2xx that still says `on: true`. `leaveCommunity` is the only caller of `leave`. The exception is A3.

The runtime half is still open: a leave made directly through the API keeps the grant.

## Regression tests

### Red before

I reproduced the builder's 21 fail and 5 pass. The builder's own caveats are accurate, and these cases add to them:

| Test | Why it was red, or why it was green | Worth |
| --- | --- | --- |
| `D1: open join needs only consent` | Version 2 was refused at base. Base already asked for no invite | **Proves D2, not D1** |
| `D1: the join request body holds the consent version` | The body sent 1 and the test expects 2. Base already sent nothing else | **Proves D2, not D1** |
| `D1: the join screen ignores an invite` | A `//` comment naming `route.params.invite`, and doc text in `consent.ts` | **Comment match only.** Behaviour did not change |
| `D1: the home Join button` | Holding sheet was present | The real D1 red |
| `D1: the consent step stays` | Green at base | Pin, no red |
| `D2: joining never sets the agent grant` | Green at base because version 2 was refused first | Vacuous at base, meaningful now |
| `D2: the grant stays on the home row` | Green at base | Pin, no red |
| Two original F5 cases | Green at base; built in round 474 | Pins, no red |
| `F1: refusal`, `F1: 2xx joined: false`, `D2` gate and version cases, `F5: still on` | Wrong behaviour at base | **Real reds** |
| `F1` cases calling `access.ts` | The module did not exist | True but weak |
| The remaining source-text cases | The expected string was not in the source | Only shows the text exists |

So **no r484 test shows a change in the invite or approval behaviour, because that behaviour did not change.** The client never read an invite. What changed for D1 is that the home now routes to the join screen.

### Green after, and whether the tests catch a break

I broke the head one line at a time, ran the dependency-free tests and the two jest screen suites, and restored each file.

| Break | Dependency-free tests | Jest |
| --- | --- | --- |
| M1: home ignores a refused `GET /:id` | Not caught | **Caught** (2) |
| M2: a refusal does not clear caches | Not caught | **Not caught** |
| M3: posts ignore the refusal | Not caught | **Caught** (1) |
| M4: the Members tab ignores the refusal | Not caught | **Not caught** |
| M5: a failed leave does not update the grant row | Not caught | **Not caught** |
| M6: a leave does not clear member content | Not caught | **Not caught** |

- **In all six, the dependency-free tests stayed green,** because they look for text such as `canShowMemberContent(`, which each break left in place. They should not be cited as evidence that these behaviours work.
- **The jest suites are the real protection,** and they were not available to the builder.
- The code is correct today in all four uncaught places, by reading. Nothing would catch a regression there.
- These six breaks all target screen wiring. `consent.ts`, `access.ts` and `memberActions.ts` have direct behaviour tests that run the real code, and I did not mutate them.

## Flags and routing

- Since the round 470 base `1cc4c02e`, these are unchanged: `eas.json`, `app.config.js`, `app.json`, `package.json`, `pnpm-lock.yaml`, `src/routes.ts`, `src/Navigation.tsx`, `src/lib/routes/`, `src/env/`, `src/lib/agent-runtime/config`.
- `EXPO_PUBLIC_COMMUNITIES_ENABLED` is `"false"` in every `eas.json` profile except `development-communities`, which points at the Dev runtime. That profile was set before this work, on 2026-10-30.
- `COMMUNITIES_ENABLED` is true only for `'1'` or `'true'`, so the default is off.

## What Elliott must decide

1. **Which branch is the target?** Should `coord/independent-priority-normal-fix-a550de71` fast-forward `fix/communities-r474`? Until it does, that branch does not hold this work. The recommendation is yes.
2. **A1: how does the app know someone is a member?** Either the door sends an explicit membership field, or the app treats a successful `GET /:id` as membership. Or the admin role stays on wherever communities are armed. **Recommendation: an explicit field from the door,** added to `bebf5b5d` or a follow-up, because it doesn't rely on an assumption about the route.
3. **A4: what happens to grants made under version 1?** If any real person joined under version 1, should those grants be turned off in a runtime migration? **Recommendation: turn them off,** since the wording never described what they did. If only test accounts exist, no action is needed.
4. **A3: should a 404 still let a leave go ahead?** The recommendation is to keep it for now, because the alternative traps people in a community while the flag is off, and to remove the risk with the runtime half.

**No decision needed, but should be in the plan:**

- `bebf5b5d` and this app must ship version 2 together.
- A2: clear `community-feed` on leave and on refusal.
- Add jest cases for M2, M4, M5 and M6.
- Run Prettier on the two files.
- Run a device clickthrough of join, refusal and leave before anyone turns a flag on.
- F2 and F6 remain open and were out of scope here.

## Process notes

- No code on the target or task branch was changed. This document is the only commit.
- **One command was blocked.** A shell search combining several checks hit the deny-list's `env-dump` rule. I was not dumping the environment. I did not retry that command. I read the tracked flag lines with the search tool instead, printing only the lines that name the communities flags.
- Scratch work stayed inside this worktree and was removed before committing: the red export, two log files and the junction. The mutations were restored with `git checkout`. Jest may have written its cache outside the worktree, in its default temp location, and I did not check.
- The `/tmp/r474` folder from the round 474 builder was not checked.
- One round, as instructed.
