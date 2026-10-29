# W2-T13 fix pass: sponsor label, row mount, copy gate

Task `40b3876c`. Base: `communities/integration` at `724e3ce45`.
Branch: `coord/w2-t13-fix-sponsor-label-mount-r-40b3876c`. Flags unchanged:
`EXPO_PUBLIC_COMMUNITIES_ENABLED` is not touched in any `eas.json` profile.

## 1. M2 - no community-name sponsor fallback

- `src/features/communityAgent/labelRule.ts`: `sponsorName` is now only the
  resolved `agentSponsorName`. The `|| community.name` fallback is gone. With no
  resolved sponsor name the label is `{kind: 'agent', sponsorName: ''}`.
- `CommunityThreadPost.tsx` already rendered `AI agent` (no "run by") and the
  sponsor-less "Why am I seeing an agent?" text for an empty name, so no
  change was needed there once the rule stopped filling it in.
- Test added: "sponsor with no resolved name shows the agent label and never
  the community name" (checks the rule output, the sponsor line is exactly
  `AI agent`, and that neither the community name nor "run by" appears anywhere,
  including the opened disclosure).

## 2. M1 - AgentGrantRow mounted

There is no per-community settings screen in the app yet, so the row is mounted
on the community home (`src/screens/Community/index.tsx`), which is already
gated by `COMMUNITIES_ENABLED` (null render + Home redirect + no fetch).

- New `src/screens/Community/components/AgentGrantSection.tsx`, placed under the
  agent card. Shown only when the flag is on, the caller is a member, and the
  community has an agent (N1 descriptor). It also checks the flag itself.
- New `useCommunityAgentGrantQuery` in `src/screens/Community/queries.ts` reads
  `getAgentGrant` (existing endpoint) first so the toggle starts from the real
  value; on a failed read the row is not shown rather than showing a guessed
  "off". Key carries the viewer DID like the other community queries.
- `AgentGrantRow` gets an optional `onSaved` prop so the section can write the
  confirmed value back into the query cache.
- Screen tests: member sees the row with the runtime value; non-member and
  agent-less community get no row and no grant read; failed read shows no row;
  flag off makes no grant read and renders no row.

If a dedicated community settings surface is wanted instead, move
`AgentGrantSection` there; it has no dependency on the home layout.

## 3. Copy gate

`AgentGrantRow.tsx` copy now follows the contract
(`communitiesClient.ts` `setAgentGrant`: "the community agent's access to the
caller's content") and no longer names members-only posts:

- Label: "Give this community’s agent access to my content here"
- Body: "While this is on, the community’s agent has access to your content in
  this community. Off unless you turn it on. You can turn it off any time."
- `TODO(Elliott)` inline: final copy needs Elliott's sign-off.

The copy test now asserts the contract wording and that "members-only" is absent.

## Extra fix found while mounting

`AgentGrantRow` read `res.data.agentGrant`, but `AgentGrantState` is
`{communityId, on}`. Against the real client a successful toggle would set the
switch to `undefined` (shown off). Now reads `res.data.on`; the test mocks were
using the wrong shape and now match the client. This removes 3 pre-existing tsc
errors. Request body, default (off) and endpoints are unchanged.

## Not changed, flagged for review

`src/screens/Community/components/AgentCard.tsx:22` still does
`agent.sponsorName ?? community.runBy`, and `descriptor.ts` fills `sponsorName`
from `brand.displayName`. That is the same class of substitution as M2 (the
community's brand standing in for a human sponsor) but it sits outside the
files named in this task, so it is left for a follow-up decision.

## Verification

- jest (`src/features/communityAgent`, `src/features/communities`,
  `src/screens/Community`): 12 suites, 168 tests, all passed.
  node_modules is a local junction to another worktree's install with an
  identical `pnpm-lock.yaml`; `pnpm` itself was not on PATH, so jest/tsgo/eslint
  were run from `node_modules/.bin` with the same flags as the package scripts.
- typecheck (`tsgo --project ./tsconfig.check.json`): FAILS, but every error is
  pre-existing. Base `724e3ce45` has 140 error lines, this branch 137; the diff
  is exactly the 3 `agentGrant` errors removed. Nothing new.
- eslint on `src/features/communityAgent` and `src/screens/Community`: FAILS on
  pre-existing errors (unresolved `CommunityPost`/`CommunityPostAuthor` types in
  `communitiesClient`, an assertion in `consent.ts`). No errors in the new files.

---

# Fix pass 2 (task `bdd18e48`)

Base: `coord/w2-t13-fix-sponsor-label-mount-r-40b3876c` at `a0f89b273`.
Branch: `coord/w2-t13-fix-2-remove-community-na-bdd18e48`. No flag, default or
grant-body change.

1. **Blocker, descriptor.** `src/screens/Community/descriptor.ts`:
   `agent.sponsorName` is now `agentSponsorName` only. The
   `brand.displayName` fallback is gone. `descriptor.test.ts` was updated:
   the base case now expects `sponsorName: undefined`. A new case checks that
   the brand name is never used as the sponsor and that a real
   `agentSponsorName` comes through.
2. **Blocker, AgentCard.** `src/screens/Community/components/AgentCard.tsx`:
   the `community.runBy` fallback is gone. With no sponsor name the line
   reads exactly `AI agent`. The old "sponsored by this community" text is
   removed too, because it also stood in for the community as sponsor. In
   `CommunityScreen.test.tsx`, the sponsor test now sets `agentSponsorName`.
   A new test checks that an agent with no `sponsorName` shows `AI agent`
   with no sponsor, and that the card nowhere shows the community name.
3. **Mount location.** No community settings surface exists. The only
   community routes are `Community`, `CommunityMembers` and `CommunityJoin`
   (`src/routes.ts`), and there is no settings or manage screen under
   `src/screens/Community`. As instructed, I did not create one. The grant
   row stays on the community home, behind `EXPO_PUBLIC_COMMUNITIES_ENABLED`.
4. **Prettier: not run.** This worktree has no `node_modules`, and neither
   `pnpm` nor `prettier` is installed on this machine. The test edits were
   written by hand in the repo's style (no semicolons, single quotes, 80
   columns). `communityAgent.test.tsx` was not touched in this pass.
5. **This report file is kept.** It is the report that task `40b3876c` was
   required to produce, so it is not an unrequested file. This pass appends
   its own section here rather than adding a new file.

**Tests: not run.** labelRule, communityAgent and CommunityScreen were all
not run, because no `node_modules` and no `pnpm` are available to run
`pnpm test`.
