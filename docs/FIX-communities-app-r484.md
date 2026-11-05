# FIX - communities app, round 484: D1 open join, D2 consent v2, F1 and F5 app halves

- Task: `a550de71` (independent, one round)
- Date: 2026-11-05
- Base: `9321e9003` (head of `fix/communities-r474`)
- Branch: `coord/independent-priority-normal-fix-a550de71`, **not** `fix/communities-r474`. The spec names `fix/communities-r474`, but the run rules allow a push to the task branch only. It sits directly on that head, so it can fast-forward `fix/communities-r474`.

## Result

All four rulings are built in the app, and the 26 new dependency-free tests pass. **Nothing has been compiled or rendered:** `tsc`, jest and lint could not run, so the TSX changes and both edited jest suites are unproven.

**Open join does not work end to end yet.** This build only offers join when join-info names version 2, and the Dev capture still names 1. Dispatch ruled that this should fail closed and that runtime task `bebf5b5d` moves join-info to 2 in the same change.

Flags are unchanged. Nothing was merged or deployed, and no live calls were made.

## Rulings mapped to commits and tests

Fix commit: `f404f242d`. Tests written first: `06c08ac8c`. Jest suites and docs: `c8020121c`.

| Ruling | What changed | Test (`scripts/communities/r484/`) |
| --- | --- | --- |
| D1: open join, no invite, no approval | The home's Join button opens the join screen. The "Joining isn't open yet" holding sheet (`JoinConsentEntry`) is deleted. The join sends only the consent version. | `D1: open join needs only consent, with no invite and no approval`; `D1: the join request body holds the consent version and nothing else`; `D1: the join screen ignores an invite and asks for no approval`; `D1: the home Join button goes to the join screen, not the holding sheet` |
| D1: join consent step stays | No change to the rule: no tick, no join. | `D1: the consent step stays: no tick, no join` |
| D1: easy to add later | `consentGateFor` and `agreeAndJoin` are the one path every join takes, and a comment says so. No invite or approval code was built. | None |
| D2: toggle removed | Toggle, owner-agent query and grant call are gone from join. | `D2: the agent toggle is absent from the join screen`; `D2: joining never sets the agent grant, whatever a caller passes` |
| D2: grant stays on the home row | `AgentGrantSection` still renders `AgentGrantRow`. | `D2: the grant stays on the community home row` |
| D2: consent v1 to v2 | `CONSENT_WORDING_VERSION` is `'2'`. A new row says the agent gets no access from joining. | `D2: this build ships consent version 2 and only version 2`; `D2: join consent is recorded as version 2`; `D2: the gate offers join for version 2 and fails closed on version 1`; `D2: a version 1 join never reaches the door`; `D2: the version 2 wording says the agent gets no access from joining` |
| F1: self-serve | A 403 or 404 on `GET /:id` now shows "This community is for members" with a Join button, not an error with no way forward. Joining refreshes the home and the community list. | `F1: a refused home offers the join screen and drops cached member content`; `F1: joining refreshes the home, so a cached refusal does not outlive it` |
| F1: no member content for a non-member | New `access.ts`. A 403 or 404 on the timeline hides posts and rosters, including cached ones. | `F1: a door refusal of a member read counts as not a member`; `F1: member content shows only for a member the door has not refused`; `F1: posts and the roster are behind that check` |
| F1: refusal handled | A 4xx on join, or a 2xx with `joined: false`, is a refusal with its own message. 408, 429, 5xx and network errors still say "try again". | `F1: a refusal from the door is told apart from a failure`; `F1: a 2xx that says joined: false is a refusal, not a welcome`; `F1: the join screen shows the refusal apart from the retry message` |
| F5: grant off first, stop on failure | Already built in round 474 and kept. New: a 2xx that still says `on: true` also stops the leave. | `F5: the grant goes off first, then the leave path is called`; `F5: a failed grant-off stops the leave`; `F5: a door that answers the grant is still on stops the leave` |
| F5: state after a partial failure | If the grant goes off but the leave fails, the row now shows off and the message says so. A leave also clears grant and roster caches. | `F5: when only the leave fails, the home learns the grant is now off`; `F5: a leave clears the grant and roster caches as well as the posts` |
| F5: runtime leave path | The app calls `POST /:id/leave`, unchanged. Removing the grant there is the runtime task. | Covered by the first F5 test |

## Red and green evidence

```
node --import ./scripts/communities/r474/register.mjs --test "scripts/communities/r484/*.test.mjs" "scripts/communities/r474/*.test.mjs"
```

| Run | Code | Tests | Pass | Fail |
| --- | --- | --- | --- | --- |
| Red | `9321e9003` source, r484 tests only | 26 | 5 | 21 |
| Green | `f404f242d`, r484 tests only | 26 | 26 | 0 |
| Green, with round 474 | `c8020121c`, r484 and r474 tests | 48 | 48 | 0 |

The green count for r484 alone comes from the same run as the 48: all 48 passed, and 22 of those are r474.

### How much the red results prove

- **Five tests were green before the fix, so they prove nothing about this change:**
  - `D1: the consent step stays`, and the two original F5 order and stop tests: round 474 or earlier already did this.
  - `D2: the grant stays on the community home row`: already true.
  - `D2: joining never sets the agent grant`: **vacuous at base**, because version 2 was refused before the grant code. It only means something now.
- **`D1: the join screen ignores an invite` was red only because of a code comment.** The base code already never read the invite. So open join with no invite was already the client's behaviour; what was missing was a working route to the join screen and a v2 join.
- **Many tests read `.tsx` source as text,** because JSX cannot load without dependencies. They show the wiring exists, not that a screen behaves correctly.
- **The behaviour tests that run real code** cover `consent.ts`, `access.ts`, `memberActions.ts` and, in one test, the real `communitiesClient.join` against a stubbed `fetch`.

## Open

### Needed before open join works

1. **Runtime `bebf5b5d` must name version 2 in join-info.** Until then every join stops at "This community needs a newer version of the app". That message is misleading while the door is the older side, but Dispatch ruled for this behaviour. The two must ship together.
2. **A joined member can read as a non-member.** `descriptor.ts` sets `isMember` from `role` or `viewer_is_admin`, and the door sends no `role`. With the admin role off, a real member gets a successful `GET /:id` but sees the wall and a Join button. This fails closed, so I left it, but it would break open join with that flag off. It needs a decision, or the door to send an explicit membership field.
3. **The runtime enforces membership and admission on the server.** The client checks here are for display only.

### Assumptions not checked against door code

The runtime was not read in this round.

- **`joined: false` means refused.** If the door uses it for "already a member", that person sees the refusal message.
- **A 404 on the grant route means no grant.** This is kept from round 474, and it lets a leave go ahead. A 404 for any other reason would let the leave proceed with the grant unknown.
- **A 403 or 404 on `GET /:id` or the timeline means not a member.** A community that doesn't exist looks the same, by the door's design, and gets the same Join screen. The join then ends in the refusal message.

### Later or out of scope

- **Invites and approvals:** not built, per the ruling. The `invite` route param stays and is ignored, because routing was out of scope.
- **Existing v1 members are not asked to consent again.** The door doesn't say which version a member accepted. This open item already existed.
- **A community whose own version is above 2** gets the refusal message, because the door refuses it with a 404 and join-info only gives the platform version.
- **The consent line says "I agree to the community rules",** and a non-member can't see any rules. Already open.
- **A removed member can rejoin at once under open join.** Only a ban would stop that, and the F2 ban route doesn't exist on the runtime yet.
- **The paid tier is not treated differently.** The join screen doesn't know the tier, because join-info doesn't send it. No charge or entitlement check exists in this flow.
- **Other surfaces were not audited for refused reads.** I changed the community home's posts and Members tab. The combined home feed and thread views were not changed.
- **The grant row is still hidden if its read fails** (the `AgentGrantSection` part of reverted `72087128e`). It was not in this ruling, so it was not reapplied.
- **F2 and F6 are untouched.**
- **`door.json`'s generator still gives a null join-info,** so the shared fixtures don't show the v2 happy path. The jest suite sets `{wording_version: 2}` itself.
- **The clickthrough harness still has a branch for the holding sheet.** It is now dead code but harmless. Against a door at version 1, the join step throws "join screen says the app needs an update".

## Could not run

| Check | Why |
| --- | --- |
| `pnpm test` (`tsc` on `tsconfig.communities.json`, then jest) | No `node_modules`, and installs are not allowed. **The changed TypeScript and TSX have not been type-checked** |
| `JoinConsent.test.tsx`, `CommunityScreen.test.tsx` | Same. Both were edited to match, including new refusal cases and new mocks. **Those edits have never run** |
| `pnpm lint`, prettier | Same. Formatting was done by hand |
| Any render of the join screen or community home | No test here renders them |
| App or device run, clickthrough, live door | Not allowed in this task, and not attempted |

New strings are not extracted, because CI handles that.

**Please run `pnpm test` first.** The likeliest failures are in the jest mocks: `JoinConsent.tsx` now imports `./queries`, `#/state/session` and the my-communities module, and I mocked the last two without being able to run them.

## Process notes

- **One question went to the orchestrator:** what to do if the door still names version 1. I carried on with fail closed while waiting. The answer confirmed it, so nothing was reverted.
- **Beyond the literal list:** I deleted `JoinConsentEntry.tsx` and changed one line on the home header, "You choose what to share before you join", because the toggle was the only choice. The new text is "You'll see what joining shares before you join." I also changed `key` on `AgentGrantRow` so a new cached value reaches it, which remounts the row after each save.
- **No files were written outside the worktree.** The red run was done by running the tests before changing the source.
