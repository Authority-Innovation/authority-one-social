# W1-T8 fix pass (task a7b1ec0b): client conformed to the door

Branch: `coord/after-06041e6d-fix-pass-w1-t8-cl-a7b1ec0b`. It is based on `d52f1bd82`, the head of `coord/communities-w1-t8-communities-cl-f45195a0`, so it fast-forwards that branch. The run rules allow pushing only this task branch, so I did not push to the f45195a0 branch.

Contract sources (pilot-agent-runtime, read only):
- `src/communities/door.js` at `b30ba816`, the door after fix pass 06041e6d (branch `coord/independent-fix-pass-w1-t5-commu-06041e6d`).
- The W2-T7 door diff at `64b2b80a` (`coord/communities-w2-t7-community-agen-fb477fb1`).

## B1: shapes and setAgentGrant

All changes are in `src/lib/agent-runtime/communitiesClient.ts`.

- `post` and `reply` send `{text}`. The `media` parameter and the media-ref types are gone because the door has no media field. Both read `{item}` and return `CommunityItem`: `{id, parentId, authorId, text, createdAt}`, plus `is_agent`, `sources` and `no_source` when the agent flag is on.
- `getTimeline` reads `{items, cursor}`. `cursor` is `string | null`.
- `exportMine` reads `{communityId, items}`.
- `join(id, consentVersion: number)` rejects a value that is not a finite number. It reads `{community, joined}`.
- `Community` now matches `publicConfig`:
  - `wording_version` is `number | null`.
  - `agent` is `{did, is_agent: true} | null`. The key is absent when the agent flag is off.
  - `agent_error` is optional.
  - The invented fields (`role`, `memberCount`, `consentVersion: string`, `agentGrant`) are removed.
- `setAgentGrant` now sends `POST /:id/agent-grant {on}` instead of PUT. The new `getAgentGrant` sends `GET /:id/agent-grant`. Both read `{communityId, on}`. `PUT` has been removed from the request method type.
- New `getJoinInfo`: `GET /:id/join-info` returns `{wording_version}`, where the value is a number or null. This route exists only on the 06041e6d fix branch and is not yet on `...22fcf7e3` or on the T7 branch. I counted it as landed because this task is sequenced after 06041e6d. If that fix is not merged, nothing on the door answers this call yet.
- New contract test, `__tests__/communitiesClient.contract.test.ts`:
  - It feeds the door's exact `reply(...)` envelopes and status codes (200 and 201) for all 12 routes, in both the agent-flag-off and agent-flag-on variants, and asserts `ok: true`.
  - It asserts the method, path and body the door reads.
  - It maps the door's error bodies (`not_found`, the join refusal with `hint`, `bad_text`, `bad_cursor`, `bad_grant`, 401 `unauthorized`) to typed errors.
- I updated the existing `communitiesClient.test.ts` cases to the door envelopes.

## M2: never throws

- `request()` now takes path parts and builds the URL inside its `try`.
- A `URIError` from `encodeURIComponent` (for example, a lone surrogate) returns `invalid_argument`. The check is by name because `instanceof` fails across the Jest realm.
- New test: a lone-surrogate id, or cursor, sent to every method returns `invalid_argument`. No fetch or token call is made.

## Tests (Windows, `corepack pnpm`, Git-bash script shell)

- communitiesClient suites: 2 suites, **101 passed / 101**.
- Full suite (`pnpm test --bail=0`):

  | | Suites | Tests |
  | --- | --- | --- |
  | Before (T8 head) | 3 failed, 126 passed, 129 total | 1 failed, 28 todo, 1451 passed, 1480 total |
  | After (this fix) | 3 failed, 127 passed, 130 total | 1 failed, 28 todo, 1488 passed, 1517 total |

  The same 3 environment failures are present before and after: missing compiled locale in `string.test.ts`, and CRLF in `noBackgroundLocationShipped` and `withUISceneLifecycle`.
- eslint is clean on the 3 changed files. Prettier has been applied. `pnpm typecheck` reports no errors apart from the pre-existing missing `locales/*/messages` modules.

## Not verified / not done

- No live call against a running door. The contract test uses envelopes copied from the source, not a real door.
- The roster route (`GET /:id/posts/:postId/roster`) has no client call. It is out of scope.
- The spec asked for a Claude Haiku 5.5 Co-Authored-By line. This run is on Opus, so the commit carries the accurate Opus 5.5 attribution.
- No PR was opened. Nothing was merged or deployed. I did not run wrangler or check:bundle, and made no PDS writes.

## Known issue for Elliott (for the PR body)

The f45195a0 branch is 9 commits ahead of `origin/main`. Two of them are T8 (`b828226ec`, `d52f1bd82`). The other 7 are unrelated iOS and network work that the branch was cut on top of:
`711bd5fa2`, `29f3169b7`, `06235f30b`, `e0820183d`, `e08438c76`, `232f89cc5`, `569b3b240`.
They were left in place, as instructed. You need to decide whether to rebase T8 onto main or to merge after those commits land.
