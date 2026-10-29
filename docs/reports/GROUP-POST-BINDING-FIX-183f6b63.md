# Group post binding fix pass (task 183f6b63)

Base: `coord/group-post-binding-build-com-aut-a54c058e` at `81b077ae9`.
Branch: `coord/binding-build-fix-validate-gate-183f6b63`. No merge to
integration, no flag change, no eas.json change. Still dark: the resolver
refuses public exactly as before.

## Commits

- `a4ad464e0` fix(communities): validate gate records in a bound batch;
  flag-gate the binding path (items 1, 3)
- `b424c48a6` fix(communities): group.cid optional in the binding (OPEN Q1,
  default a) (item 2)
- this report

## What changed

1. **Gate records validated (MEDIUM).** `validateBoundBatch`
   (`src/lib/api/index.ts`) now validates `app.bsky.feed.threadgate` and
   `app.bsky.feed.postgate` with the `@atproto/api` record validators, in
   addition to posts and bindings. Any collection without a validator is
   refused (fail closed), so the comment "every record is validated" is now
   true. Tests: an invalid postgate (`detachedEmbeddingUris: ['not a uri']`)
   is refused before `applyWrites`; a valid threadgate + postgate batch is sent.
2. **group.cid optional (MEDIUM), OPEN Q1 default (a).**
   `isWellFormedGroupPostBinding` accepts a group with no `cid`; a present cid
   must be a non-empty string. `buildGroupPostBindingWrite` writes
   `group: {uri}` when there is no cid, `{uri, cid}` otherwise. Q1 is marked
   OPEN on `ResolvedGroupRef` with both options listed. The post CID-mismatch
   check (computed post CID vs PDS result) is unchanged and always runs; it
   does not depend on the group cid. Tests: no-cid binding is well formed,
   writes the uri only, passes client-side validation, and is sent by
   `apilib.post`; an empty cid is still refused; the guard allows a no-cid
   binding.
3. **Flag gate.** `apilib.post` throws `GroupPostBindingDisabledError` when a
   binding is passed and `COMMUNITIES_ENABLED` (`EXPO_PUBLIC_COMMUNITIES_ENABLED`)
   is off, before reply lookup, link resolution, blob upload or any write.
   Unbound posts are unaffected. Tests for both.
4. **Left as documented (LOW):** CID-mismatch throw after commit (Q6/D3) and
   the public drafts/blobs/video refusal. Not changed.

## ASSUMPTION (orchestrator question b81021a1 unanswered after 300s)

The lexicon typed `group` as `com.atproto.repo.strongRef`, which requires
`cid`. Because the bound batch is validated client-side against that lexicon
(Q7), making cid optional in the validator/writer alone would have left every
no-cid binding refused by `validateBoundBatch`. I took option (A):

- `lexicons/com/authorityone/group/post.json`: `group` is now a local
  `#groupRef` object `{uri: at-uri (required), cid: cid (optional)}`. Every
  existing strongRef-shaped binding stays valid. Mirrored in
  `groupPostBindingLexicon.ts` (pinned-to-JSON test still passes); generated
  code regenerated with `node scripts/lexgen.mjs` (`--check` clean; only
  `lexicons.ts` and `types/com/authorityone/group/post.ts` change).
- Not taken: the doc's literal `group: at-uri` string (breaking shape change
  for existing records and the AppView), or no lexicon change (no-cid would
  stay unusable end to end).
- **Out of this repo:** the AppView indexer must accept a `group` without
  `cid` before a no-cid binding is indexed. Not checked here.

## Tests

`jest src/lib/api src/lib/communities src/view/com/composer`: **13 suites
passed, 216 tests passed, 0 failed.**

- `tsgo --project tsconfig.check.json`: 136 errors, the same pre-existing count
  as the base report; none in changed files.
- `eslint --quiet` on changed files: clean. `src/lib/api/feed/communities.ts`
  (not touched) shows 4 pre-existing `no-unsafe-*` errors.
- `pnpm` is not on PATH; tools run via `node_modules/.bin`. `node_modules` is
  a junction to the `03067be4` worktree install (identical `package.json` and
  `pnpm-lock.yaml`).
- No real-PDS test (unchanged caveat from the base report).
