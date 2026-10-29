# W2-T10: public feed transport behind GROUP_PROXY_DID (dark)

Task `11572d35`. Branch: `coord/w2-t10-public-feed-transport-beh-11572d35` (pushed).
Base: `0e9a11931`, which is `e743c2cfd` plus the ebe72964 marker removal. Code commit: `3e89c4251`.
No merge to integration. No flag or env change.

## Summary

**Contract found, so there was no STOP.** The spec says the network calls are all TODO. That is out of date: the W2-T10 fix pass (`8a0a0c0f`) already sent `fetchGroupTimeline` to the group AppView whenever the DID is set. This task hardens that path against the documented contract and adds tests for it.

## The contract implemented

- **Endpoint and shape:** `lexicons/com/authorityone/group/getTimeline.json`.
  - Query `com.authorityone.group.getTimeline`.
  - Params: `group` (at-uri, required), `limit` (1..100, default 50), `cursor`.
  - Output: `{cursor?, feed: app.bsky.feed.defs#feedViewPost[]}`.
  - Errors: `GroupNotFound`, `NotAuthorized`.
  - Generated types are in `src/lib/lexicon/generated/types/com/authorityone/group/getTimeline.ts`.
- **Transport:** every request sets the header `atproto-proxy: <EXPO_PUBLIC_AUTHORITYONE_GROUP_PROXY_DID>#<EXPO_PUBLIC_AUTHORITYONE_GROUP_SERVICE_ID>`. This is documented in `docs/communities/W2-T10-fix-pass-report.md` (M1).
  - `src/state/queries/group.ts:113`: `resolveGroupAppViewProxy`
  - `src/state/queries/group.ts:134`: `callGroupAppView`

## Changes (`src/state/queries/group.ts`)

- **`fetchGroupTimeline` (`:209`)**
  - It resolves the proxy first, so with the DID unset it throws the same `GroupAppViewUnavailableError` as before, with the same message, and sends nothing.
  - It then refuses any `group` that is not an `at://` URI, again with `GroupAppViewUnavailableError` and no request. Members-only communities use runtime ids and are read only through `communitiesClient`, so they can never reach this path. This is the same tier rule as `tierOf` in `lib/api/feed/communities.ts`.
  - It clamps `limit` to an integer in 1..100, the lexicon's range.
- **`mapGroupTimelineResponse` (`:184`)**
  - A body that is not an object, or has no `feed` array, throws the new `GroupTimelineResponseError` (`:151`).
  - Feed items without a `post` that has an `at://` uri and a string cid are dropped.
  - `cursor` is kept only when it is a non-empty string.
- XRPC errors (`GroupNotFound`, `NotAuthorized`, network errors) are passed on unchanged as `XRPCError`. In `communities.ts`, `publicTierStateFor` already classifies them as `error`, and an unconfigured DID as `unavailable`.

`lib/api/feed/communities.ts` needed no change. It already calls `fetchGroupTimeline` only for `at://` sources.

## Tests

8 new tests in `src/state/queries/__tests__/group-transport.test.ts`:

- DID unset: throws with today's exact message and makes no call.
- DID set: calls the endpoint with the lexicon params and the proxy header, with default limit 50.
- `limit` is clamped to 1..100.
- Members-only ids (`members-community-1`, a DID, an empty string) are refused and make no call.
- Response mapping keeps valid items and the cursor, and drops malformed items.
- An empty cursor is omitted.
- A malformed body throws `GroupTimelineResponseError`.
- `GroupNotFound` and `NotAuthorized` XRPC errors come through unchanged.

Results:

- **Targeted run** (`src/state/queries/__tests__`, `src/lib/api/feed`, `src/screens/Community`): 12 suites passed, 142 tests passed.
- **Full suite** (`pnpm test --bail=0` via corepack, script shell Git bash): 3 suites failed and 175 passed (178 total). 1 test failed, 28 todo, 2106 passed (2135 total).
  - The 3 failing suites are the known environment failures from earlier reports: `string.test.ts` (no compiled locale messages), `withUISceneLifecycle` and `noBackgroundLocationShipped` (CRLF checkout).
- **eslint:** clean on both touched files, and prettier was applied.
- **tsc:** no errors in the touched files. The repo baseline already has errors elsewhere.

## Assumptions and caveats

- **Binding build not on the integration line.** The constraint was `after:a54c058e`, but the binding build (`81b077ae9`) is **not** on `communities/integration`. It exists only on `coord/group-post-binding-build-com-aut-a54c058e`. This change does not depend on it: it is a read transport only. So I built on the given base rather than block.
- **No live call.** Nothing was sent to a real group AppView. The DID and service id are still unset in every build, so the path stays dark.
- **Install side effect.** `pnpm install` ran inside the worktree because `node_modules` was missing. Its postinstall `intl:compile-if-needed` failed because `pnpm` was not on PATH. No tracked files changed.
