# Review 77db422e: PR #21 at f561fcffd (fix 55f1f868 for ccacde3b)

Review only. I did not commit, push or merge anything on the reviewed branches.

## Verdict

**PR #21 can land on `communities/integration`.** No BLOCKER, no HIGH. Both
earlier HIGHs (1aa1fa31) are fixed. The four LOW items below can be follow-ups.

## What I reviewed

- `git ls-remote origin`: `refs/pull/21/head` = `f561fcffd`, which is
  `origin/coord/fix-ccacde3b-high-1-gate-agent-l-55f1f868`.
  `communities/integration` = `03ea8768d`.
- Note: the spec names `coord/type-drift-fix-2-agent-label-fro-ccacde3b` as the
  branch. That branch is still at `76e666079`: it is not rebased and it still
  gates the label on agentSponsor. PR #21 does **not** point at it (see LOW 4).
- Runtime: `authority-one-runtime src/communities/door.js` at **17586054**
  (head of `deploy/dev-communities` in the local runtime clone), read with
  `git show` only. My fresh clone to look for anything newer than 17586054 was
  blocked by the deny-list, and I did not work around the block. So I checked
  against 17586054 exactly.

## HIGH 1 (label gated on agentSponsor): FIXED

door.js @17586054, `publicConfig`:
`out.agent = slot ? {did: slot.agentDid, is_agent: true} : null`. When the flag
is off, the response has no `agent` key. Each item gets top-level `is_agent`
plus `author: {did, is_agent}` (`authorOf`). `author.is_agent` is true only for
an agent item whose stored `authorDid` equals `slot.agentDid`.

Client at f561fcffd:
- `src/features/communityAgent/labelRule.ts:36-40`: it requires
  `community.agent.is_agent === true`, then `isCommunityAgentAuthor`
  (`author.is_agent === true` and `author.did === agent.did`, both non-empty).
  agentSponsor is optional and only supplies `sponsorHandle`.
- `src/screens/Community/descriptor.ts:111-117` (agent card, `agentDid`): if
  the `agent` key is present, it alone decides. A null agent, or one where
  `is_agent` is not `true`, means no agent. The config fallback is used only
  when the key is absent.
- Downstream checks inherit this gated `agentDid`: the roster agent row
  (`roster.ts:87-88` also needs `entry.is_agent`), the posts list
  (`MemberPostRow` -> `isCommunityAgentAuthor`), the grant row and the grant
  query (`queries.ts:150`).
- Note: at 17586054, door.js **does** send `agentSponsor {did, handle}` on
  member responses whenever the flag is on and the slot is valid
  (`sponsorView`). The Dev capture (`dev-runtime-2026-10-30.json`) does not, so
  the deployed Dev build is older than f498e0dc. The client handles both
  shapes: with the sponsor it shows the handle, without it the label still
  shows. The tests cover both (door.json with agentSponsor, plus
  `doorCommunityAsDeployed()` / `deployedHome()` without it).
- Removing the "agent without sponsor" operator warning is correct. door.js
  answers `agent: null` + `agent_error` for an agent with no sponsor, so the
  old state cannot happen any more.

## HIGH 2 (not on the integration head): FIXED

`git merge-base origin/communities/integration f561fcffd` = `03ea8768d` =
the integration head. The PR fast-forwards, and `refs/pull/21/merge` exists.

No polish 1 or 2 behaviour was lost (polish 1-3 and 5-7 all checked):
- `git diff 03ea8768d f561fcffd` does not touch MembersSection, MemberPostRow,
  PostsSection, roster.ts, queries.ts, AgentGrantSection or
  CommunityComposerEntry. The only change to AgentCard.tsx is that the
  door-less `agent.scope` override is gone.
- I diffed the test names in CommunityScreen, communityAgent, descriptor and
  membersPost (integration vs head). Every integration-era test is still
  there. The renamed ones are reworded for the door shape: no agent / agent
  null, a null sponsor handle never shows the DID or community name, and no
  `viewer_is_admin` means no launch control. The new ones cover the deployed
  door shape. The compose-entry, Members tab, grant row and refetch-after-launch
  tests are unchanged and pass.

## Findings

| # | Sev | file:line | Failure scenario | One-line fix |
|---|-----|-----------|------------------|--------------|
| 1 | LOW | `src/features/communityAgent/labelRule.ts:16`, `types.ts:19`, `descriptor.ts:19,107` | These comments say "the deployed door does not send agentSponsor". door.js at 17586054 does send it on member responses. Once Dev deploys 17586054 the comments are wrong and could mislead a later change back to sponsor gating. The code is correct. | Say "older deployed builds (the Dev capture) omit agentSponsor; 17586054+ sends it on member responses; it is never required". |
| 2 | LOW | `src/lib/api/feed/communities.ts:113,202` (`communityConfigAgentDid`) | The feed and listMyCommunities read `agent.did` without checking `agent.is_agent === true`. The descriptor and labelRule do check it, so the rule is no longer the "one rule". It is harmless today: the door only ever sends `is_agent: true`, and `author.is_agent` is still required. | Have the descriptor and the feed use one `doorAgentDid(raw)` helper (the gated logic in descriptor.ts:111-117). |
| 3 | LOW | `src/screens/Community/descriptor.ts:136` | `scope: str(raw.agentScope)` is now dead: AgentCard no longer reads `agent.scope`, and the door sends no scope. | Drop `scope` from `CommunityAgent` and the descriptor. |
| 4 | LOW | process | The spec names branch `coord/type-drift-fix-2-agent-label-fro-ccacde3b` (76e666079: old base, sponsor-gated). If someone merges that branch instead of PR #21, both HIGHs come back. | Merge PR #21 only (head f561fcffd). A human should retire the old branch. |

Not checked: I did not regenerate door.json from 17586054. Its generator needs
a runtime checkout, and the clone was blocked. door.json (from eabfbcdd/bfd5a63c)
matches the 17586054 `publicConfig`/`publicItem`/`sponsorView` shapes as I
read them by eye.

## What I ran (worktree detached at f561fcffd)

| Command | Result |
|---------|--------|
| `pnpm install --frozen-lockfile` | Packages installed. The postinstall `intl:compile-if-needed` failed because the cmd shell has no `pnpm` on PATH, so I did not run the intl compile. Jest did not need it. |
| `tsc --noEmit -p tsconfig.communities.json` (first half of `pnpm test`) | exit 0 |
| `NODE_ENV=test jest --forceExit --testTimeout=20000 src/features/communityAgent src/features/communities src/screens/Community src/lib/communities src/lib/api/feed src/lib/agent-runtime src/view/com/composer/state` | **56 suites passed, 0 failed; 943 tests passed, 0 failed** |
| `eslint --quiet` on every .ts/.tsx changed between 03ea8768d and f561fcffd | exit 0, no output |

I did not run the full repo-wide `pnpm test`. I called tsc, jest and eslint
directly because the pnpm shim cannot run nested pnpm under the cmd shell.
