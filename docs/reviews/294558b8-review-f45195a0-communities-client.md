# Review 294558b8: backlog record f45195a0 (Communities W1-T8, communities client)

Review only. Nothing was committed to the reviewed branches, merged, pushed to them, or deployed.

## What was reviewed

- Record f45195a0: "Communities W1-T8: communities client, new file (fork) [independent]".
- I had no bus tool to read the original task body or its earlier result. Instead I used the task's own report (`docs/communities/W1-T8-communities-client-report.md` on the branch) and the later fix-pass report (`docs/communities/W1-T8-FIXPASS-a7b1ec0b.md`).
- Code: `origin/coord/communities-w1-t8-communities-cl-f45195a0`, head `d52f1bd82`. The T8 commits are `b828226ec` (client and tests) and `d52f1bd82` (report).
- **The code is not on main.** `main` / `origin/main` is at `571924785`, and `src/lib/agent-runtime/communitiesClient.ts` does not exist there. The branch is cut from `569b3b240` (the build-36 iOS/network line), so it carries 7 unrelated commits that are not on main either: `711bd5fa2`, `29f3169b7`, `06235f30b`, `e0820183d`, `e08438c76`, `232f89cc5`, `569b3b240`.
- This version has been superseded. Fix pass a7b1ec0b (`84fbf9736`) conformed the client to the door contract (B1) and moved URL building inside the try block (M2). That fix and later work (`doorContract.ts`, `e58a84761`) are on `origin/communities/integration` (head `1cc4c02e1`). I checked the integration file by inspection for the findings below.

## Verdict

**NOT RELEVANT as a standalone landing.** The f45195a0 head should not land as-is. The door contract has since replaced its wire shapes (`body`/`media`/PUT `agent-grant` were replaced by `text`/`item`/POST). Its throw-on-URIError bug is fixed on integration, and it drags 7 unrelated build-line commits ahead of main. What matters now is the client on `communities/integration`. On that client: **FIX FIRST** for M1 (dot-segment ids) when integration is reviewed for main. That one is cheap to fix.

## Findings

No BLOCKER. No HIGH.

### MEDIUM

**M1. Dot-segment ids rewrite the route on a bearer-authenticated request.** Location: `src/lib/agent-runtime/communitiesClient.ts:102-109` and `:129-131` at `d52f1bd82`. The same issue is still present on integration at `communitiesClient.ts:95` and `:122-124`.
- `encodeURIComponent('..')` is `'..'`, and `validId` only checks that the id is non-empty. WHATWG URL parsing (used by fetch) then collapses the segment.
- Probe results, run under jest:
  - `deleteMine('c1','..')` sends `DELETE https://runtime.test/app/communities/c1/`
  - `leave('..')` sends `POST https://runtime.test/app/leave`
  - `getCommunity('..')` sends `GET https://runtime.test/app/`
- Failure scenario: a community id or post id from a route param (`/c/:id`, `/c/:id/join` on integration) or from a malformed server item is `.` or `..` (for example, a deep link carrying `%2E%2E`). The member's bearer is then sent with a POST or DELETE to a different runtime route than the one intended. The worst case is `DELETE` aimed at the community resource itself.
- One-line fix: in `validId`, also reject `.`, `..` and any id containing `/`. Better, match the door's id grammar, for example `/^[A-Za-z0-9_-]{1,128}$/`.

**M2. No request timeout. "Never throws" can become "never resolves".** Location: `communitiesClient.ts:147` at `d52f1bd82`; integration `:144`.
- `fetch` is called with no `AbortSignal`. The build line this branch is cut from added per-request timeouts for the atproto agent (`agentFetch`, `06235f30b`) because hung requests left the home screen spinning on cold start. This client does not get that protection.
- Failure scenario: the runtime accepts the TCP connection but stalls, as on a captive portal or a stuck worker. The promise never settles, and every React Query consumer (switcher, home, join) stays in `isLoading` with no error to show.
- One-line fix: pass `signal: AbortSignal.timeout(15_000)` (or a controller with `setTimeout`) and map an `AbortError` to `{kind:'network'}`.

**M3 (fixed on integration). The client throws on lone-surrogate ids.** Location: `communitiesClient.ts:102-109` at `d52f1bd82`.
- `communityUrl` runs outside the `try` in `request`. Probe: `await getCommunity('\uD800')` rejects with a `URIError`, which breaks the module's "never throws" contract.
- This is already fixed by `84fbf9736`, where the URL is built inside the try and the error comes back as `invalid_argument`. It is listed only so the record is complete.

### LOW

**L1. A non-string `alt` passes through `mediaRefs`.** Location: `communitiesClient.ts:272` at `d52f1bd82`.
- Probe: `post('c1','x',[{mediaId:'m', alt:{tenantId:'t'}}])` sends `{"media":[{"mediaId":"m","alt":{"tenantId":"t"}}]}`. That contradicts the report's claim that no caller can smuggle a key like `tenantId` through a request.
- This is moot on integration, where `media` was removed.
- One-line fix: `typeof m.alt === 'string' && m.alt ? {mediaId, alt} : {mediaId}`.

**L2. List elements are cast, not validated.** Location: `communitiesClient.ts:212`, `:260` and `:331` at `d52f1bd82`.
- `communities`, `posts` and export `posts` are only checked to be arrays. Each element is then cast to `Community` or `CommunityPost`.
- Failure scenario: a single malformed element (for example, one with no `author`) crashes a consumer at `post.author.is_agent` instead of returning `bad_response`.
- Integration filters items by `isObject(e) && validId(e.id)` (around `:320`). Check that the same filter covers communities.
- Fix: filter or validate each element before returning.

**L3. Branch hygiene.** If anyone wants to land T8 by itself, rebase `b828226ec` onto main rather than merging the branch. As it stands, the merge would bring in the 7 unrelated iOS/network commits. The fix-pass report already flagged this for Elliott.

## What I ran

- `git log` / `git diff` / `git show` across `main`, the f45195a0 branch, the fix pass `84fbf9736` / `0c4b597cd`, and `origin/communities/integration`.
- `corepack pnpm install --offline --frozen-lockfile --ignore-scripts` in this worktree.
- I copied the T8 client and test into this worktree as scratch files. `authToken.ts` and `config.ts` are identical between main and the T8 base. Then I ran `pnpm test src/lib/agent-runtime/__tests__/communitiesClient.test.ts`: **64/64 passed**. Jest ran it in one project, labelled iOS.
- A scratch probe test (`zzProbe.test.ts`) reproduced M1, M3 and L1. The output is quoted above.
- I deleted all the scratch files afterwards. Nothing from them is committed.
- I did not run the full suite, `pnpm lint` or `pnpm typecheck`. The integration-branch findings (M1, M2) were checked by reading the source, not by running it.
