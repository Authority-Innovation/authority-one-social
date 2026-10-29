# Group post binding build (task a54c058e)

Branch: `coord/group-post-binding-build-com-aut-a54c058e`, base
`communities/integration` at `e743c2cfd`. Spec:
`docs/design/group-post-binding.md`. Not merged to integration. No flag
changed (no `eas.json` or env file touched).

## Commits

- `57cc39258` feat(communities): group.post binding write path for public posts (dark)
- `a6e202687` test(communities): public writes without a binding are refused; lint/format
- (this report) docs commit on top

## What was built

1. **Binding write** (`src/lib/api/index.ts`, `apilib.post` option `binding`).
   For a public-tier community post, the single `applyWrites` that writes each
   `app.bsky.feed.post` also writes a `com.authorityone.group.post` create with
   the post's own rkey, `subject = {post URI, locally computed CID}`, and
   `group` = the caller-supplied group ref. Every post of a thread gets its own
   binding in the same batch (replies bind, D1). Builder:
   `buildGroupPostBindingWrite` in `src/lib/communities/groupPostBinding.ts`.
2. **Refuse before any write.** `binding` is checked first in `apilib.post`,
   before the reply lookup, link/embed resolution, blob upload or
   `applyWrites`. Members, paid, profile, missing group, non-group-profile
   group URI, empty group CID, null: `GroupPostBindingRefusedError`, zero calls.
   A binding combined with the runtime `videoEmbed` is also refused (the design
   does not cover it; fail closed rather than guess).
3. **CID check.** After `applyWrites`, every post's computed CID is compared
   with `results[i].cid` (and `results[i].uri`) of the matching write. Any
   difference, or missing results, throws `GroupPostCidMismatchError` and logs.
4. **Resolver unchanged.** `resolveTarget` still refuses public
   (`public-community-not-available`); `submitComposerThread` and
   `gateComposerWrite` still refuse public too. The bound path is reachable only
   by calling `apilib.post` with `binding` directly, which only tests do.
5. **Guard.** `guardComposerPdsWrite(target, {binding})` now refuses a public
   target (`public-community-not-available`) unless a well-formed binding for
   that same community id is passed. Only the bound `apilib.post` passes one,
   so it is the only public PDS write path. Drafts, blob upload, video upload
   and any unbound write for a public target are refused. A binding never
   unlocks members/paid.

## Tests

- `src/lib/api/__tests__/post.groupBinding.test.ts` (15): binding in the same
  batch (single post and 3-post thread with threadgate), same rkey, subject CID
  equals an independently recomputed CID and the next post's `reply.parent`;
  exactly one `applyWrites`, no `createRecord`; members/paid/malformed refused
  with zero network calls; CID mismatch fails (and no compensating
  delete/create); missing results fail; video+binding refused; client-side
  validation failure sends nothing; unbound post unchanged (`validate: true`,
  no binding write); resolver still refuses public (explicit and locked).
- `src/lib/communities/__tests__/groupPostBinding.test.ts` (16): builder shape
  and lexicon validity, inline lexicon identical to
  `lexicons/com/authorityone/group/post.json`, well-formed check table,
  `findCidMismatches` table.
- `src/lib/communities/__tests__/composerTarget.test.ts`: public without a
  binding refused for every `GUARDED_PDS_WRITES` entry; with a matching binding
  allowed; binding for another community / members / no group / no CID refused.
- Updated: `queries.guard.test.tsx` and `video.guard.test.ts` move public from
  "allowed" to "refused" (consequence of item 5).

Jest (run, all green):

| Path | Suites | Tests |
| --- | --- | --- |
| `src/lib/communities` | 4 passed | 103 passed |
| `src/view/com/composer` | 5 passed | 68 passed |
| `src/features/communities` | 6 passed | 90 passed |
| `src/lib/api` (extra) | 4 passed | 35 passed |

Lint (`eslint --quiet`) on every changed file: clean.

## OPEN items built around (not decided)

- **Q1 group.cid.** Kept the existing lexicon (`group` is a strongRef), so the
  binding carries `{uri, cid}`. The caller supplies both; no `getGroup` fetch is
  built. No lexicon change. Marked in `groupPostBinding.ts` (`ResolvedGroupRef`).
- **Q2 rkey.** Built as the doc states: binding rkey = post rkey.
- **Q7 validate.** Built option (a), the doc's recommended default: the bound
  batch goes with `validate: false`, and every `app.bsky.feed.post` and binding
  record is validated client-side first (refuse to send on failure). Not
  verified against a real PDS. Marked in `apilib.post` and
  `groupPostBindingLexicon.ts`.
- **Q6 / D3 deletes.** No delete change. On CID mismatch there is no
  compensating action: the batch stays committed; error thrown and logged
  only. Marked at the CID check and on `GroupPostCidMismatchError`.
- **Q4 non-member replies.** No membership pre-check built. Marked in
  `apilib.post`.
- **D2 / Q11 edits.** Nothing built (no edit feature).
- **Q5 feedPostTarget.** Unchanged; still maps every feed post to profile.
- **Design section 5 item 3** (are drafts/blobs/video for public intended?).
  Not decided; they are refused for public now because they carry no binding
  (the spec's guard rule). Marked in the guard's doc comment. Note: this means
  a future bound public post with images has no allowed blob-upload path yet
  (the Composer's `uploadBlob` guard refuses public) - this must be decided
  before the resolver is flipped.
- Flag check in the guard (section 5 item 1) and `'pds-community'` route
  (section 4) are NOT built: the resolver must not be flipped in this task.

## Not run / caveats

- **No real-PDS integration test** (design test 6 second half). The computed vs
  returned CID check is tested against a mock; under jest `@ipld/dag-cbor` is
  stubbed with a JSON encoder (as in the existing video test), so the real
  DAG-CBOR equality is not exercised. Needs a local dev PDS run.
- `pnpm` is not on PATH here; scripts were run through `node_modules/.bin`
  directly (`jest`, `eslint`, `tsgo`). `node_modules` is a symlink to the
  `03067be4` worktree's install (identical `package.json` / `pnpm-lock.yaml`).
- `tsgo --project tsconfig.check.json`: 136 errors, **none in files changed
  here**. They are pre-existing on the base (`communitiesClient` no longer
  exports `CommunityPost`, `Community` shape drift, `src/locale/i18n*.ts`,
  `src/screens/Community/*`). Not fixed (out of scope).
- `src/lib/communities/groupPostBindingLexicon.ts` imports `@atproto/lexicon`
  (not a direct dependency; hoisted from `@atproto/api`, already used by the
  generated lexicon code) with an eslint disable. It carries the binding
  schema inline because the generated `lexicons.ts` (`./util.js` imports) does
  not resolve under jest; a test pins it to the JSON. Adding
  `@atproto/lexicon` to `package.json` would remove the disable.
- Tests that need real CIDs unmock the repo-wide `__mocks__/multiformats`
  stubs locally.
