# Community agent launch control: admins only (task 68967223)

Base: `communities/integration` @ 724e3ce45. Branch: `coord/community-agent-launch-control-a-68967223`.
Flags unchanged (EXPO_PUBLIC_COMMUNITIES_ENABLED stays default-off). No merge to integration.

## Admin field read

**`Community.viewerIsAdmin`** (`src/lib/agent-runtime/communitiesClient.ts`), optional boolean,
runtime-supplied: "the signed-in caller is a current admin of this community".

**The runtime does NOT return it yet.** Runtime task 83a25d72 stopped (runtime commit ec04791d):
the community store has no admin role and no launch/sponsor write route. So per the spec the field
is added as an optional type and read defensively. `isCommunityAdmin()`
(`src/features/communityAgent/adminGate.ts`) is true only for literal `viewerIsAdmin === true`;
absent, null, `false`, `"true"`, `1` all mean NOT admin. The app's existing membership `role`
(`owner`/`moderator`/`member`) is deliberately NOT treated as admin.

If the runtime settles on a different shape (e.g. `role: 'admin'`), only `isCommunityAdmin` and
the type need to change.

## What changed

- `adminGate.ts`: `isCommunityAdmin(community)`, fail-closed.
- `AgentLaunchControl.tsx`: the launch (sponsor) control. Returns `null` (not rendered, not
  disabled) unless the communities flag is on AND the viewer is an admin. It gates itself rather
  than trusting the caller, so any route that mounts it, including a deep link, cannot offer launch
  to a non-admin; the admin check is repeated at press time. Takes `onLaunch(communityId)`.
- `descriptor.ts`: `CommunityDescriptor.isAdmin = isCommunityAdmin(raw)` for the screen layer.
- `AgentGrantRow` and its copy (40b3876c): untouched. It is the member's "let the agent read my
  posts" grant and never offered launch; a test now pins that it renders no launch control.

## Not done / assumptions

- **No launch affordance existed anywhere in the app**, and no runtime launch route exists, so
  `AgentLaunchControl` is exported from `#/features/communityAgent` but NOT mounted on the
  community screen: mounting a button with nothing to call would be inventing the launch flow.
  When the runtime route lands, mount it next to `AgentCard` with `community` from the descriptor.
- Asked the orchestrator (qid 7223da01) to confirm field name and scope; no answer within 600s,
  proceeded on the spec's "add the type and read it defensively" path.

## Tests

`src/features/communityAgent/__tests__/launchGate.test.tsx`: admin sees control and press calls
onLaunch once; non-admin sees nothing (toJSON null); absent field sees nothing; missing community
sees nothing; flag off renders nothing for an admin; `isCommunityAdmin` truth table incl. role
`owner` -> false; AgentGrantRow has no launch control. Plus a `descriptor.test.ts` isAdmin case.

Jest (run as `NODE_ENV=test jest --forceExit --testTimeout=20000 ...`; `pnpm test` cannot set
NODE_ENV under cmd.exe on this Windows host):
- `src/features/communityAgent src/features/communities`: 7 suites, 105 tests, all pass.
- plus `src/screens/Community`: 13 suites, 172 tests, all pass.

Lint clean on all touched files. `tsc --noEmit`: 258 errors both at base 724e3ce45 and on this
branch, identical set (pre-existing client/consumer type mismatches on integration, e.g.
`CommunityPost`, `Community.role`, `AgentGrantState.agentGrant`); none introduced here.
Full repo jest suite not run.
