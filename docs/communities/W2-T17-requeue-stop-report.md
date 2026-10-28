# W2-T17 re-queue under composer ruling: STOPPED (task d9017084)

Date: 2026-10-29. Base: communities/integration `edcb6f873`. Source: `coord/fix-165c480d-w2-t17-reply-target-e0a04a1b` head `c3ba85375`.

## Result

Stopped under the brief's stop rule. No merge commit, and nothing pushed to
communities/integration. I ran the trial merge (`--no-ff --no-commit`), then
aborted it. This report is the only commit on the task branch.

## Trial merge

- Auto-merged: `composerTarget.ts`, `composerTarget.test.ts`, `PostFeedItem.tsx`.
  New from W2-T17: `resolveTarget.ts`, `feedPostTarget.ts`, `writeGate.ts`, the
  reply openers and the tests.
- Conflicts:
  - `AUTONOMOUS-LOG.md`: both sides added entries. Trivial, keep both.
  - `src/view/com/composer/Composer.tsx`: imports and hook dependency arrays.
    HEAD (W1-T3 r2) has `target` and `pdsWriteRefusal`; W2-T17 has
    `targetResolution` and `writeRefusalMessage`. These are resolvable.
- The auto-merged `composerTarget.ts` took the W2-T17 guard. The guard refuses
  public (`public-community-write-not-available`) and an undefined target, and
  it drops `app.bsky.draft.deleteDraft` from the refused writes. The ruling
  needs all three reverted to the HEAD (W1-T3 r2) behaviour. That part is
  straightforward.

## Stop: public tier cannot resolve without becoming a profile post

File: `src/view/com/composer/state/submit.ts` (together with
`src/lib/communities/resolveTarget.ts` `ok()`, which refuses public as
`public-community-not-available`).

- Behaviour A (ruling and brief): a public-tier target is allowed and resolves
  to the community target. `routeForTarget` gives it route `pds`.
- Behaviour B (brief): a public target must not become a profile post. This is
  the original W2-T17 M1.

The two conflict because `submitComposerThread` sends every allowed target to
`apilib.post`. That function takes no target and writes a plain
`app.bsky.feed.post` with no community binding. If I remove the
resolveTarget refusal, a public target lands on the profile with its community
lost, which is exactly M1 again.

The only binding mechanism in the repo is a second PDS write: a
`com.authorityone.group.post` association record, `{subject: post strongRef,
group: group-profile strongRef}`. It lives in `usePostToGroupMutation`,
`src/state/queries/group.ts:390`, which is marked `TODO(composer)` and is not
wired into the composer. Building that path means:

- adding a new write (`createRecord` on `com.authorityone.group.post`);
- a group cid lookup, because the public `ComposerTarget` only carries the uri;
- deciding thread binding (root only, or every post) and how replies to public
  community posts bind.

That is outside the ruling, so I did not build it.

## Asked

`ask_orchestrator` offered three options: (1) build the group.post binding path,
fail closed; (2) allow public in the guard only and keep the resolveTarget
refusal; (3) hold. The call timed out after 660s with no answer.

## Not done

- No merge commit, and no push to communities/integration.
- No test changes, so no tests were run. jest, tsc and ESLint were not run.
- Flag check not needed: nothing was changed.
  `EXPO_PUBLIC_COMMUNITIES_ENABLED` is untouched.
