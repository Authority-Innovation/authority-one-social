# Review 907498fd: backlog record 55f1f868 (ccacde3b HIGH 1 and HIGH 2 fixes)

Review only. Nothing was committed to, merged into or pushed to any branch
but this review branch (`coord/review-only-backlog-opus-lowest-907498fd`).

## What was reviewed

- The spec names `coord/type-drift-fix-2-agent-label-fro-ccacde3b` (tip
  76e666079). That branch is the ccacde3b work **before** the 55f1f868 fix:
  it still gates the label on `agentSponsor`.
- The 55f1f868 work itself is on
  `origin/coord/fix-ccacde3b-high-1-gate-agent-l-55f1f868`, tip f561fcffd.
  It is the ccacde3b branch rebased onto `communities/integration`
  03ea8768d, plus:
  - b0d370957: label and card gate on `agent {did, is_agent}`
  - 0c065e7f8: tests on the deployed door shape
  - f561fcffd: report `docs/reports/task-55f1f868-gate-agent-label-on-door-agent-rebase.md`

  This review covers that branch. I could not read the bus task body for
  55f1f868 (no bus-read tool in this session), so the task's intent comes
  from that report and the commit messages.

## Verdict

**CAN LAND** (as a draft into `communities/integration`). HIGH 1 is fixed:
`agentSponsor` no longer gates the label or the card. HIGH 2 is fixed: the
branch is rebased onto 03ea8768d, and the integration polish and Members tab
tests still pass. One MEDIUM follow-up below. It is not a blocker.

## Findings

No BLOCKER. No HIGH.

### MEDIUM 1: the feed path does not apply the new `agent.is_agent` gate

- Where: `src/features/communities/agentLabel.ts:47-57`
  (`communityConfigAgentDid`), used by `src/lib/api/feed/communities.ts:113`
  and `:202`. Compare `src/screens/Community/descriptor.ts:107-117` and
  `src/features/communityAgent/labelRule.ts:36-40`.
- Failure scenario: the door returns `agent: {did: X, is_agent: false}`
  (type-valid per `DoorCommunityAgent`, and labelRule.test.ts and
  descriptor.test.ts both treat it as "no agent"). The thread view and the
  community home then show X's post as a member. The home/members feed still
  takes `agent.did` through `communityConfigAgentDid` and marks the same post
  as the agent, because `membersPost.ts:96` `isCommunityAgentAuthor` only
  checks the author. Precedence also differs: the feed prefers `config.agent`
  over `agent.did`, and the descriptor now prefers `agent.did`. The report
  calls this "one shared rule", but the gate now lives in three places.
  Today's real impact is small. The deployed door sends `null` or
  `is_agent: true`, and it sends no `config`.
- Fix: move the descriptor's rule (if the response has an `agent` key, only
  `agent.is_agent === true` gives a DID) into `communityConfigAgentDid`. Use
  it from the descriptor and labelRule, and add one feed test with
  `is_agent: false`.

### LOW 1: the AgentCard doc comment is stale

- Where: `src/screens/Community/components/AgentCard.tsx:12-19`.
- It says the card is "Rendered whenever the community names an agent DID"
  and that the label "comes from the config". After b0d370957 the card shows
  only for `agent {did, is_agent: true}`. A future editor could reintroduce
  the config-DID gate.
- Fix: reword the comment to match `descriptor.ts:18-21`.

### LOW 2: the positive label path is not proven on real deployed output

- Where: `src/lib/communities/__fixtures__/door/index.ts`
  (`doorCommunityAsDeployed`) and the labelRule/communityAgent tests that
  use it.
- The Dev capture has no agent-authored item. The "label shows" tests pair
  door.json's agent item (runtime eabfbcdd) with a community that has
  `agentSponsor` removed by hand. door.json was not regenerated against
  runtime 1758605, as the 55f1f868 report says (orchestrator qid 333e5e3b,
  unanswered). If 1758605 changed the item `author` shape, these tests would
  not catch it.
- Fix: regenerate door.json from 1758605, or capture one real agent reply on
  Dev, and add it to the fixture.

### LOW 3: the descriptor's config fallback is dead against the door

- Where: `src/screens/Community/descriptor.ts:112-117`.
- The door never sends `config` or a top-level `agentDid` (`DoorCommunity`
  in `doorContract.ts:45-66`). With the agent flag off (no `agent` key), the
  fallback always returns undefined. It is harmless, but it keeps an "older
  shapes" path that no current runtime sends.
- Fix: drop the fallback, or name the runtime that still needs it in the
  comment.

### Note (not a defect)

`AgentGrantSection` (line 36) and the Members-tab agent label (`roster.ts:88`)
now disappear when the door sends `agent: null`. That follows from the new
gate, and I think it is intended, but the 55f1f868 report doesn't say so.

## What I ran

On a detached checkout of f561fcffd inside this worktree. Dependencies came
from `npx pnpm@11.5.2 --dir <worktree> install --frozen-lockfile --offline`.
pnpm's install touched `package.json` and I reverted it.

| Run | Result |
| --- | --- |
| `jest src/lib/communities src/features/communities src/features/communityAgent src/screens/Community src/lib/agent-runtime src/lib/api/feed src/view/com/composer/state` | 56 suites, 943 tests, all passed |
| `pnpm typecheck` (tsgo, whole app) | clean |
| `tsc --noEmit -p tsconfig.communities.json` | clean |
| `eslint src/features/communityAgent src/features/communities src/screens/Community src/lib/communities` | 0 errors, 11 warnings (pre-existing `import()` type warnings in tests) |
| full `jest` | 182 of 185 suites passed. 3 failed: `plugins/uiSceneLifecycle`, `src/lib/lexicon/__tests__/lexicon.test.ts` (sha of a JSON file), `src/lib/contextEngine/__tests__/noBackgroundLocationShipped.test.ts` (`'...return\n'` match). None of these paths differ between 03ea8768d and f561fcffd (`git diff --stat` is empty). They look like Windows CRLF checkout issues, not this change. I did not confirm that on 03ea8768d itself. |

Not run: anything on a device or simulator, or against a live runtime.
