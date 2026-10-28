# Communities W2-T17: composer target and fail-closed rule

- Task: `f0037cb5`
- Branch: `communities/w2-composer-target`
- Base: `569b3b240`, with the predecessors merged in by merge commits:
  - T1 `origin/coord/communities-w1-t1-flags-routes-f-df17dfda` (merge `fa83aff71`)
  - T3 `origin/coord/communities-w1-t3-composer-no-pd-1550eefa` (merge `0bd1c7b94`)
  - T8 `origin/coord/communities-w1-t8-communities-cl-f45195a0` (merge `6f2cf04b4`).
    The spec names only T1 and T3. T8 is merged as well because the members
    write path must call `communitiesClient.post`, and T8 is where that client lives.
  - The only merge conflicts were in `AUTONOMOUS-LOG.md`. Each was add/add, and
    I resolved them by keeping both entries.
- Feature commit: `3ad7673d6`

## What changed

| File | Change |
| --- | --- |
| `src/lib/communities/resolveTarget.ts` | New. Pure `resolveTarget(context)`. It returns `{ok, target, route: 'pds' \| 'communities', locked}` or `{ok: false, error: {code}}`. It never throws. |
| `src/view/com/composer/state/submit.ts` | The T3 guard still runs first. If the guard allows the target (profile or public tier), the existing `apilib.post` PDS path runs unchanged. If the guard refuses a members or paid target, the submit goes to `communitiesClient.post` (or `.reply` for a reply), and the agent never sees the thread. Any other refusal is returned as is. Members media and quotes are refused before anything is sent. A link card is dropped rather than resolved, because resolving it would upload a thumbnail. A thread is posted as a chain of replies. |
| `src/view/com/composer/Composer.tsx` | `resolveTarget` runs before any write path, using the opts target, the parent ref, `LOCKED_COMMUNITY` and `COMMUNITIES_ENABLED`. An unresolved target is refused. A members or paid route goes only through `submitComposerThread`. Post-as-agent and runtime video are refused for it. Drafts and bsky video stay refused through the guard, unchanged from T3. |
| `src/state/shell/composer/index.tsx` | Adds an optional `ComposerOptsPostRef.target`: the parent's own target. |

## resolveTarget table

Here "flag" means `COMMUNITIES_ENABLED`. A "PDS parent" is an `at://…/app.bsky.feed.post/…` URI. A "runtime parent" is a runtime post id.

| Case | Input | Result |
| --- | --- | --- |
| Nothing requested | none | profile, `pds` |
| Profile | requested profile | profile, `pds` |
| Public community | requested public `c1` | public `c1`, `pds` (existing path) |
| Members community | requested members `c1` | members `c1`, `communities` |
| Paid community | requested paid `c1` | paid `c1`, `communities` |
| Reply, PDS parent, no target | parent PDS URI | profile, `pds` (unchanged behaviour) |
| Reply inherits public | parent target public | public, `pds` |
| Reply inherits members / paid | parent target members or paid | same, `communities` |
| Reply, explicit target matches parent | requested = parent target | that target |
| Unknown parent | runtime id with no target, empty URI, non-post AT-URI, malformed target, null | **refused** `unknown-parent-target` |
| Explicit target that disagrees with the parent | e.g. profile on a members parent | **refused** `reply-target-mismatch` |
| Malformed requested target / empty id | | **refused** `unknown-target` |
| Flag off: profile, or reply to a PDS parent | | profile, `pds` (unchanged) |
| Flag off: any community target, or a locked build | | **refused** `communities-disabled` |
| Locked, nothing requested | lock `c1`, tier members | members `c1`, `communities`, `locked: true` |
| Locked, profile requested | lock `c1`, tier public | public `c1`, `pds`, locked (the request is overridden) |
| Locked, tier taken from a matching request | lock `c1`, requested paid `c1` | paid `c1`, locked |
| Locked, reply inside the locked community | parent members `c1` | members `c1`, locked |
| Locked, another community requested | | **refused** `locked-community-mismatch` |
| Locked, reply to a PDS post | | **refused** `locked-community-mismatch` |
| Locked, tier unknown | lock `c1` and nothing else | **refused** `locked-community-tier-unknown` |
| Locked, request tier disagrees with config tier | | **refused** `unknown-target` |
| Lock is whitespace only | | treated as not locked |

## Tests

New and updated tests:

- `src/lib/communities/__tests__/resolveTarget.test.ts`: the table above (33 rows), plus checks that the target is canonicalised and that garbage input does not throw.
- `src/view/com/composer/state/__tests__/submit.test.ts`. The T3 members tests are rewritten, because members content now has a write path:
  - **Members and paid submits:** `communitiesClient.post('c1', body)` is called. The mocked agent sees zero `createRecord`, `putRecord`, `uploadBlob` (both `agent.uploadBlob` and `repo.uploadBlob`), `applyWrites` and draft calls.
  - **Members media:** refused up front, with no client call and no upload.
  - **Members threads:** posted as a reply chain.
  - **Client errors:** returned typed, never thrown.
  - **Guard refusals:** an unrecognised tier is refused by the guard, and nothing is sent.
  - **Public tier:** keeps the PDS path, and the client is never called.
  - **Profile (regression):** a single `applyWrites` with the same record shape as before. An image upload still happens (the control case). The client is never called.
  - **Reply inheritance:** a members parent goes to `communitiesClient.reply('c1', parentId, body)` with zero PDS writes. A reply to a PDS post keeps the PDS path, and `reply.parent.uri` is set.
  - **Unknown parent:** refused before submit.
  - **Locked build:** a request for profile still posts to the locked community through the client.

Full suite (`pnpm test --bail=0`):

| Commit | Suites | Tests |
| --- | --- | --- |
| Base `569b3b240` | 3 failed, 125 passed, 128 total | 1 failed, 28 todo, 1387 passed, 1416 total |
| Predecessors merged `6f2cf04b4` | 3 failed, 131 passed, 134 total | 1 failed, 28 todo, 1480 passed, 1509 total |
| Head `3ad7673d6` | 3 failed, 132 passed, 135 total | 1 failed, 28 todo, 1525 passed, 1554 total |

The same 3 suites fail at every commit. They were already failing on the base and are environment-only:

- `__tests__/lib/string.test.ts` needs the compiled catalogs, and `intl:compile` runs only in CI.
- `plugins/uiSceneLifecycle/__tests__/withUISceneLifecycle.test.js` and `src/lib/contextEngine/__tests__/noBackgroundLocationShipped.test.ts` fail from Windows CRLF artefacts.

Typecheck (`pnpm typecheck`): 82 errors. All of them are the existing "cannot find `locales/*/messages`" errors, and none are in changed code. Lint: clean on the changed files. The one warning in `Composer.tsx` was already there.

## Flags

| Flag | Default | Effect here |
| --- | --- | --- |
| `EXPO_PUBLIC_COMMUNITIES_ENABLED` | off | When off, any community target (requested, inherited or locked) is refused. Profile posting is unchanged. |
| `EXPO_PUBLIC_LOCKED_COMMUNITY` | empty | When set (and communities are on), the target is fixed to that community. Any other community, and replies outside it, are refused. |
| (no new flags) | | |

No UI sets a target yet: no caller passes `target`, and no `replyTo.target` is set. With the defaults, every existing composer flow resolves to profile, so behaviour is unchanged.

## Assumptions and open questions

1. **A reply to an `app.bsky.feed.post` AT-URI with no explicit target counts as a known profile parent.** Without this, every existing reply would be refused. Every PDS post is public, so this cannot leak members content. Anything that is not such a URI and carries no target is refused.
2. **The tier of a locked community.** `LOCKED_COMMUNITY` holds only the id. The composer has no community config, because the screens are T12. So the tier comes from a matching requested or parent target. With nothing to supply it, the submit is refused (`locked-community-tier-unknown`). When the config is wired in, `lockedCommunityTier` should be passed into `resolveTarget`.
3. **Locked builds refuse replies to ordinary PDS posts.** I read "fixed" strictly. A brand build may want to allow that, which needs an owner call.
4. **A locked id with the flag off is refused, not ignored.** This fails closed, so a misconfigured brand build cannot post publicly.
5. **Members posts are text only.** There is no members media upload path yet, and media is never uploaded anywhere to find that out. A members parent is identified by `replyTo.uri` holding the runtime post id. Rendering the reply preview for a members parent is T12's job.
6. **A partial members thread failure returns the error after the earlier posts were sent.** Nothing is rolled back.

## Not done / out of scope

- Community screens and any UI that sets a target (T12). No target picker: the lock is enforced in `resolveTarget`, and there is no control in the composer that could change it.
- No runtime or server work. No PDS writes for members content.
- I did not run `wrangler` or `check:bundle` (both are deny-listed). No deploy, no EAS or TestFlight build, no intl extraction.
- No device or simulator run.

## Environment notes

`pnpm` is not on PATH. I used `corepack pnpm` with `CI=true`, `--config.verify-deps-before-run=false` (the postinstall `intl:compile` cannot find `pnpm`, and it is CI-only anyway) and `--config.script-shell` pointed at Git Bash.
