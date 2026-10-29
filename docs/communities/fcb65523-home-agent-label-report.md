# fcb65523 - Community home: agent label from author.did

Base: `communities/integration` at 724e3ce45. Branch:
`coord/community-home-agent-label-from-fcb65523`. Feature commit: 4e6cebd57.
No merge to integration, no flag change.

## Diff stat (4e6cebd57)

```
 .../communities/__tests__/membersPost.test.ts      | 82 ++++++++++++++++++++++
 src/features/communities/membersPost.ts            | 38 ++++++++--
 .../Community/__tests__/CommunityScreen.test.tsx   | 79 ++++++++++++++++++---
 src/screens/Community/__tests__/descriptor.test.ts | 27 +++++++
 src/screens/Community/components/PostsSection.tsx  | 26 ++++---
 src/screens/Community/descriptor.ts                |  9 +++
 6 files changed, 239 insertions(+), 22 deletions(-)
```

## Matching rule

`isCommunityAgentAuthor(author, agentDid)` in
`src/features/communities/membersPost.ts`. Both the home (`PostsSection`) and
`membersPostToFeedViewPost` use it.

1. If `author` is missing or is not an object, the item is a member (no label).
2. If `author.is_agent !== true` (strictly the boolean), the item is a member.
3. If the community's agent DID is known (non-empty after trim), the item is
   the agent only when `author.did`, trimmed, equals it. A different DID, or
   no DID at all, means a member.
4. If no agent DID is known, `is_agent === true` alone decides. This is the
   N1 behaviour the home already had.

The display name and handle are never read.

Where the agent DID comes from: a new `CommunityDescriptor.agentDid`, taken
from `config.agent`, then `raw.agentDid`, then the door's own
`agent: {did, is_agent}` slot. It is **not** gated on `agentSponsor`; the
sponsor-gated `descriptor.agent` (agent card) is unchanged. Sponsor and admin
gating stay out of this change, as the spec asked.

`membersPostToFeedViewPost` takes an optional fourth argument, `agentDid`. The
combined feed (`src/lib/api/feed/communities.ts`) does not pass it yet, because
`CommunityFeedSource` carries no agent DID. So that path still uses rule 4
(is_agent alone). The real `author.did` is never put in the synthetic view.

## Behaviour notes and assumptions

- **Author absent:** renders as a member row with no label, the same as
  `membersPost.ts` did before. One difference: `PostsSection` used to read
  `post.author.is_agent` without a guard, so a missing author would have
  thrown. It now reads defensively (`post.author?.displayName`/`avatar`).
- **Changed behaviour (intended by the spec):** when the config names an agent
  DID, an item with `is_agent: true` but no `author.did` no longer gets the
  label. The old test "labels a post as the agent from is_agent alone, with no
  author DID" was replaced. The fixture's agent item now carries
  `did: AGENT_DID`.

## Tests

New/changed cases:
- CommunityScreen: the item with `author.did === AGENT_DID` gets the label;
  member items do not (including the "Steve Agent" name); a spoofed `Steve`
  with `is_agent: true` and a different DID gets no label, and neither does
  `is_agent: true` with no DID; an item with no author renders as a member row
  with no label. The existing "config names no agent" case still gets the
  label from is_agent alone.
- membersPost: DID match/spoof through `membersPostToFeedViewPost` (and the
  real DID is not in the view); a missing author is a member; unit tests for
  `isCommunityAgentAuthor`; the read allow-list now includes `author.did`.
- descriptor: `agentDid` is set with no sponsor, from config, `agentDid`, or
  the door `agent.did`, with config taking precedence.

Results (run locally with jest via `pnpm test`):
- `src/screens/Community src/features/communities`: 11 suites, 159 tests,
  all passed (baseline before the change: 11 suites, 148 tests).
- `src/lib/api/feed src/features/communityAgent`: 2 suites, 28 tests, all
  passed.

## Typecheck (pre-existing breakage, not fixed here)

Typecheck fails on the base already. The home code and its tests still use the
pre-W1-T8 client shape (`CommunityPost`, `page.posts`, `Community.role`, and so
on), which `communitiesClient.ts` no longer exports. Comparing `tsc --noEmit`
before and after this commit, the only new errors are two more of the existing
`'posts' does not exist in type 'CommunityTimelinePage'` errors, from the new
test mocks. They follow the file's existing fixture shape. My source changes
add no new type errors. Moving the home to `CommunityItem` (`items`, `text`,
`authorId`, `author`) is a separate piece of work.

## Running tests in a fresh worktree

`corepack pnpm install --frozen-lockfile` (the intl postinstall fails without a
global pnpm, which is fine), then
`corepack pnpm --config.verify-deps-before-run=false "--config.script-shell=C:\Program Files\Git\bin\bash.exe" test <paths>`.
