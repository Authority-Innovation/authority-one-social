# Community agent launch control, admins only (task 1c9f639f, replaces 68967223)

Base: `communities/integration` @ e03857569. Branch: `coord/app-community-launch-control-adm-1c9f639f`.
No merge to integration, no flag change, no default change (EXPO_PUBLIC_COMMUNITIES_ENABLED untouched).

## Commits

- 7b3b93f11 feat(communityAgent): admin-only community agent launch control (flags off)
- 36e882203 test(communityAgent): screen-level launch control mount + descriptor viewerIsAdmin; lint
- (this report)

## What changed

- `src/lib/agent-runtime/communitiesClient.ts`
  - `Community.viewerIsAdmin?: boolean`.
  - `readCommunity()` maps the runtime's `viewer_is_admin` onto `viewerIsAdmin` for
    `getCommunity`, `listMyCommunities` and `join`: `true` only for a literal boolean `true`
    (`false`, `"true"`, `1` -> `false`). A payload without `viewer_is_admin` passes through
    unchanged with no `viewerIsAdmin` (absent = not admin). A camelCase `viewerIsAdmin` key in the
    payload is dropped, so only the runtime's snake_case field can grant admin.
  - `launchCommunityAgent(id)` -> `POST /app/communities/:id/agent/launch`, no body, never throws,
    returns `CommunitiesResult<null>` (response body ignored).
- `src/features/communityAgent/isCommunityAdmin.ts`: true ONLY for `viewerIsAdmin === true`.
  The membership `role` (`owner`/`moderator`) is never consulted. Kept out of the client module so
  screen tests that mock the client wholesale still get the real gate.
- `src/features/communityAgent/AgentLaunchControl.tsx`: "Launch community agent" button. Returns
  `null` (not disabled) unless the communities flag is on AND `isCommunityAdmin`. Success replaces
  the button with "Community agent launched." and calls `onLaunched`; failure shows an error and
  changes nothing else (button stays, no launched state, `onLaunched` not called).
- `src/screens/Community/descriptor.ts`: `CommunityDescriptor.viewerIsAdmin` from the client field.
- `src/screens/Community/index.tsx`: `<AgentLaunchControl community={community} />` mounted directly
  under `<AgentCard>`. It is mounted even when AgentCard hides itself (no agent configured yet), since
  that is exactly when an admin needs to launch.
- `AgentGrantRow` and its copy: untouched.

## Tests

Run as `NODE_ENV=test node node_modules/jest/bin/jest.js --forceExit --testTimeout=20000 ...`
(`pnpm` is not on PATH on this host; the worktree had no node_modules, so `node_modules` is a
junction to the `03067be4` worktree's install, whose package.json/pnpm-lock.yaml are identical to
this base).

- `src/features/communityAgent src/features/communities`: 7 suites, 107 tests, all pass.
- `src/screens/Community src/lib/agent-runtime/__tests__/communitiesClient*`: 8 suites, 184 tests, all pass.

New cases (`src/features/communityAgent/__tests__/launchControl.test.tsx`): admin sees the control
and one press launches once with the id; plain member (`false`) sees nothing; owner/moderator role
without `viewerIsAdmin` sees nothing; absent `viewerIsAdmin` sees nothing; former admin (rerender
from `true` to `false`) sees nothing; no community sees nothing; flag off renders nothing for an
admin; launch failure shows the error, keeps the button, no launched state, no `onLaunched`, and a
retry can then succeed. `isCommunityAdmin` truth table. Client: launch method/path/no body, 403 typed
error, un-encodable id, `viewer_is_admin` mapping truth table. Screen: admin sees the control under
the agent card; owner without the field and former admin do not. Descriptor: `viewerIsAdmin` case.

Lint: clean on every file added or changed here (pre-existing errors remain in
`communityAgent/types.ts`, `labelRule.ts`, `CommunityThreadPost.tsx`, untouched).
`tsc --noEmit`: 212 errors on this branch; none are in lines added here (the ones in touched files
are the pre-existing integration mismatches: `Community.role`, `CommunityTimelinePage.posts`,
descriptor test fixture). Full repo jest suite not run.

## R2

R2 (`POST /app/communities/:id/agent/launch`) is not merged on this branch and this repo contains no
runtime; **not merged; tested against the contract** (mocked fetch / mocked client). R1
(`viewer_is_admin`) likewise tested against the contract only.

## Assumptions

- R2's success response body is not used; any 2xx is "launched". The error message shown is generic.
- After a successful launch nothing is refetched; the parent can pass `onLaunched` to invalidate the
  community query once R2's response shape is settled.
