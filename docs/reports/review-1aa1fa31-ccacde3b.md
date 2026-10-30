# Review 1aa1fa31: type drift fix 2 (ccacde3b), checked against the deployed door

Reviewed: `coord/type-drift-fix-2-agent-label-fro-ccacde3b` at `76e666079`.
Compared with: `origin/communities/integration` `9ad2a0c72` / head `03ea8768d`.
Runtime door read: `authority-one-runtime` `origin/deploy/dev-communities` `7f436b82`,
`src/communities/door.js` and `agent-slot.js`. I also read
`origin/coord/member-community-response-carrie-bfd5a63c` (`eabfbcdd`) for comparison.
This is a review only. Nothing on the ccacde3b branch was changed.

## What I ran

- `corepack pnpm install --offline --frozen-lockfile`. The postinstall failed because `pnpm`
  is not on PATH, so I compiled the catalogs with `node_modules/.bin/lingui compile`.
- `tsc --noEmit -p tsconfig.communities.json` exited 0.
- `NODE_ENV=test jest --forceExit --testTimeout=20000` over the touched paths:
  `src/features/communities`, `src/features/communityAgent`, `src/screens/Community`,
  `src/lib/communities`, `src/lib/agent-runtime`, `src/lib/api/feed` and
  `src/view/com/composer/state`.
  - Result: **55/55 suites, 896/896 tests passed.**
- `git merge-tree --write-tree HEAD origin/communities/integration`.
- Not run: the full jest suite, `pnpm typecheck` (tsgo), `pnpm lint`, and any device or web run.

## What the deployed door actually sends (7f436b82)

- **Community** (`publicConfig`): `{id, name, description, accent, wording_version}`.
  - With the agent flag on, it adds `agent: {did, is_agent: true} | null` and `agent_error?`.
  - With the admin role on, it adds `viewer_is_admin`.
  - It sends **no `agentSponsor`**. The real Dev capture (`dev-runtime-2026-10-30.json`
    `home.community`) confirms this: `agent` is present, `agentSponsor` is not.
- **The sponsor is already guaranteed.** `agent` is non-null only when
  `readAgentSlot(config)` succeeds. That function throws `agent_sponsor_missing`,
  `agent_sponsor_bad_did` or `agent_sponsor_is_agent` unless the config holds a valid sponsor DID
  that is not the agent. In that case the door sends `agent: null` with `agent_error`. So on the
  deployed door, a non-null `agent` already proves a valid sponsor exists.
- **Join-info:** `{wording_version}`, the platform version or null. Join needs
  `consentVersion >= max(platform, community wording_version)`.

## Findings

### HIGH 1: the agent card and the thread label are gated on a field the deployed door never sends

- **Where:**
  - `src/screens/Community/descriptor.ts:98-104`: the agent is set only when `agentDid && sponsorDid`, and `sponsorDid` is read from `community.agentSponsor?.did`.
  - `src/features/communityAgent/labelRule.ts:43-46`: it returns `member` with the warning `agent_without_sponsor` when `agentSponsor.did` is empty.
- **Failure scenario:** A member opens the `ao-dev-test` community on the `development-communities` build against Dev (7f436b82), where the door sends `agent: {did, is_agent:true}` and no `agentSponsor`.
  - The agent card never renders.
  - The pinned test `src/screens/Community/__tests__/realPayloads.test.ts:66-67` asserts `d.agent` is undefined on the real payload. That test locks the regression in.
  - The thread label would mark every agent post as a member post, with an operator warning.
  - The posts list (`membersPost.ts:96`, DID rule only) *does* label the same posts "AI agent". So one screen labels a post as the agent and has no agent card explaining who is accountable for it.
- **Regression:** integration polish 2 (`59c238b63`) deliberately shows the card whenever an agent DID is named, with the sponsor optional. This branch reverses that.
- **Cause:** The gate depends on `agentSponsor`, which exists only on the undeployed runtime branch `eabfbcdd`. The spec says the label must come from real fields, and that the deployed door has no sponsor field.
- **Fix:** Gate the label and the card on `agent?.did` plus `author.is_agent` and the DID match only, because a non-null `agent` already proves a sponsor on the door. Read `agentSponsor?.handle` only as optional display, and invert the `realPayloads` assertion so the card is shown.

### HIGH 2: the branch is not based on current integration, and merging it conflicts with polish 2

- **Where:** The merge-base is `d98a57893`. `9ad2a0c72` is not an ancestor of the branch.
- **Failure scenario:** `git merge-tree HEAD origin/communities/integration` reports CONFLICT in 5 files:
  - `communitiesClient.ts`
  - `descriptor.ts`
  - `AgentCard.tsx`
  - `descriptor.test.ts`
  - `CommunityScreen.test.tsx`

  Those integration commits (polish 2 `59c238b63` and the Members tab `3f06292fc`) moved the agent card in the opposite direction, so a mechanical resolution picks one side's semantics silently. The spec's "compare against 9ad2a0c72" therefore does not hold.
- **Fix:** Rebase onto `03ea8768d`. Resolve the card on integration's "agent DID is enough, sponsor handle is optional" rule (see HIGH 1), then rerun the suites.

### MEDIUM 3: the "door contract" fixtures come from an undeployed runtime branch

- **Where:**
  - `scripts/communities/generateDoorFixtures.mjs:17` (`SOURCE_COMMIT = eabfbcdd`).
  - `src/lib/communities/__fixtures__/door/door.json`, whose `$source.ref` is `coord/member-community-response-carrie-bfd5a63c`.
- **Failure scenario:** `doorContract.test.ts` and the label and screen tests build their community fakes from `communityWithSponsorMember`, which carries `agentSponsor`. Every "happy path" therefore passes on a shape Dev never returns, and the suite stays green while the app shows no agent card on Dev. The only deployed-shape check is the Dev capture, and it asserts the broken outcome.
- **Fix:** Generate door.json from `deploy/dev-communities` (7f436b82). Keep a separate bfd5a63c fixture only for the optional handle, and run the agent label and card happy paths against the deployed shape.

### MEDIUM 4: the descriptor still reads keys the door never sends (pre-existing, disclosed in the builder's open item 2)

- **Where:** `src/screens/Community/descriptor.ts`, roughly lines 88-140. It reads `raw.role`, `config.tier/theme/brand/moderation`, `memberCount`, `rules`, `rulesUrl`, `runBy`, `groupUri`, `consentVersion`, `avatar` and `banner`.
- **Failure scenario:** With the door's admin role off, a real member's response has neither `role` nor `viewer_is_admin`, so `isMember` is false. The member then sees the non-member state on their own community.
- **Fix:** Derive membership from a successful `GET /:id` (the door answers members only), and drop the dead keys.

### LOW 5: join-info returning `wording_version: null` shows "We couldn’t load this community"

- **Where:** `src/screens/Community/JoinConsent.tsx:158`.
- **Failure scenario:** Any runtime whose account config has no `communities.wording_version` returns a valid 200 `{wording_version:null}`. door.json's own generator config is one such case. The screen then reports a load failure with a "Try again" that cannot succeed, when the real problem is that the community is not joinable yet.
- **Fix:** Show distinct copy for `gate.kind === 'missing'`.

### LOW 6: the comment in the JoinConsent header is not wrapped

- **Where:** `src/screens/Community/JoinConsent.tsx:8`, which runs past 100 columns.
- **Fix:** Rewrap the comment.

## Checks that pass

- **JoinConsent reads the real join-info shape.**
  - `getJoinInfo` reads `{wording_version}` (`communitiesClient.ts:237-246`).
  - `consentVersionFor` accepts only a finite number.
  - `join` posts a numeric `consentVersion`.
  - The welcome name comes from the join response's `community.name`.
  - `getCommunity` is never called before the join.
  - No invented field is read on the join screen.
- **No invented sponsor or display-name fields remain on the label path.**
  - `agentDid`, `agentSponsorName`, `agentName`, `agentScope` and the string `agentSponsor` are gone from `labelRule`, `types.ts`, `descriptor.ts` and `AgentCard.tsx`.
  - `agentSponsor` on an item is rejected at both the type level and the run level.
  - The fault is HIGH 1: the one sponsor field still read is real only on the undeployed runtime.
- **Flags are unchanged.** The branch does not touch `eas.json` or `src/env`. `EXPO_PUBLIC_COMMUNITIES_ENABLED` is `"true"` only in `development-communities` (`eas.json:67`) and `"false"` in every other profile.
- **The thread view has no production caller.** `CommunityThreadPost` is not rendered outside tests, so the label part of HIGH 1 is latent today. The agent card part is live on the dev build.
