# Autonomous log

## 2026-10-28 – Communities W1-T3: composer no-PDS-write guard (task 1550eefa)

- Branch `coord/communities-w1-t3-composer-no-pd-1550eefa`, base `569b3b240`.
- Changed: `ComposerTarget` + pure fail-closed `guardComposerPdsWrite`
  (`src/lib/communities/composerTarget.ts`); `submitComposerThread`
  (`src/view/com/composer/state/submit.ts`); `ComposerOpts.target` threaded to
  `ComposePost`; composer refuses members/paid targets before publish, drafts and
  bsky video upload.
- Head: see `git log` (feature commit `f0a4c68d8`, then this log/report commit).
- Tests: base 1387 passed / 1 failed / 28 todo (128 suites, 3 failing);
  head 1406 passed / 1 failed / 28 todo (130 suites, same 3 pre-existing failures).
- Verdict: done, draft PR, awaiting separate review.
- NOT done: members write path (walled-store client), any UI that sets a
  community target, public-tier routing. No wrangler / check:bundle (deny-listed).
- Report: `docs/communities/W1-T3-composer-guard-report.md`.

## 2026-10-29 – W1-T3 composer guard fix pass r2 (task 5800b5d0)

- Branch `coord/fix-w1-t3-composer-guard-deleted-5800b5d0`, base `cc80918e1`.
- Major 1: `deleteDraft` added to `GUARDED_PDS_WRITES`; delete/cleanup hooks
  refuse members/paid; the drafts list hides delete for a refused target.
- Major 2: draft save/delete/cleanup hooks and `processVideo` take a required
  `target` and refuse before any server call; zero-write tests added. Also
  guarded the restore-draft-video upload, which had no guard.
- Major 3: **deviation from shared rule 1 (flags default off)**. The guard is
  not flagged, because a flag would weaken fail-closed. Open question for
  Elliott: accept it, or name a flag shape.
- Tests: 133 suites (3 pre-existing failures), 1435 passed / 1 failed / 28 todo.
- Not verified: no render test of `ComposePost` itself; no device run.
- Report: `docs/communities/W1-T3-composer-guard-report.md` (section "Fix pass r2").
