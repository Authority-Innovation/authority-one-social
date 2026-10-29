# One Dev 39 polish 5-7 (task e3e0d205)

Branch `coord/one-dev-39-polish-5-7-refetch-af-e3e0d205`. Not merged. No flag,
eas.json, build-number or grant-copy change.

## Base

Polish 1 (d0d43e8f) and polish 2 (0e8bd300) had not landed on
`communities/integration` (head d98a57893) when this ran. Both task branches
were merged into this branch (no conflicts) and the work sits on top:

- `origin/coord/community-home-polish-1-author-n-d0d43e8f` (64701c5e3)
- `origin/coord/community-home-polish-2-compose-0e8bd300` (2f720cff3)

If those branches change before they land, this branch needs a re-merge or a
rebase onto the integration head that carries them.

## 5. Launch: refetch after success

`AgentLaunchControl` already had an `onLaunched` callback but the home never
passed one. `index.tsx` now passes it, and it invalidates the community query
and the agent-grant query for this viewer. The refetched member response
carries `agent` and `agentSponsor {did, handle}` (runtime door `sponsorView`,
runtime branch `coord/member-community-response-carrie-bfd5a63c`), so the
agent card ("AI agent · run by <handle>") and the "Your settings" grant row
render without a reload. The launch response has no community in it (runtime
test: `{communityId, agent, launched}`), so a refetch is the only way to get it.

The agent card's name is the config's `agentName` if sent, else the display
name in the profile cache for the config's agent DID (so "Bob" on Dev), else
"Community agent". The agent label still comes only from the config DID.

## 6. Members tab: the real roster

Roster route used: **`GET /app/communities/:id/posts/:postId/roster`**
(runtime `src/communities/door.js`, `AGENT_ROUTES`, matched only while the
community-agent flag is on). Entries come from `agent-slot.js`:

- `memberRosterEntry(memberId)` = `{id: memberId, did: null, is_agent: false}`
- `agentRosterEntry(slot)` = `{id: 'community-agent', did: slot.agentDid, is_agent: true}`

The fixture is the real Dev payload already in
`src/screens/Community/__tests__/fixtures/dev-runtime-2026-10-30.json`
(`roster`), which matches those builders. No field was invented.

### Where the spec and the runtime disagree (assumption, recorded)

I asked the orchestrator (qid 5d16f0b5). No answer had arrived when I
finished, so I went ahead on the plan below.

- The runtime roster is per thread, not per community. There is no
  community-wide member list route. The tab merges the rosters of the
  top-level posts already loaded in the timeline (up to 20), deduped by id,
  with the agent last. A member who has not posted in a loaded thread is not
  listed.
- Member entries have `did: null`. Their `id` is the account handle (the
  runtime's `sponsorView` says the memberId is the account handle; on Dev it is
  `member.example.test`). The profile cache is asked for that handle, and the
  avatar and display name come from there. If it does not resolve, the row
  shows `@handle`.
- The roster has no admin field. ADMIN is shown only where existing payloads
  prove it: the signed-in member's row when the runtime said
  `viewer_is_admin: true`, and the row whose handle equals
  `agentSponsor.handle` (only an admin can launch). Other admins get no badge.
- The member-tier "The member list isn't available yet." text is gone. The
  public-tier line with the same wording (`communityPublicMembersUnavailable`)
  is still there. Public-tier members belong to the group AppView, which the
  app cannot reach yet, and the runtime roster is members-tier only.
- New strings: "ADMIN", "Couldn't load the member list.", "No one has posted
  here yet." The grant copy is unchanged.

A runtime route that lists the whole community roster (with admin flags)
would remove these limits. That is out of scope for this app task.

## 7. Compose

The compose entry from polish 2 is visible on the home for a member, both
before and after the launch. This is checked in the launch screen test
(`communityComposerEntry` present). Nothing more was needed.

## Tests

New in `src/screens/Community/__tests__/CommunityScreen.test.tsx`:

- Community home - after an agent launch (One Dev 39)
  - refetches the home and shows the agent card and the grant switch, with no reload
  - a failed launch refetches nothing and shows no agent card
- Community home - Members tab roster (One Dev 39)
  - lists the real roster with names, avatars, the ADMIN badge and the agent label
  - gives no ADMIN badge to a member the runtime did not mark
  - falls back to the handle when the profile is not cached
  - never labels an is_agent entry whose DID is not the config agent
  - shows an error when every roster read fails
  - a non-member reads no roster
  - flag off renders no roster, agent card or grant switch and reads nothing

Client: `getThreadRoster` cases in `communitiesClient.test.ts` (real Dev
payload, malformed entries dropped, invalid args) and a door-envelope case in
`communitiesClient.contract.test.ts`.

### Runs

The worktree had no `node_modules` and `pnpm` is not on PATH. I added a
gitignored junction to
`C:\ao\worktrees\03067be4-app-agent-label-from-aut\node_modules` (only read
from) and ran the underlying binaries:

- `NODE_ENV=test jest --forceExit --testTimeout=20000 src/screens/Community src/lib/agent-runtime/__tests__/communitiesClient src/features/communityAgent src/features/communities src/lib/api/feed`:
  **21/21 suites, 430/430 tests passed.**
- eslint `--quiet` on `src/screens/Community` and the changed client files: one
  error, which was already there (`consent.ts:63`, unnecessary assertion; that
  file is not touched here).
- `tsgo --project ./tsconfig.check.json`: 138 errors repo-wide, all already
  there (for example `CommunityPost` missing from communitiesClient, and
  `consent.ts`/`JoinConsent.tsx`). None are in new or changed code.
- I did not run the full repo jest suite.
