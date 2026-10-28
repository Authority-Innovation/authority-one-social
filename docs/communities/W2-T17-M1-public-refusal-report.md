# W2-T17 M1 fix (cebc82f4 review): public refused at submit and write gate

Task `717c6681`. Base: `communities/integration` at `1201076cc`.

## Finding

`submitComposerThread` and `gateComposerWrite` accepted a public community
target, because `guardComposerPdsWrite` allows public. A public target that got
past `resolveTarget` would reach `apilib.post` and become a plain profile post.

## Change

- `src/lib/communities/composerTarget.ts`
  - `ComposerWriteRefusalReason` gains `'public-community-not-available'`. The
    guard never returns it; it still allows public, as the ruling says.
  - New `isPublicCommunityTarget(target)` and `refusePublicCommunityTarget()`.
- `src/view/com/composer/state/submit.ts`: a public community target is refused
  with `public-community-not-available` first, before the guard and before
  `apilib.post`. Nothing is sent.
- `src/view/com/composer/state/writeGate.ts`: after the unresolved check, a
  public community target is refused with `{code:
  'public-community-not-available'}` for every action (select video, restore
  draft, save draft, every publish variant), whatever route the resolution says.
- Members/paid (via `submitToCommunity`), profile and undefined: unchanged.
- `Composer.tsx` already maps `public-community-not-available` to a message, so
  it needed no change.

## Tests

- `submit.test.ts` (7 new):
  - Public, text only and with an image: refused with the typed reason. No
    `apilib.post` call, no communities client call, no PDS write.
  - A public reply is refused the same way.
  - Profile and undefined reach `apilib.post` exactly once. This is also the
    control that shows the spy works.
  - Members and paid route to `communitiesClient.post` and never reach
    `apilib.post`.
- `writeGate.test.ts`: the old test asserting "the PDS guard allows a public
  community target" through the gate now asserts the opposite. A forged
  `ok: true` public resolution is refused with `public-community-not-available`
  for every action, on both the `pds` and `communities` routes.

## Checks run

- jest on `src/lib/communities` and `src/view/com/composer` (this includes the
  submit and writeGate tests): **8 suites, 140 passed, 0 failed**. Before this
  change: 133. Run with `NODE_ENV=test node node_modules/jest/bin/jest.js`
  after `pnpm install --frozen-lockfile --ignore-scripts`. `pnpm test` cannot
  be used as-is on Windows because of the `NODE_ENV=test` prefix.
- `tsgo --project ./tsconfig.check.json` (the `typecheck` script): 82 output
  lines, all from the missing compiled locale modules (`intl:compile` is a CI
  job). No other errors.
- ESLint on the 5 changed files: clean.
- Not run: full jest, full ESLint.
- Flag check: `eas.json`, all 7 profiles: `EXPO_PUBLIC_COMMUNITIES_ENABLED`
  `"false"`, `EXPO_PUBLIC_COMMUNITY_SWITCHER` `"false"`,
  `EXPO_PUBLIC_LOCKED_COMMUNITY` `""`. Unchanged.

## Follow-up (Low, not changed here)

`apilib.post` (`src/lib/api/index.ts` ~68) has no internal guard. All current
callers are guarded (submit refuses public, members/paid and unresolved
targets before it). The design task a9c5b50e (public `group.post` binding)
should decide whether `apilib.post` takes a target and asserts on it.
