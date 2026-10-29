# 03067be4 - Community home: agent label from author.did (replaces fcb65523)

Base: `communities/integration` at e03857569. Branch:
`coord/app-agent-label-from-author-did-03067be4`. No merge to integration, no
flag change.

Commits: cff5cf8c6 (feature + tests), 8fbb6da05 (import sort), plus this
report.

## Diff stat (e03857569..8fbb6da05)

```
 .../communities/__tests__/agentLabel.test.ts       |  61 +++++++++++
 src/features/communities/agentLabel.ts             |  29 ++++++
 .../Community/__tests__/CommunityScreen.test.tsx   | 111 +++++++++++++++------
 src/screens/Community/__tests__/descriptor.test.ts |  29 ++++++
 src/screens/Community/components/PostsSection.tsx  |  26 +++--
 src/screens/Community/descriptor.ts                |   9 +-
 6 files changed, 228 insertions(+), 37 deletions(-)
```

## Matching rule

`isCommunityAgentAuthor(author, agentDid)` in
`src/features/communities/agentLabel.ts`, used by `MemberPostRow` in
`src/screens/Community/components/PostsSection.tsx`.

The label is shown only when all of these hold:

1. `author` is an object.
2. `author.is_agent === true` (strictly the boolean).
3. `author.did` is a string that is non-empty after trimming.
4. The community's agent DID is non-empty, and the two trimmed DIDs are equal.

Everything else gets no label. That covers an old item (`did: null`), a
different DID, a missing author, and a community whose config names no agent.
The display name, handle and position are never read. Unlike fcb65523, there
is **no** fallback to `is_agent` alone when the config agent DID is unknown.

The community agent DID is a new `CommunityDescriptor.agentDid`. It comes from
`config.agent`, then `raw.agentDid`, then the door's `agent.did` slot. It is
not gated on `agentSponsor`. The sponsor-gated `descriptor.agent`, which drives
the agent card, is unchanged.

## Behaviour notes and assumptions

- **Author absent:** the row renders as a member row with no label. On base,
  `PostsSection` read `post.author.is_agent` without a guard, so a missing
  author would have thrown. The row now reads `post.author?.displayName` and
  `post.author?.avatar`. I took "today's behaviour" to mean a normal row with
  no label, which matches `membersPost.ts`. This is an assumption.
- **Changed behaviour (the spec asks for it):** an `is_agent: true` item with
  no DID, or in a community with no agent DID, no longer gets the label. Two old
  tests were replaced: "labels from is_agent alone, with no author DID" and
  "labels an is_agent post even when the config names no agent".
- **Out of scope, unchanged:** `membersPostToFeedViewPost` in the combined feed
  still uses `is_agent` alone (`src/features/communities/membersPost.ts`). The
  spec covers only the community home. `CommunityFeedSource` has no agent DID
  to match against yet.

## R3

R3 has not been merged on this base. `CommunityItem` in `communitiesClient.ts`
has no `author` field, and the home still uses the older `CommunityPost` and
`page.posts` shape. This change was tested **against the R3 contract only**,
using mocked `getTimeline` responses where `author: {did, is_agent}` is on each
item.

## Tests

Command: `corepack pnpm test src/screens/Community src/features/communities`
(with `--config.verify-deps-before-run=false` and the Git bash script-shell).
Result: **12 suites, 164 tests, all passed.** 1 snapshot passed.

New or changed cases:

- CommunityScreen: an item with a matching DID and `is_agent: true` gets the
  label. A member item gets none, and neither does a member named "Steve
  Agent". A spoofed "Steve" with `is_agent: true` and another DID gets none.
  Old items with `did: null` get none, with `is_agent` either false or true. An
  item with no author renders a member row with no label. A community whose
  config names no agent gives no label.
- agentLabel unit tests cover every branch of the rule.
- descriptor: `agentDid` is set without a sponsor, read from config,
  `agentDid` or the door `agent.did`. Config takes precedence.

## Lint and typecheck

I ran eslint on the changed files. `PostsSection.tsx` has 7
`no-unsafe-member-access` errors, and base has the same 7. They come from the
`CommunityPost` type, which `communitiesClient.ts` no longer exports. This
change adds no new lint errors. I did not run a full `pnpm typecheck`. The
fcb65523 report records that typecheck already fails on this base for the same
reason.
