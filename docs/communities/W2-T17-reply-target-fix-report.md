# W2-T17 fix: reply target (165c480d re-review M-A)

Task `e0a04a1b`. Built on 79fb93e86. The existing fix commits are kept.

## The change

- `src/lib/communities/feedPostTarget.ts` (new): `feedPostTarget(post)` returns
  `{kind: 'profile'}` for an AppView post with an `app.bsky.feed.post` AT-URI.
  Anything else returns `undefined`.
- Each of the 7 reply openers now passes `target: feedPostTarget(post)` in
  `replyTo`:
  - `PostFeedItem`
  - `Post`
  - `ThreadItemAnchor`
  - `ThreadItemPost`
  - `ThreadItemTreePost`
  - `PostThread/index`
  - `VideoFeed`
- `resolveTarget` is unchanged. A parent with no target is still refused when
  the flag is on. A parent whose target is malformed, or whose id is a runtime
  id, is also still refused.
- The comment on `ComposerOptsPostRef.target` is updated.

### Why AppView posts map to the profile target

Every reply opener renders an `AppBskyFeedDefs.PostView` from the AppView.
There is no community feed source yet, because the Community screens are still
placeholders. Members and paid posts sit under runtime ids, and these
components never render them. Public community posts are refused at write
time. When a community feed source is added, its items must carry their own
community target and must not use this helper.

## The standing rule

A members target never reaches a PDS write. `feedPostTarget` only ever returns
the profile target or `undefined`. It cannot return a community target, and
the guard and the gate are unchanged.

## Tests

- `resolveTarget.test.ts`: the M1 row now expects a flag-on reply with the
  profile target from `feedPostTarget` to resolve to `profile` on the `pds`
  route. A separate row keeps the refusal for a parent that has no target.
- `feedPostTarget.test.ts` (new) covers:
  - the helper cases
  - a flag-on reply with a known profile target: resolves and the guard allows
    it
  - a runtime-id parent: still refused
  - a source guard that every `replyTo: {...}` opener in `src` passes `target:`
    (it finds 7)

### Results

The worktree had no `node_modules`, so I ran
`pnpm install --frozen-lockfile --ignore-scripts`. `pnpm test` cannot run on
Windows because of its `NODE_ENV=test` prefix, so I ran jest directly with
`NODE_ENV=test` set.

- **Targeted suites** (`src/lib/communities`, `src/view/com/composer`,
  `src/lib/agent-runtime`, `src/screens/Community`): 36 suites, 505/505 tests
  pass.
- **Full suite:** 134 of 137 suites pass. 1562 tests pass, 1 fails, and 28 are
  todo. The 3 failing suites do not touch this change and look environmental:
  - `__tests__/lib/string.test.ts`: the locale messages are not compiled.
  - `plugins/uiSceneLifecycle/...`: the AppDelegate template does not match.
  - `noBackgroundLocationShipped.test.ts`: it expects an LF line ending, but
    this Windows checkout has CRLF.
- **eslint:** clean on all touched files.
- **tsc:** no errors in the touched files. The repo-wide errors are already
  there: uncompiled locales and missing bskylink dependencies.

## Not verified

- I did not run the app, so a reply on a device with the flag on is not tested
  by hand.
- Minors m1 to m3 are out of scope and unchanged.
- The work is pushed to this task's own branch,
  `coord/fix-165c480d-w2-t17-reply-target-e0a04a1b`. It is not pushed to
  `coord/fix-w2-t17-composer-target-draft-165c480d`, because the run rules only
  allow pushing the task's own branch. Fast-forward that branch if wanted.
