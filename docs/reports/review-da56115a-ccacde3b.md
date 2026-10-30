# Review da56115a: backlog record ccacde3b (type drift fix 2), fresh read

**Verdict: CAN LAND, as it has already landed.** ccacde3b is already on
`origin/communities/integration`. Its one HIGH (the sponsor gate) was fixed there by 55f1f868.
No BLOCKER or HIGH remains. The MEDIUM and LOW items below are follow-ups, not reasons to revert.

## What was reviewed, and where

- **The named branch does not contain ccacde3b's code.** The spec names
  `coord/app-fix-timeline-type-drift-one-e31e0aa7`. Its tip, `f57ed82e1`, is the e31e0aa7
  report commit, and ccacde3b was built *on top of* it. None of ccacde3b's commits are on that
  branch.
- **ccacde3b's code landed on `origin/communities/integration`** as rebased commits
  `1b559b03c`, `1e5c3caba` and reports `aba3c8024` and `7cca43ac3`. The rebase was done by
  fix task 55f1f868.
- **Since then, integration added:**
  - 55f1f868: `b0d370957`, `0c065e7f8`, `f561fcffd`. These gate the agent on `agent
    {did, is_agent}`, not on `agentSponsor`.
  - Build 41 (9384c78d): `f3369e3bf` through `f92182b46`.
- **Reviewed:** the ccacde3b code as it stands at integration head `f92182b46`.
- **Read first:** ccacde3b's own report
  (`docs/reports/task-ccacde3b-agent-label-join-info-door-fakes.md` at `7cca43ac3`) and the
  earlier review 1aa1fa31 (`docs/reports/review-1aa1fa31-ccacde3b.md` at `07dc15755`, on the
  1aa1fa31 branch).
- **Not read:** the bus task body itself. This session has no bus read tool, so the two reports
  above stand in for it.

## Status of the 1aa1fa31 findings at `f92182b46`

| 1aa1fa31 finding | Status |
| --- | --- |
| HIGH 1: card and label gated on `agentSponsor` | **Fixed.** `labelRule.ts:33-44` gates on `agent.is_agent` plus the shared DID rule. `descriptor.ts:111-138` builds the agent from `agent {did, is_agent}` with the sponsor optional. |
| HIGH 2: not based on integration | **Fixed.** The code was rebased and is now on integration. |
| MEDIUM 3: fixtures from undeployed runtime | **Fixed.** Build 41 regenerated door.json from `deploy/dev-communities` `cca6020d`. |
| MEDIUM 4: descriptor reads keys the door never sends | **Still open.** It is worse than before; see M1. |
| LOW 5: `wording_version: null` shows a load error | **Still open.** See L1. |
| LOW 6: unwrapped comment in the JoinConsent header | **Still open.** See L3. |

## Findings

No BLOCKER. No HIGH.

### MEDIUM 1: the landed descriptor still reads the invented agent fields that ccacde3b's report says were removed

- **Where:** `src/screens/Community/descriptor.ts:120-136` at `f92182b46`.
  - `str(config?.agentSponsor) ?? str(raw.agentSponsor)`: a string sponsor, which the door never sends.
  - `str(raw.agentSponsorName)`
  - `name: str(raw.agentName)`
  - `scope: str(raw.agentScope)`
- **What the report claims:** ccacde3b's report, item 1, says `agentName`, `agentSponsorName`
  and `agentScope` and the string `agentSponsor` are gone from `descriptor.ts`. That was true on
  the original branch (`76e666079` has none of them). It is not true of what landed: the
  rebased `1e5c3caba` already reads all four, and `AgentCard.tsx:30-38` (at `f92182b46`) reads `agent.name` and the fallback
  `agent.sponsorName` from them.
- **Failure scenario:**
  - Today the door sends none of these keys, so nothing is shown wrongly and the card falls back
    to the profile cache and the handle.
  - But the record says this drift is closed, and the tests still pass whether or not the
    descriptor reads these keys.
  - A future runtime or proxy that adds an `agentName` or `agentSponsorName` key would put an
    unverified name on the accountability line ("run by ...") ahead of the sponsor's real member
    handle.
  - The `Proxy` read-recorder test from ccacde3b covers `resolveAuthorLabel` only, not
    `toDescriptor`.
- **Fix:** Delete the four reads (keep `sponsorHandle` from `agentSponsor.handle`). Add the same
  recording-`Proxy` test to `descriptor.test.ts`. Correct item 1 of the ccacde3b report.

### MEDIUM 2: after a successful join, the community home's query is not invalidated

- **Where:**
  - `src/screens/Community/JoinConsent.tsx:119-140`: `onGoToCommunity` only calls
    `navigation.navigate('Community', {id})`.
  - No `invalidateQueries` on `createCommunityQueryKey({id, viewer})` (`queries.ts:32`).
- **Failure scenario:** A non-member opens `/c/:id` first. The door answers `GET /:id` with
  `not_found`, the query errors, and the screen shows "Could not load this community"
  (`index.tsx:74-85`). The person then opens the `/c/:id/join` link and joins, and taps "Go to
  the community".
  - If that Community screen is still in the stack and navigation returns to it, it shows the
    cached error until it remounts.
  - Separately, a member home cached under the same key within its one-minute stale time keeps
    showing pre-join state.
- **Verdict:** PLAUSIBLE, not reproduced. Whether `navigate` re-focuses the existing route or
  pushes a new one depends on React Navigation 7 stack semantics, which I did not run on a device.
- **Fix:** On `outcome.ok`, `queryClient.invalidateQueries({queryKey: createCommunityQueryKey({id, viewer})})`.
  Then navigate with `push`, or with `popTo` and the invalidation.

### MEDIUM 3: a community whose own wording version is above the platform's cannot be joined, and the error does not say why

- **Where:** `JoinConsent.tsx:111-127` and `consent.ts:62-71`.
- **Why:** join-info sends the platform `wording_version`. The door requires
  `consentVersion >= max(platform, community)`.
- **Failure scenario:** The platform version is 1 and a community's own version is 2. join-info
  says 1, the gate is `ok`, and join posts 1. The door refuses, and the person sees "Couldn't join
  right now. Please try again." Every retry fails the same way.
- **Status:** disclosed as open item 4 in the ccacde3b report, and still unaddressed.
- **Fix:** On a refused join, read the door's join-info hint in the error and re-gate on it
  (`unsupported` if this build lacks that copy). Or have the runtime return the effective version
  from join-info.

### LOW 1: `wording_version: null` shows "We couldn't load this community" with a Try again that cannot succeed

- **Where:** `JoinConsent.tsx:158`, where `gate.kind === 'missing'` joins the error branch.
- **Failure scenario:** A runtime with no `communities.wording_version` set returns a valid 200
  `{wording_version: null}`.
- **Fix:** Use a separate branch with "This community isn't open to join yet" and no retry.

### LOW 2: the consent checkbox says "I agree to the community rules" but the screen shows no rules

- **Where:** `JoinConsent.tsx:281` and `284-287`. `RulesAndLinks` (`396-415`) shows only
  "Leaving".
- **Failure scenario:** The person consents to rules they were never shown. That is weak
  consent wording for a recorded consent version.
- **Fix:** Reword the copy to what is actually shown (a product and legal call), or get rules from
  join-info first.

### LOW 3: the header comment in JoinConsent is not wrapped

- **Where:** `JoinConsent.tsx:8`, which runs past 100 columns.
- **Fix:** Rewrap it.

### LOW 4: Try again gives no feedback while it refetches

- **Where:** `JoinConsent.tsx:154-174`.
- **Why:** `isLoading` is false during a refetch after an error.
- **Failure scenario:** Tapping Try again shows nothing until it fails again.
- **Fix:** Show the loader when `isFetching`, or disable the button while it runs.

## Checks that pass at `f92182b46`

- **The label rule** (`labelRule.ts`) reads only door fields: `agent {did, is_agent}`,
  `author.is_agent` and `author.did`, plus the optional `agentSponsor.handle` for display. It
  shares `isCommunityAgentAuthor` with the posts list, so ccacde3b's open item 5 (thread and list
  disagreeing) is gone.
- **The join screen** reads only `getJoinInfo`'s `{wording_version}`.
  - `consentVersionFor` accepts finite numbers only, with no fallback to 1.
  - `join` refuses a non-numeric version.
  - The welcome name comes from the join response.
  - An invite is never read as consent.
- **Join parsing:** `communitiesClient.join` rejects a response that has no `community` object
  or no boolean `joined`, so `outcome.membership.community.name` cannot throw. If the name is
  missing it renders empty.

## What I ran (in this worktree, detached at `origin/communities/integration` `f92182b46`, then back on the task branch)

- `git fetch origin`, plus `git log`, `git show`, `git grep` and `git branch --contains` to trace
  where ccacde3b's commits landed.
- `corepack pnpm install --offline --frozen-lockfile --ignore-scripts`. Its log went to
  `C:\ao\worktrees\da56115a-install.log`, one level **outside** this worktree, by mistake; a
  human can delete it. The install touched `package.json` line endings only, and I restored it.
- `node_modules/.bin/lingui compile`. The output is gitignored.
- `node_modules/.bin/tsc --noEmit -p tsconfig.communities.json`: exit 0.
- `NODE_ENV=test node_modules/.bin/jest --forceExit --testTimeout=20000 src/features/communities src/features/communityAgent src/screens/Community src/lib/communities`:
  **24/24 suites, 435/435 tests passed.**
- **Not run:**
  - the full jest suite;
  - `pnpm test`, `pnpm typecheck` and `pnpm lint` (`pnpm` is not on PATH);
  - any device or web run.

  MEDIUM 2 is therefore unverified at runtime.
