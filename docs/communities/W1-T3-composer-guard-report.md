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

For a `members` or `paid` community target, none of these are reachable from
the composer:

| Write | Where the composer would reach it | Guard point |
| --- | --- | --- |
| `com.atproto.repo.applyWrites` | `apilib.post` (every normal post / thread, incl. threadgate + postgate records) | `onPressPublish` top + `submitComposerThread` |
| `com.atproto.repo.uploadBlob` | image/GIF/video embeds in `apilib.post`; `agent.uploadBlob` in the human video branch | `onPressPublish` top + `submitComposerThread` |
| `com.atproto.repo.createRecord` | not used by the base composer (see note) | covered by the same early return |
| `com.atproto.repo.putRecord` | not used by the base composer | covered by the same early return |
| `app.bsky.draft.createDraft` / `updateDraft` | server-side drafts (go through the PDS) | `handleSaveDraft`, `saveCurrentDraft` |
| `app.bsky.video.uploadVideo` | bsky video upload at attach time (the video service writes the blob into the PDS) | `selectVideo` |

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

## Not done / out of scope

- The members write path (walled-store client). Members submit is refused.
- Public-tier community posting is not routed anywhere new; a public target
  behaves exactly like the profile path.
- No UI sets `target` yet (no new screens).
- The Authority One runtime video *attach* (`uploadAuthorityVideo`) is a runtime
  upload, not a PDS write, so it is not blocked at attach time; the later PDS
  blob upload and post are blocked at submit.
- Did not run `wrangler` or `check:bundle` (deny-listed). No deploy, no EAS/TestFlight.

## Environment notes

`pnpm` is not on PATH on this machine; it was run through `corepack pnpm`, with
`CI=true` on install (skips the `intl:compile` postinstall) and
`--config.script-shell` pointed at Git Bash so the POSIX `NODE_ENV=test jest`
script runs on Windows.
