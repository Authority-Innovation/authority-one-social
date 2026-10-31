# Review ef64fbb2: 98e02647 Communities W1-T2 lexicon + codegen

- Reviewer task: `ef64fbb2` (REVIEW ONLY, Opus)
- Record reviewed: bus task `98e02647`, branch `origin/coord/communities-w1-t2-lexicon-codege-98e02647`
  - commits `6ca3cd190`, `0c46029c1`, `97d49d43b`, `a91aa567a` (report), base `569b3b240`
- **Not on main.** `main` / `origin/main` = `571924785` and contains none of these commits. The work landed instead on `origin/communities/integration` and the 33 W2/agent-live branches built on it. I reviewed the record's own diff (`569b3b240..a91aa567a`) and then checked how it looks on `communities/integration` today.
- I could not read the original bus task body. This run has no bus-read tool, so I used the record's own report (`docs/communities/w1-t2-lexicon-codegen-report.md`) and AUTONOMOUS-LOG as its statement of intent.

## Verdict

**CAN LAND as authored.** The record's branch is self-consistent and its drift check passes. Before `communities/integration` goes to main, fix H-1 (a pin this record added is now red there). Decide M-1 before the first `community.config` record is written.

## HIGH

**H-1. The post.json byte-identity pin is red on `communities/integration`.**
- Location: `src/lib/lexicon/__tests__/lexicon.test.ts:113-116` on integration (same line on the record's branch).
- Failure scenario:
  - `b424c48a6`, "group.cid optional in the binding", changed `lexicons/com/authorityone/group/post.json` on integration. Its LF sha256 is now `79c0a46be3f8d8e635a5a69d17f9a98101cb9d865ab87042e46ee5b26f0a38e3`.
  - The test still pins `678fa536825a...` and says the file is "byte-identical to the spike copy", so `pnpm test` fails on integration.
  - None of the 33 branches that contain `b424c48a6` updated the pin. I grepped every one of them for the new hash.
  - `post.json` is also no longer the spike copy, so the README's "nine files are byte-identical" claim is false there as well.
- One-line fix: on integration, move `post` out of the `it.each` pin list and into the documented-deviation test plus the `lexicons/README.md` deviations table, the same way `defs`/`getMemberships` are handled.
- The root cause belongs to this record: sha pins on files that are meant to evolve break on the first intended edit and say nothing about why. Consider pinning only for the spike import and then dropping the pins.

## MEDIUM

**M-1. `community.config` is a per-repo singleton, but `group.profile` is keyed by `tid`.**
- Location: `lexicons/com/authorityone/community/config.json:7` (`"key": "literal:self"`) against `lexicons/com/authorityone/group/profile.json:8` (`"key": "tid"`).
- Failure scenario:
  - One repo can host several `group.profile` records, but it can hold only one `config/self`.
  - A second community in the same repo has nowhere to put its tier, consent version, theme or agent. Its `putRecord` overwrites the first community's config, and the `community` strongRef then silently points at the wrong group.
  - Changing the key after records exist means a migration.
- One-line fix: either key the config by the same rkey as the group profile (`"key": "any"`, with the rkey required to equal the profile rkey), or record in the lexicon description and README that each community has its own repo/DID, so only one profile per repo is allowed.

**M-2. The `community` strongRef pins a CID, so the config goes stale on every profile edit.**
- Location: `config.json:12-16`.
- Failure scenario: an admin edits the group name or avatar, which gives `group.profile` a new CID. Every existing config now references a superseded version. An AppView that verifies the CID either rejects the config or has to ignore the CID, and that makes it pointless.
- One-line fix: use a plain `at-uri` (`{"type":"string","format":"at-uri"}`) unless version pinning is actually wanted. If it is, say why in the description.

**M-3. The `consentVersion` type disagrees with its consumer.**
- Location: `config.json:56-59` declares `integer`. The W2-T9 join/consent client on integration treats it as a string: `SUPPORTED_CONSENT_VERSIONS = ['1']`, `join('btb', '1')` (see `docs/communities/W2-T9-join-consent-report.md:29,58`).
- Failure scenario: once the runtime returns the real record, `1` (number) is compared against `'1'` (string), so the consent copy is never found and join is refused. The other possibility is that the runtime stringifies it and no longer matches the lexicon.
- One-line fix: pick one type. Integer in the lexicon is fine, and the client then normalises with `String(v)`. Add a test on the config-to-join path.

**M-4. `tier`/`listing` duplicate `group.profile` `visibility`.**
- Location: `config.json:17-33` against `group/defs.json` (`visibility`: `#public|#unlisted|#visPrivate`).
- Failure scenario: a group with `visibility=#public` and a config with `tier=#members` (or `listing=#unlisted` against `visibility=#public`) makes two different statements about who can read it. Nothing says which one wins, and the AppView, the runtime and the client can each pick differently. That is an access-control ambiguity on the public/members boundary.
- One-line fix: state in both descriptions which field is authoritative (presumably config `tier`), and have the AppView reject or normalise conflicting pairs.

## LOW

- **L-1. The compile-time `Equals<>` checks are tautological.**
  - Location: `lexicon.test.ts:224-236`.
  - `group.ts` now defines `GroupView = ComAuthorityoneGroupDefs.GroupView` and so on, so these checks can never fail and do not prove that "callers do not change".
  - Fix: compare against a frozen copy of the old hand-written types, or delete the block.
- **L-2. The generated unions are now open (`| (string & {})`), where the old hand-written ones were closed.**
  - Location: `generated/types/com/authorityone/group/defs.ts:151-155` and the siblings.
  - Effect: any `switch`/`Record<GroupRole, ...>` exhaustiveness check over `GroupRole`/`MembershipStatus` silently stops being enforced. None exists on integration today; I grepped.
  - Fix: if exhaustiveness matters, add a `KnownGroupRole` that excludes `string & {}`.
- **L-3. Generated runtime modules import packages the app does not declare directly.**
  - The generated type modules import `@atproto/lexicon` at runtime, and that package is not a direct dependency in `package.json`.
  - Today every consumer uses `import {type ...}`, so babel erases the import. The first value import (for example `isGroupView`, or a token constant like `PUBLIC`) would depend on hoisting (`nodeLinker: hoisted`). It would also pull in `lexicons.ts`, whose `validate` cannot resolve the shimmed `app.bsky.*` refs, a limitation the record already reports.
  - Fix: add an eslint `no-restricted-imports` rule allowing only type imports from `#/lib/lexicon/generated`, or declare the dependency.
- **L-4. A shim's namespace name comes from whichever importer was scanned last.**
  - Location: `scripts/lexgen.mjs:106-118`.
  - `shims.set(target, {ns, members})` overwrites `ns` with the last importer's alias. lex-cli always uses the same PascalCase alias, so this is harmless today. It is fragile if that ever changes.
  - Fix: assert that `ns` matches the existing entry.
- **L-5. Open question 2 from the record is still open.** On the record's branch, `useGroupMembersQuery` types the getMembers `group` as `GroupView`, but the lexicon says `groupViewBasic`. `description`, `postingPolicy` and the others may then be typed as present when they are not. Fix: use `ComAuthorityoneGroupGetMembers.OutputSchema`.

## What is good

- The drift check is real. lex-cli failures and "Invalid lexicon" output are fatal, so a lexicon can no longer be silently dropped.
- The external shims keep the `app.bsky`/`com.atproto` types pinned to the app's `@atproto/api`.
- lex-cli's write-capable `XrpcClient` is replaced with a types-only barrel, so no new write path is added.
- `group.ts` is a type-only change.
- The two validity fixes to the spike lexicons are correct and documented.

## What I ran

- `git log`/`git diff`/`git show` over the record's branch, `main`, `origin/main` and `origin/communities/integration`.
- I extracted the record's branch with `git archive` into a temp dir, junctioned it to an existing worktree's `node_modules` (`@atproto/lex-cli` 0.10.16, the same version), and ran `node scripts/lexgen.mjs --check`. Result: "up to date", exit 0, 1.6 s.
- I did the same for `communities/integration`: lexgen `--check` is also up to date there.
- `sha256sum` of `post.json` on the record's branch matches the pin. On integration it does not (H-1).
- I did not run `pnpm test`, `pnpm typecheck` or `pnpm lint`: this worktree has no `node_modules`, and I did not install into shared trees. H-1 follows deterministically from the pinned hash, but I did not see the jest failure itself. The record reports typecheck green and the same 2 pre-existing suite failures before and after.
- Nothing was committed to, pushed to or deployed from any branch other than this review branch.
