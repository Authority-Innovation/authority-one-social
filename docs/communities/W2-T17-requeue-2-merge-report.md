# W2-T17 re-queue 2: merge report (task cebc82f4)

Date: 2026-10-29. Base: communities/integration `edcb6f873`. Merged:
`c3ba85375` (coord/fix-165c480d-w2-t17-reply-target-e0a04a1b).

## Merge

- Merge commit `9749a4ca4` (`--no-ff`, parents `edcb6f873`, `c3ba85375`).
- Fast-forward of communities/integration: see "Push" below.

## File-by-file resolution

- `AUTONOMOUS-LOG.md`: conflict. I kept both sides.
- `src/view/com/composer/Composer.tsx`: conflict.
  - Imports: I took the union of `composerTarget` and `resolveTarget`. I dropped
    `DEFAULT_COMPOSER_TARGET` and `guardComposerPdsWrite` from the import list
    because nothing in the merged body uses them any more.
  - Deps: union. `selectVideo` has `pdsWriteRefusal, target, targetResolution,
    writeRefusalMessage`, and `restoreVideo` has `target, targetResolution`.
  - I kept HEAD's `target` / `pdsWriteRefusal` and the incoming side's
    `targetResolution` / `writeRefusalMessage`.
  - An unresolved target is now `null`, not `undefined`. The guard reads
    `undefined` as the profile but refuses `null`, so the data-layer guards
    (draft save/delete/cleanup, video upload, blob upload) stay closed for a
    target the composer could not resolve.
  - I removed the `public-community-write-not-available` case from
    `writeRefusalMessage`, because that reason no longer exists.
- `src/lib/communities/composerTarget.ts`: guard restored to the ruling.
  - Allowed: `undefined` (default profile), `{kind:'profile'}`, and public.
  - Members and paid are refused with `members-write-not-available`.
  - Anything else, including `null`, is refused with `unknown-target`.
  - `deleteDraft` stays in `GUARDED_PDS_WRITES`.
  - `assertComposerPdsWrite` still throws before any network call.
  - `null` was added to the parameter types.
- `src/lib/communities/resolveTarget.ts`: unchanged. `ok()` still refuses public
  with `public-community-not-available`.
- `src/view/com/composer/state/submit.ts`: the `target` parameter now also
  accepts `null`, which is refused. I updated the doc comment. Routing is
  unchanged.
- `drafts/state/queries.ts`, `drafts/DraftsButton.tsx`,
  `drafts/DraftsListDialog.tsx`, `state/video.ts`: target types changed to
  `ComposerTarget | null`, with no other change.
- Reply openers (e0a04a1b `feedPostTarget`) were auto-merged from the incoming
  side and are kept.

## Tests

- `composerTarget.test`: `undefined`/default and public are now allowed.
- `writeGate.test`: a hand-built public resolution is now allowed by the gate.
  The test notes that resolveTarget never produces it.
- `submit.test`:
  - "no target" is now in the profile it.each and posts as the profile.
  - The direct public-submit refusal test is replaced by the resolver test
    below.
  - New: a `null` target is refused, and nothing is sent.
- New (step 6, `submit.test`): a public target is refused by the resolver in
  three cases: flag on, flag off, and a locked public build. It never resolves,
  to the profile or anywhere else, so submit sends nothing: no applyWrites,
  createRecord, putRecord, uploadBlob, or communities client calls.
- `queries.guard.test` and `video.guard.test` already allowed public and passed
  unchanged.
- Kept and passing: members and paid refused, unknown refused, a members target
  never reaches uploadBlob or uploadVideo, and a flag-on reply to an ordinary
  PDS post is not refused (`feedPostTarget.test`).

## Checks run

- jest on `src/lib/communities` and `src/view/com/composer`, which includes the
  resolveTarget, submit, writeGate, queries.guard and video.guard tests:
  8 suites, **133 passed, 0 failed**. Run with `NODE_ENV=test` and jest
  directly, after `pnpm install --frozen-lockfile --ignore-scripts`.
- tsc (`tsconfig.check.json`, via `tsc`, not `tsgo`): no errors other than the
  pre-existing `src/locale/i18n.web.ts` "Cannot find module
  ./locales/*/messages", which comes from the uncompiled intl catalogs.
- ESLint (`--quiet`) on the changed .ts/.tsx files: clean.
- Not run: full jest, full ESLint.

## Flag check

`eas.json`: `EXPO_PUBLIC_COMMUNITIES_ENABLED` is `"false"` in all 7 env blocks.
I did not touch it.

## Public-target result

The guard allows public, but resolveTarget refuses it, and the composer only
submits a resolved target. So a public post does not send in this build and
cannot become a profile post.

One caveat: `submitComposerThread` called directly with a public target (which
bypasses the resolver) would take the PDS profile path. The app never does this,
because Composer only submits `targetResolution.target` after `ok`. Under the
brief's decision, the resolver is the only stop. The `group.post` binding was
not built.

## Push

The task branch `coord/re-queue-2-w2-t17-guard-allows-p-cebc82f4` is pushed.
The fast-forward of communities/integration has to go through the builder
deny-list. Its outcome is in the task's `report_result`.
