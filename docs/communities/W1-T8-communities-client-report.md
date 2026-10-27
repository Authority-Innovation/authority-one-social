# Communities W1-T8: communities client (report)

- Task: `f45195a0`
- Branch: `coord/communities-w1-t8-communities-cl-f45195a0`. The coordination loop assigned this name; the plan text said `communities/w1-client`.
- Base: `569b3b240` (build line, `fix/ao-uiscene-lifecycle`).
- Code commit: `b828226ec`
- PR: draft. See the PR on the branch; never merged.

## What changed

There are two new code files. No existing file was modified.

- `src/lib/agent-runtime/communitiesClient.ts`
- `src/lib/agent-runtime/__tests__/communitiesClient.test.ts`

Two other files were added by the wave rules: this report, and `AUTONOMOUS-LOG.md` at the repo root (it did not exist before).

The client is dark: nothing imports it yet. It adds no flag and no env key. T1 owns env changes, and a module that nothing imports needs no gate.

## Bearer helper

The client uses `getAgentRuntimeAccessToken` from `src/lib/agent-runtime/authToken.ts`, the same helper and bearer pattern the other runtime clients use. It does not use the deprecated `getSupabaseAccessToken` alias.

The name matches the plan, but the signature does not:

- On the build line (`569b3b240`) the helper takes no arguments. Calling it as `getAgentRuntimeAccessToken(url)` does not typecheck there.
- P2b adds an optional `targetUrl` parameter. If it is omitted, the helper assumes the target is the agent runtime.

So the client calls it with no argument. Every URL the client builds starts from `AGENT_RUNTIME_BASE_URL`, which is the case P2b's default exists for.

## Method table

All URLs start with `AGENT_RUNTIME_BASE_URL`. Ids are `encodeURIComponent`-encoded path segments.

| Method | HTTP | Path | Body | Success data |
| --- | --- | --- | --- | --- |
| `listMyCommunities()` | GET | `/app/communities` | none | `Community[]` (from `communities`) |
| `getCommunity(id)` | GET | `/app/communities/:id` | none | `Community` (from `community`) |
| `join(id, consentVersion)` | POST | `/app/communities/:id/join` | `{consentVersion}` | `CommunityMembership` (from `membership`) |
| `leave(id)` | POST | `/app/communities/:id/leave` | none | `null` |
| `getTimeline(id, cursor?)` | GET | `/app/communities/:id/timeline[?cursor=]` | none | `{posts, cursor?}` |
| `post(id, body, media?)` | POST | `/app/communities/:id/posts` | `{body, media: [{mediaId, alt?}]}` | `CommunityPost` (from `post`) |
| `reply(id, parent, body)` | POST | `/app/communities/:id/posts/:parent/replies` | `{body}` | `CommunityPost` (from `post`) |
| `deleteMine(id, postId)` | DELETE | `/app/communities/:id/posts/:postId` | none | `null` |
| `exportMine(id)` | GET | `/app/communities/:id/export` | none | `CommunityExport` (`{communityId, posts, generatedAt?}`) |
| `setAgentGrant(id, on)` | PUT | `/app/communities/:id/agent-grant` | `{on}` | `{agentGrant}` |

Every method returns `CommunitiesResult<T> = {ok: true, data} | {ok: false, error}` and never throws. The error kinds are:

- `signed_out`: no token, or HTTP 401.
- `http`: any other non-2xx, with `status` and the server's `error`/`message` if there is one.
- `network`: fetch rejected, or the token helper threw.
- `bad_response`: a 2xx body that is not JSON or has the wrong shape.
- `invalid_argument`: an empty id, an empty body, or a non-boolean grant. These are rejected locally and no request is sent.

## Rules held

- **No tenant id.** The client sends only the community id, plus a post id where the operation needs one, in the path. Request bodies are built field by field. For example, media refs are reduced to `{mediaId, alt}`, so a caller cannot slip extra keys such as `tenantId` into a request.
- **No PDS.** There are no `com.atproto.repo.*` calls, no `uploadBlob`, and no XRPC. Media is passed as refs to media the runtime's members-only store already holds; this client uploads nothing.
- **N1.** Post authors carry the runtime's `is_agent` flag, and `Community.agentDid` comes from the community config. Nothing infers an agent from a handle.

## Tests

`communitiesClient.test.ts` has 64 tests, run under both the default and iOS jest projects:

- **Requests:** each of the 10 methods (11 cases, since the timeline is tested with and without a cursor) sends the expected method, full URL and body. Path ids are encoded so they cannot change the route. An empty 2xx body is accepted.
- **No tenant id:** an `afterEach` checks every request in every test for no `tenant` in the URL, headers or body. Separate tests run all methods together, and check that smuggled media keys are dropped.
- **No PDS:** an `afterEach` checks that every request's host is the runtime base URL host and its path is under `/app/communities`. An explicit test checks that no request URL matches xrpc, `com.atproto`, uploadBlob or `bsky.social`.
- **Never throws:**
  - Every method returns a typed error on non-2xx, a network failure, a signed-out session, or the token helper throwing.
  - 401 maps to `signed_out`.
  - A non-JSON error body, a malformed 2xx body and invalid arguments each return a typed error.
- **P2b bearer call-site test:** I merged `origin/coord/communities-w1-t4-merge-signatur-a4ed5eb7` (the build line plus P2b, `da1fce83f`) into a throwaway local branch that I never pushed and have deleted. On that tree, these three suites passed (72 tests):
  - `src/features/aoSignature/__tests__/bearerCallSites.test.ts`
  - `communitiesClient.test.ts`
  - `authToken.test.ts`

### Full suite (`pnpm test --bail=0`, Windows, Git-bash script shell)

| | Suites | Tests |
| --- | --- | --- |
| Before (`569b3b240`) | 3 failed, 125 passed, 128 total | 1 failed, 28 todo, 1387 passed, 1416 total |
| After (`b828226ec`) | 3 failed, 126 passed, 129 total | 1 failed, 28 todo, 1451 passed, 1480 total |

The same 3 suites fail before and after. All three failures come from this Windows machine's setup, not the code:

- `__tests__/lib/string.test.ts`: the compiled locale `messages` file is missing. Install ran with `--ignore-scripts`, and the CLAUDE.md rules forbid running `intl:compile`.
- `src/lib/contextEngine/__tests__/noBackgroundLocationShipped.test.ts`: the test matches a source substring, and the CRLF checkout (`core.autocrlf=true`) breaks the match.
- `plugins/uiSceneLifecycle/__tests__/withUISceneLifecycle.test.js`: it reports that the AppDelegate template does not match. Most likely the same CRLF cause.

Other checks:

- `pnpm lint`: eslint is clean on both new files.
- prettier: applied.
- `pnpm typecheck`: the only errors are missing `src/locale/locales/*/messages` modules, for the same uncompiled-locale reason. There are no errors in the new files.

### How `pnpm test` was run here

- pnpm is only available through `corepack pnpm`.
- On Windows, the script's `NODE_ENV=test jest ...` fails under cmd. It was run with `--config.script-shell` set to Git bash.
- The script has `--bail`, so `--bail=0` was appended to get complete counts.

## Not done / not in scope

- No UI, no routes, no walled store, no PDS write, no env flags.
- I did not run `wrangler` or `check:bundle`; both are on the deny-list. Nothing was deployed, and there was no EAS, TestFlight or App Store build.
- The runtime routes are assumed. The `/app/communities/...` paths and response envelopes above are this client's proposal. I could not find a server-side spec in this repo or on the sibling wave branches, so the runtime task must match these routes or this file must be adjusted.

## Open questions

1. Should the client switch to `getAgentRuntimeAccessToken(url)` once P2b is on the build line? This is optional: the no-argument call is correct under P2b because every URL is built from `AGENT_RUNTIME_BASE_URL`.
2. Should `reply` be a nested route (`posts/:parent/replies`, as now) or `posts` with `{parentId}` in the body? This depends on the runtime's route design.
3. Is `setAgentGrant` right as `PUT .../agent-grant {on}`, or should it be a POST?
