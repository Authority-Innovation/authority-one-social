# Communities W1-T3: composer no-PDS-write guard – report

- Task: `1550eefa`
- Branch: `coord/communities-w1-t3-composer-no-pd-1550eefa` (loop-assigned; the
  spec's suggested name was `communities/w1-composer-guard`)
- Base: `569b3b240` (build line, `fix/ao-uiscene-lifecycle`). The worktree was
  created at `571924785` (main); it had no commits of its own, so it was reset to
  the stated base, the same as the sibling W1 branches.
- PR: draft, see report_result / PR list.

## What changed

| File | Change |
| --- | --- |
| `src/lib/communities/composerTarget.ts` | New. `ComposerTarget`, `DEFAULT_COMPOSER_TARGET = {kind: 'profile'}`, `GUARDED_PDS_WRITES`, and the pure guard `guardComposerPdsWrite(target)`. Returns `{allowed: true}` or a typed refusal `{allowed: false, reason, refusedWrites}`. Never throws. Fails closed on anything it does not recognise (`unknown-target`). |
| `src/view/com/composer/state/submit.ts` | New. `submitComposerThread()` – the composer's PDS publish path (`apilib.post`) with the guard in front. A refused target returns `{ok: false, refusal}` before the agent is touched. |
| `src/state/shell/composer/index.tsx` | `ComposerOpts.target?: ComposerTarget` (optional; default profile). |
| `src/view/shell/Composer{,.web,.ios}.tsx` | Pass `target` through to `ComposePost`. |
| `src/view/com/composer/Composer.tsx` | `target` prop (default profile). A refusal message is derived once per render. Guard points: top of `onPressPublish` (before the video, post-as-agent and normal branches), both save-draft paths, and `selectVideo` (bsky video upload). The normal publish branch now goes through `submitComposerThread`. |

A members/paid submit shows the inline composer error
“Posting to members-only communities isn’t available yet.” Nothing is sent.

## PDS write functions the guard covers

Corrected in the r2 fix pass (see below). The first version of this table said
none of these writes was reachable from the composer. That was wrong:
`deleteDraft` was reachable and unguarded, and so was the restore-draft-video
upload. Every write below IS reachable from the composer. For a `members` or
`paid` target, each one is refused at the guard points listed.

| Write | Where the composer reaches it | Guard points (UI / data layer) |
| --- | --- | --- |
| `com.atproto.repo.applyWrites` | `apilib.post` (every normal post / thread, incl. threadgate + postgate records); also the human video branch | `onPressPublish` top / `submitComposerThread` |
| `com.atproto.repo.uploadBlob` | image/GIF/video embeds in `apilib.post`; `agent.uploadBlob` in the human video branch | `onPressPublish` top / `submitComposerThread`, `assertComposerPdsWrite` before `agent.uploadBlob` |
| `com.atproto.repo.createRecord` | not used by the base composer (see note) | `onPressPublish` top |
| `com.atproto.repo.putRecord` | not used by the base composer | `onPressPublish` top |
| `app.bsky.draft.createDraft` / `updateDraft` | Save draft (`handleSaveDraft`; `saveCurrentDraft` via DraftsButton) | early returns in both / `useSaveDraftMutation({target})` |
| `app.bsky.draft.deleteDraft` | **Reachable.** DraftsButton (always in the toolbar for non-replies) -> DraftsListDialog -> DraftItem “Discard draft”; also `cleanupPublishedDraft` after publishing a loaded draft | delete control hidden in DraftsListDialog / `useDeleteDraftMutation({target})`, `useCleanupPublishedDraftMutation({target})` |
| `app.bsky.video.uploadVideo` | `selectVideo` (attach) **and** restoring a draft’s video (`restoreVideo`, which had no guard before r2) | `selectVideo` early return / `processVideo(..., target)` |

The data-layer guards throw `ComposerPdsWriteRefusedError` (or set the video to
an error state) before any network call. `target` is a required parameter on
each of them, so a new call site that forgets it fails typecheck.

Also refused for members/paid: the post-as-agent runtime publish
(`postAsAgent`), since it sits behind the same early return. `usePostToGroupMutation`
is not called from the composer at all; `group.ts` is untouched.

Note on the spec: the spec says the profile regression should show
`createRecord` “called exactly as before”. The base composer has never used
`createRecord` for posts – it publishes one `com.atproto.repo.applyWrites`
batch. The regression test therefore asserts the base behaviour as it really is:
exactly one `applyWrites` to the session repo with the same record shape, and no
`createRecord`/`putRecord`.

## Tests

New: `src/lib/communities/__tests__/composerTarget.test.ts` (table test over all
target kinds, plus fail-closed cases) and
`src/view/com/composer/state/__tests__/submit.test.ts` (mocked agent):

- Profile target (explicit and default): one `applyWrites` to the session repo,
  record shape as before, no `createRecord`/`putRecord`. A profile post with an
  image calls `uploadBlob` (control, proving the mocks would catch an upload).
- Members target and paid target, with an image attached: zero calls to
  `com.atproto.repo.createRecord`, `putRecord`, `uploadBlob` (both
  `agent.uploadBlob` and `com.atproto.repo.uploadBlob`), `applyWrites`, and the
  draft endpoints. Returns a typed refusal; does not throw.
- Public community target: unchanged (publishes).

Full suite (`pnpm test --bail=0`, `--bail=0` so all suites run):

| | Suites | Tests |
| --- | --- | --- |
| Base `569b3b240` | 3 failed, 125 passed, 128 total | 1 failed, 28 todo, 1387 passed, 1416 total |
| Head | 3 failed, 127 passed, 130 total | 1 failed, 28 todo, 1406 passed, 1435 total |

The 3 failing suites are identical before and after and pre-existing:
`__tests__/lib/string.test.ts` (needs compiled locale catalogs; `intl:compile` is
CI-only per CLAUDE.md), `plugins/uiSceneLifecycle/__tests__/withUISceneLifecycle.test.js`,
and `src/lib/contextEngine/__tests__/noBackgroundLocationShipped.test.ts`.

Typecheck: the only errors are the 82 pre-existing “cannot find
`locales/*/messages`” errors (uncompiled catalogs). None in changed code.
Lint: clean on all changed files.

## Flags

| Flag | Default | Notes |
| --- | --- | --- |
| (none new) | – | The guard is a fail-closed safety check and deliberately not flaggable off. It is inert today: nothing sets a community target, so every caller gets the default profile target and unchanged behaviour. |

### Deviation from shared rule 1 (open question for Elliott)

**This is a deviation.** Shared rule 1 says anything new sits behind a flag that
defaults to off. The guard and the `target` plumbing are not behind a flag.

- Why: a flag that turns the guard off would let members/paid content reach the
  PDS whenever the flag is off. That removes the fail-closed property, which is
  the point of the guard. Gating only the `target` plumbing would add a second
  path that skips the guard.
- Exposure while unflagged: nothing sets a community target, so every caller
  gets `{kind: 'profile'}`, which is allowed. Behaviour for every existing
  caller is unchanged; the full suite shows no new failures.
- Not done: no flag was added (the review says not to add one that weakens the
  fail-closed property).
- **Open question for Elliott:** accept this deviation from rule 1 for the
  guard, or name a flag shape you want (for example, a flag that gates only the
  UI that will later set a community target, and leaves the guard always on).

## Not done / out of scope

- The members write path (walled-store client). Members submit is refused.
- Public-tier community posting is not routed anywhere new; a public target
  behaves exactly like the profile path.
- No UI sets `target` yet (no new screens).
- The Authority One runtime video *attach* (`uploadAuthorityVideo`) is a runtime
  upload, not a PDS write, so it is not blocked at attach time; the later PDS
  blob upload and post are blocked at submit.
- Did not run `wrangler` or `check:bundle` (deny-listed). No deploy, no EAS/TestFlight.

## Fix pass r2 (task `5800b5d0`, review `W1-T3-composer-guard-review-2026-10-28-r2`)

Branch `coord/fix-w1-t3-composer-guard-deleted-5800b5d0`, based on `cc80918e1`.
Commits: `4aa453e1a` (code), `931e6e8c5` (tests), then this report commit.

**Major 1 – deleteDraft.** Added `app.bsky.draft.deleteDraft` to
`GUARDED_PDS_WRITES`. I applied both fixes the review allowed:
`useDeleteDraftMutation({target})` and `useCleanupPublishedDraftMutation({target})`
refuse before the server call, and DraftsListDialog hides DraftItem’s delete
control (`onDelete` is now optional) when the target is refused. Tests: hook
refusal tests for members and paid, plus profile and public controls
(`drafts/state/__tests__/queries.guard.test.tsx`), and a DraftItem render test
that checks the control is shown or hidden (`drafts/__tests__/DraftItem.delete.test.tsx`).
Table above corrected.

**Major 2 – Composer-level guards untested.** The checks now also live in the
code each Composer call site uses, not only in the Composer’s early returns:
- `handleSaveDraft` and `saveCurrentDraft` call `useSaveDraftMutation({target})`.
- `selectVideo` and draft-video restore call `processVideo(..., target)`.
- Delete and cleanup go through the guarded hooks above.
- The human video branch of `onPressPublish` calls
  `assertComposerPdsWrite(target, 'com.atproto.repo.uploadBlob')` before
  `agent.uploadBlob`.
- The normal publish branch already went through `submitComposerThread`.

`target` is required on all of these, so dropping it at a call site fails
typecheck. Tests assert that members and paid targets make zero `createDraft`,
`updateDraft`, `deleteDraft`, `uploadVideo`, `agent.uploadBlob`,
`com.atproto.repo.uploadBlob` and `applyWrites` calls through the save, delete,
cleanup and video paths, and that no local draft media is touched
(`state/__tests__/video.guard.test.ts` and the draft hook test). I checked that
the tests catch regressions: with the delete, cleanup and video guards
temporarily removed, 6 tests failed.

Found and fixed during the pass: the restore-draft-video path
(`restoreVideo` -> `processVideo`) had no guard. A members target could have
opened a draft with a video and started a bsky upload.

**Major 3 – rule 1.** Recorded as an explicit deviation and open question
above, and in `AUTONOMOUS-LOG.md`. No flag added.

Tests (r2 head, `pnpm test --bail=0`): 3 failed and 130 passed suites (133
total); 1 failed, 28 todo and 1435 passed tests (1464 total). The 3 failing
suites are the same pre-existing ones as above. New tests: +3 suites, +29
tests, all passing. Typecheck: only the 82 pre-existing locale-catalog errors.
Lint: no errors in changed or new files (pre-existing errors elsewhere are
unchanged).

Not verified in r2:
- `ComposePost` is not rendered in any test. A Composer-level UI early return
  (the toast in `selectVideo`, `setError` in the save and publish paths) could
  still be removed without a test failing. The write itself stays blocked by
  the data-layer guard, which is tested.
- The `onPressPublish` human-video `uploadBlob` assertion and the `postAsAgent`
  refusal rely on the early return plus, for `uploadBlob`, the assert. Neither
  has a component test.
- Not run on a device or simulator.

## Environment notes

`pnpm` is not on PATH on this machine; it was run through `corepack pnpm`, with
`CI=true` on install (skips the `intl:compile` postinstall) and
`--config.script-shell` pointed at Git Bash so the POSIX `NODE_ENV=test jest`
script runs on Windows.
