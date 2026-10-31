# Review: 1550eefa Communities W1-T3 composer no-PDS-write guard

- Review task: `a01a5acd` (REVIEW ONLY, Opus, fresh)
- Reviewed: `origin/coord/communities-w1-t3-composer-no-pd-1550eefa`
  - `f0a4c68d8` feat(communities): composer no-PDS-write guard for members/paid targets
  - `cc80918e1` docs: W1-T3 report (`docs/communities/W1-T3-composer-guard-report.md`)
- Also checked against: `origin/communities/integration` (2026-10-31) and `main` (`571924785`)

## Verdict

**NOT RELEVANT as a standalone landing.** The branch is not in `main`, but it is
already an ancestor of `origin/communities/integration`, along with 10 other
communities branches. On integration the guard has since been hardened, and
every gap below is closed there. Do not merge this branch to `main` on its own.
It lands through `communities/integration`. Reviewed on its own merits, the
commit would be **FIX FIRST** (see H1 and H2).

## Where the record stands

- `main` (`571924785`) has no `src/lib/communities/composerTarget.ts`.
- The branch is based on `569b3b240` (the `fix/ao-uiscene-lifecycle` build line),
  not on `main`. `git log main..branch` shows 7 unrelated iOS, network and
  context-engine commits under the 2 W1-T3 commits.
- `f0a4c68d8` is an ancestor of: `communities/integration`,
  `communities/w2-composer-target`, `coord/build41-community-home-fixes`,
  `coord/one-dev-39-polish-5-7-refetch-af-e3e0d205`, and others.
- On integration the guard is now called from `lib/api/index.ts`,
  `drafts/state/queries.ts` (save/delete), `state/video.ts`, `state/writeGate.ts`,
  `state/submit.ts`, `DraftsListDialog.tsx`, and through `assertComposerPdsWrite`
  at the human video `uploadBlob` in `Composer.tsx`.

## Findings (against `f0a4c68d8`)

Nothing sets `target` in this commit, so none of these findings can trigger at
runtime from this commit alone. They matter as soon as a caller sets a target,
and W2 does set one.

### BLOCKER

None.

### HIGH

**H1. Merging the branch as-is would pull 7 unrelated build-line commits into `main`.**
- Where: branch base `569b3b240` (not `main`)
- Failure: if someone merges `coord/communities-w1-t3-composer-no-pd-1550eefa` to
  `main`, the UIScene lifecycle, network and contextEngine changes and the
  build 34-36 bumps all land with it, unreviewed in that context.
- Fix: do not merge this branch. Land it through `communities/integration`, or
  cherry-pick `f0a4c68d8` alone.

**H2. A public-tier community target falls through to a plain profile post.**
- Where: `src/lib/communities/composerTarget.ts:76-77` (`case 'public': return {allowed: true}`),
  `src/view/com/composer/state/submit.ts:44-52`
- Failure: when a caller opens the composer with
  `{kind:'community', tier:'public'}`, `apilib.post` writes an ordinary
  `app.bsky.feed.post` with no community binding. The user thinks they posted to
  the community, but the post only appears on their own profile, publicly. This
  is a silent mis-route, not a refusal.
- Fix: refuse public until a binding exists (`public-community-not-available`).
  Integration now does this (`composerTarget.ts:133-137` there).

### MEDIUM

**M1. The guard only runs in the UI layer. The data-layer write paths are unguarded.**
- Where: `src/view/com/composer/drafts/state/queries.ts:118-165` (`useSaveDraftMutation`
  calls `createDraft`/`updateDraft` directly), `src/view/com/composer/state/video.ts:296`
  (`uploadVideo`), and `Composer.tsx:1246-1260` (the human video branch calls
  `agent.uploadBlob` and `apilib.post` directly, not `submitComposerThread`)
- Failure: the only protection is the `pdsWriteRefusal` early return in
  `Composer.tsx` callbacks. A new caller, such as DraftsButton, a restored draft
  video, or a community composer that skips `onPressPublish`'s top check, writes
  members content to the PDS. Draft delete (`deleteDraft`) is also not covered.
- Fix: assert the target inside each write function (`assertComposerPdsWrite`).
  Integration now does this.

**M2. A reply defaults to the profile target, so a reply to members content writes to the PDS.**
- Where: `Composer.tsx:299` (`target = DEFAULT_COMPOSER_TARGET`) together with
  `replyTo` (`Composer.tsx:1370`)
- Failure: a reply opened from a members-tier thread with no explicit `target`
  passes the guard as `profile`. `apilib.post` then writes a reply record to the
  PDS that references the walled-store parent.
- Fix: derive the target from the parent and refuse when the parent's target is
  unknown. Integration's `resolveTarget` does this (`unknown-parent-target`).

### LOW

**L1. `undefined` means "profile", so a caller that forgets to pass the target fails open.**
- Where: `composerTarget.ts:65` (default parameter)
- Failure: any helper that does not forward `target` is treated as a profile
  write, which is fail-open for a guard documented as fail-closed.
- Fix: use a `null` sentinel for an unresolved target and refuse it. Integration
  now uses `null` (`Composer.tsx:340` there). Keep `undefined` only for
  pre-communities callers.

**L2. Defensive dead branch in the publish path.**
- Where: `Composer.tsx:1374-1379`
- Failure: none. The comment says the branch is unreachable while the early
  return holds, so it is not covered by tests.
- Fix: none needed. Optionally add a unit test that renders with the early
  return bypassed.

**L3. The video refusal shows a Toast; every other refusal uses the inline error.**
- Where: `Composer.tsx:552-555`
- Failure: the UX is inconsistent only. No write happens.
- Fix: use `setError(pdsWriteRefusal)` for consistency.

## What was good

- The guard is pure and typed, and it fails closed on null, strings, unknown
  `kind`, unknown `tier`, and a missing `tier`.
- The early return in `onPressPublish` comes before the post-as-agent, video and
  normal branches, so no publish path in the commit is reachable for
  members/paid.
- `submit.test.ts` asserts zero `createRecord`/`putRecord`/`uploadBlob`/
  `applyWrites`/draft calls for members and paid, with an image attached, and
  checks profile against a positive control.
- The report correctly notes that the base composer uses `applyWrites`, not
  `createRecord`.

## What I ran

- `git log`, `git show`, `git merge-base --is-ancestor` and `git grep` across
  `main`, the task branch and every remote communities branch, plus a static
  read of the commit's diff and the affected call sites (`Composer.tsx`,
  `drafts/state/queries.ts`, `state/video.ts`).
- **Tests not run.** This worktree has no `node_modules` and `pnpm` is not on
  PATH. Installing would mean fetching from the registry, which is off this
  machine, so I did not. The original W1-T3 report says the suite passed apart
  from 3 suites that also failed on the base. I have not independently verified
  that.
