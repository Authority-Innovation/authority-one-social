# Communities W1-T2: lexicon tracking and codegen – report

- Task: `98e02647`
- Branch: `coord/communities-w1-t2-lexicon-codege-98e02647` (loop-assigned; spec named `communities/w1-lexicon-codegen`)
- Base: `569b3b240` (fix/ao-uiscene-lifecycle). The worktree started on `main` @ `571924785`, 7 commits behind the base with 0 ahead, so it was fast-forwarded.
- Draft PR only. Not merged, not marked ready.

## What changed

1. **Lexicons** under `lexicons/com/authorityone/`:
   - `group/`: ban, defs, getGroup, getMembers, getMemberships, getTimeline, invite, membership, post, profile, searchGroups (11 files). `err.txt` not carried.
   - `community/config.json`: new DRAFT record (`key: literal:self`). Required: `community` (strongRef), `tier` (`#public|#members|#paid`), `consentVersion` (integer). Optional: `listing` (`#listed|#unlisted`), `theme` {primary, accent, background, logo blob, icon blob, wordmark}, `brand` {displayName, legalName, supportUrl, termsUrl, privacyUrl}, `agent` (did), `agentSponsor` (did), `moderation` {labelers[], reportTo, rulesUrl}, `ageNotice`. Description starts `["draft": true]`. No lexicon for members-only posts.
   - `README.md`: codegen usage and the deviations below.
2. **Codegen**: `@atproto/lex-cli@0.10.16` devDependency. `pnpm lexgen` (`node scripts/lexgen.mjs`) regenerates `src/lib/lexicon/generated` (committed). `pnpm lexgen:check` regenerates into a temp dir and fails on drift.
   - Referenced `app.bsky.*` / `com.atproto.*` defs become type-only shims re-exporting from `@atproto/api`. Those lexicons are not vendored.
   - lex-cli's `index.ts` (a full `XrpcClient` with createRecord/putRecord helpers) is replaced with a types-only barrel. No new runtime client or write path.
   - The generated directory is excluded from eslint and prettier.
3. **group.ts**: hand-written types (old :49-105) replaced by aliases to the generated defs, under the same names: `GroupVisibility`, `AdmissionPolicy`, `PostingPolicy`, `GroupRole`, `MembershipStatus`, `GroupView`, `MemberView`. Both `TODO(codegen)` comments removed. The `createRecord` payload for group.profile is now typed `ComAuthorityoneGroupProfile.Record`. This is a type-only change. All imports from generated code are type imports, which babel erases, so reads and writes go out exactly as before.

## Deviations (assumption – orchestrator questions 7801b24f / 53b1bbdb unanswered at report time)

Two of the inlined spike lexicons are invalid, and `@atproto/lexicon` rejects them. lex-cli silently dropped `defs.json`, so no GroupView type could be generated. That makes "byte-identical" and "codegen" incompatible for these two files. I applied fixes that leave the JSON on the wire unchanged:

| File | Problem | Fix |
| --- | --- | --- |
| `group/defs.json` | `groupViewBasic.required` has `creator`, but there is no such property | added `creator` (did), same as in groupView |
| `group/getMemberships.json` | output items are an inline `object` (only ref/union are allowed) | new `group.defs#membershipView`, referenced from the output |

The other 9 group files are byte-identical to the spike, and a test pins their sha256. The original hashes of the 2 changed files are in `lexicons/README.md`.

## Tests

| | Suites | Tests |
| --- | --- | --- |
| Before (569b3b240) | 2 failed, 126 passed, 128 total | 1 failed, 28 todo, 1421 passed, 1450 total |
| After (this branch) | 2 failed, 127 passed, 129 total | 1 failed, 28 todo, 1439 passed, 1468 total |

- New: `src/lib/lexicon/__tests__/lexicon.test.ts`, 18 tests. They cover:
  - the codegen drift check;
  - lexicon ids matching file paths;
  - every `GROUP_*` NSID and `get*` method in group.ts having a lexicon file;
  - the 9 byte-identity pins;
  - the 2 documented fixes;
  - the community.config shape and the absence of a members-only post lexicon;
  - compile-time `Equals<>` checks that each old exported name equals the generated type.
- The 2 failing suites fail identically before and after, and neither is touched by this branch: `plugins/uiSceneLifecycle/__tests__/withUISceneLifecycle.test.js` (AppDelegate template match) and `src/lib/contextEngine/__tests__/noBackgroundLocationShipped.test.ts`.
- `pnpm typecheck`: green before and after.
- `pnpm lint`: 51 errors, all in files this branch does not touch (supabase, AgentChat, color-mode). There are 0 in touched files. I did not run lint on the base.
- I verified that `pnpm lexgen:check` exits 1 after a hand edit to a generated file.

## Not done / not in scope

- No UI, no runtime calls, no flags (nothing runtime was added, so there is nothing to flag).
- `wrangler` and `check:bundle` are deny-listed and were not run. No deploy, no PDS writes, no EAS/TestFlight.
- The generated `validate*` helpers cannot resolve the shimmed external lexicons at runtime. Nothing calls them.

## Open questions

1. Accept the two lexicon fixes? They should go back to the spike's source as well.
2. `useGroupMembersQuery` types the getMembers `group` as `GroupView`, but the lexicon says `groupViewBasic`. Left alone because it is out of scope (type-only fix available via `ComAuthorityoneGroupGetMembers.OutputSchema`).
3. community.config choices I made: `wordmark` is text (only logo/icon were specified as blobs); `ageNotice` is text; `reportTo` is a DID; `consentVersion` has no minimum; colors are free strings of at most 32 chars.

## Environment notes

pnpm is not on PATH here. I ran pnpm 11.5.2 from the npx cache with a PATH shim and set `pnpm_config_script_shell` to Git Bash, because the `NODE_ENV=test jest` script fails under cmd. Node is v24.14.0, below the engines' `>=24.15.0`, which produced warnings only.
