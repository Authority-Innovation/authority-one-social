# Task 0e8bd300 - Community home polish 2 (One Dev 39)

Branch: `coord/community-home-polish-2-compose-0e8bd300`, based on
`communities/integration` at `d98a57893`. Code commit: `59c238b63`. Not
merged; flags and `eas.json` unchanged.

## Root causes found

1. **Compose:** `CommunityComposerEntry` already existed, but it was rendered
   after `Layout.Content`, below the scroll view, so on device it sat off
   screen. It is now inside the scroll content, right under the header and
   agent card, for members only. Its target is unchanged:
   `{kind: 'community', id, tier}` (members tier for a members community), so
   it goes through the composer's existing community target path.
2. **Agent card and grant row:** `toDescriptor` built `agent` only when a
   sponsor DID string was present. The real Dev response
   (`__tests__/fixtures/dev-runtime-2026-10-30.json`) has `agent.did` and no
   sponsor, so `agent` was undefined. That hid the card AND the grant section,
   which was gated on `community.agent`.

## Changes

- `descriptor.ts`: `agent` is set whenever an agent DID is named;
  `sponsorDid` is optional. `agentSponsor` is read defensively: an object
  `{did, handle}` (the runtime member-response change) or a bare DID string
  (config record). `sponsorName` = `agentSponsor.handle`, else the older
  `agentSponsorName`; never the DID, never the community name. Junk values
  (null, number, array, empty or non-string handle) give no sponsor name.
- `AgentCard.tsx`: sponsor line is `AI agent · run by {sponsorName}` (the
  same message already used by `CommunityThreadPost`) when there is a
  handle, else `AI agent`. The old "sponsor: X" wording is gone, per the
  spec's "run by <handle>".
- `AgentGrantSection.tsx`: now a "Your settings" section with its own
  heading, gated on `isMember && agentDid` (not on the card). The grant row
  copy is unchanged. `useCommunityAgentGrantQuery` is gated the same way.
- `index.tsx`: composer entry moved inside `Layout.Content`.
- `README.md`: rules updated to match.

## Tests (all in `src/screens/Community/__tests__/`)

CommunityScreen.test.tsx (the composer entry is now rendered for real; only
`useOpenComposer` is mocked):
- `Community home - compose › a member finds the compose control and it opens the composer targeted to this community at the members tier`
- `Community home - compose › a non-member gets no compose control`
- `Community home - agent card › renders for a member with just "AI agent" when the response has no agentSponsor` (replaces "is hidden when the config has no agentSponsor")
- `Community home - agent card › renders for a member on the REAL Dev runtime response (agent DID, no sponsor)`
- `Community home - agent card › shows "run by <handle>" from the runtime agentSponsor {did, handle}` (replaces the "sponsor: Sam R." test)
- `Community home - agent card › never shows the sponsor DID as a name when agentSponsor has no handle`
- `Community home - agent grant row › a member sees the grant row in a "Your settings" section, also with no agentSponsor`
- flags describe: `renders no compose control, agent card or "Your settings" for a member with Communities off`

descriptor.test.ts:
- `reads the runtime agentSponsor {did, handle} defensively`
- `has an agent whenever an agent DID is set, with or without a sponsor` (replaces the N1 "both required" test)

realPayloads.test.ts: the member-descriptor test now expects an agent with
no sponsor name for the real Dev response.

## Test runs

`pnpm test` fails on Windows before jest starts (`NODE_ENV=test jest ...`
is POSIX syntax), so I ran the same command directly:
`NODE_ENV=test node_modules/.bin/jest --forceExit --testTimeout=20000 src/screens/Community src/features/communityAgent src/features/communities src/lib/communities`
-> **21 suites, 381 tests, all passed.** I did not run the full repo suite.
Dependencies came from `pnpm install --offline --frozen-lockfile
--ignore-scripts` (local store only).

`tsc --noEmit` reports errors on the base branch in files and lines this
change doesn't touch (e.g. `Community` type drift: `role`, `posts` page
shape, `CommunityPost` export). None of the errors are in new or changed
lines. ESLint on `src/screens/Community`: one existing error in
`consent.ts` (untouched) and warnings only.

## Runtime sponsor field

**Not present when tested.** I did not call the runtime (off-machine calls
aren't allowed). The only real payload available, the 2026-10-30 Dev
fixture, has no `agentSponsor`. The `{did, handle}` shape is covered by
mocked responses only.

## Assumptions

- With no agent DID at all, there is still no card and no "Your settings"
  section, because the only setting today is the agent grant. A member of a
  community with an agent DID always sees both.
- The agent card is still shown to non-members, as before.
- The compose control keeps its existing "Post to this community" label
  rather than new "Write a post" copy.
