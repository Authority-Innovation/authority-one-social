# Review: 359bd349 Communities W1-T14 - After Pride skin stub

- Review task: `36803a05` (REVIEW ONLY, no code changed)
- Reviewed: `origin/coord/communities-w1-t14-after-pride-s-359bd349`
  - `155d1721e` feat(skins): After Pride placeholder skin, pending and hidden from the picker
  - `dc04cff62` docs: T14 report + AUTONOMOUS-LOG.md
- `main` tip at review time: `571924785`. **The T14 work is NOT on main**, and it is not on
  `origin/communities/integration` either. No other remote branch has `src/lib/skins/afterpride.ts`.
- The bus record and earlier result for 359bd349 could not be read directly (this session has no
  bus-read tool). I reviewed from the branch, its commit messages and its own report
  (`docs/reports/communities-w1-t14-afterpride-skin-stub.md`).
- `[after:7a89266e]`: that sha does not exist in this repo, so I could not check the dependency.

## Verdict

**CAN LAND** - as a cherry-pick of `155d1721e` only, NOT a merge of the branch (see HIGH-1).

## Findings

### BLOCKER

None.

### HIGH

**HIGH-1 - The branch carries 7 unrelated iOS/network commits under T14.**
`git log main..origin/coord/communities-w1-t14-after-pride-s-359bd349` shows 9 commits. Only 2
are T14. The other 7 come from the base `569b3b240` (fix/ao-uiscene-lifecycle): UIScene lifecycle
plugin, `react-query.tsx` offline latch, iOS build bump 35->36, `app.config.js`, and so on. The
author reset the branch onto that base on purpose.
- Failure scenario: someone merges this PR to `main` as "a small skin stub". That ships
  the UIScene lifecycle change and the network/react-query change, plus a build number bump,
  without their own review or a TestFlight check.
- Fix: land only `155d1721e` (cherry-pick, or rebase the feature commit onto the target
  branch). I checked this with `git merge-tree`: `155d1721e` applies cleanly to `main` and to
  `origin/communities/integration`. Skins and SkinPicker are byte-identical between `main` and
  the base.

### MEDIUM

**MEDIUM-1 - `AUTONOMOUS-LOG.md` add/add conflict with integration.** `dc04cff62` creates
`AUTONOMOUS-LOG.md`. `origin/communities/integration` already has its own version of that file, so
`git merge-tree` reports `CONFLICT (add/add)`.
- Failure scenario: landing both commits on integration stops with a conflict, or the
  integration log gets clobbered.
- Fix: land the feature commit plus the report file only, and append the log entry by hand
  (or drop it).

**MEDIUM-2 - `getSkin()` still resolves a pending id** (`src/lib/skins/registry.ts:58`,
`src/state/skin/index.tsx:28-31,56,76-78`). `readInitialSkinId` and `onUpdate('activeSkin')`
trust any persisted string. If `activeSkin` is ever `'afterpride'`, the whole app reskins to
placeholder violet, and the picker shows no checked row because that skin is filtered out.
Possible causes: a dev build or test harness that called `setSkin('afterpride')`, a later
brand-build task's state leaking, or hand-edited storage. No in-app path writes it today, and
the author flagged this. Decision N3 says this skin must "never reskin the AO app", but the
filter only enforces that at the UI edge.
- Fix: in the skin Provider, map an id whose skin is `pending` to `DEFAULT_SKIN_ID`
  (`getSkin(id).pending ? DEFAULT_SKIN_ID : id`). Leave the brand-build carve-out to that task.

### LOW

**LOW-1 - Stale `pending` doc** (`src/lib/skins/types.ts:101-106`): it still says "The picker
surfaces this so a stand-in skin is never mistaken for the finished look". The picker now hides
pending skins instead.
- Fix: change it to "pending skins are registered but filtered out of the picker
  (`selectableSkins`)".

**LOW-2 - Dead label branch** (`src/screens/Settings/SkinPicker.tsx:77-81`): the "Preview -
final assets pending" sub-label can no longer render. The author left it on purpose to keep the
diff small.
- Fix: remove it in a follow-up, or keep it if the brand-build task will show pending skins.

**LOW-3 - The tests are mostly source-text regexes** (`src/lib/skins/__tests__/afterpride.test.ts:61-161`),
for example `/const skins = selectableSkins\(listSkins\(\)\)/` and a byte-identical `defaultSkin`
snapshot. This follows the existing `skins.test.ts` pattern, since jest-expo cannot evaluate the
registry. But any harmless reformat or rename breaks them, and they show the text is present,
not that the behaviour works.
- Fix: acceptable for now. When the registry can be imported under jest, replace them with
  behavioural tests.

**LOW-4 - Placeholder skin themes are built at startup** (`src/lib/skins/afterpride.ts:81-88`,
`:111-115`). `createThemes` and three legacy theme clones run when the module loads, for a skin
nobody can pick. The cost is small (the other skins do the same).
- Fix: none needed now. Build lazily if more pending skins pile up.

## Checked and fine

- No icon: `alternateIconName: undefined`, so `applySkinAppIcon` is a no-op. No
  `app.config.js` entry and no asset was added.
- No heading font: `headingFont: undefined`.
- `displayName: 'After Pride'` is a plain literal, which matches the registry convention for proper
  nouns.
- The default skin is unchanged, and `DEFAULT_SKIN_ID` is still `'default'`. The legacy `themePack`
  seed can never map to `afterpride`, and `legacyThemePackFromSkinId('afterpride')` returns
  `'default'`.
- `selectableSkins` is pure, keeps the order, and treats a missing `pending` flag as live. Hurricanes
  (`pending: false`) and Authority (no flag) still appear in the picker.
- `SkinId` is `string`, so no union type needed changing.

## What I ran

Run in this review worktree on detached `155d1721e` (the worktree was returned to its task
branch afterwards; no source changes):

- `corepack pnpm install --offline --frozen-lockfile`. One tarball,
  `@bsky.app/expo-dynamic-app-icon-1.8.5`, was missing from the local store. pnpm's automatic
  pre-test dependency check then downloaded it from registry.npmjs.org. That was the only
  off-machine fetch, and it was a package download, not a deploy. I added a local `pnpm` shim
  under `node_modules/.shim` (git-ignored) so the postinstall could find pnpm.
- `pnpm test src/lib/skins src/screens/Settings src/state/skin` (Git-bash script shell):
  **6 suites, 63 tests, all passed**, including `afterpride.test.ts`, `skins.test.ts` and
  `skinPicker.test.ts`.
- `pnpm typecheck` (tsgo): **clean** (exit 0).
- `pnpm exec eslint src/lib/skins src/screens/Settings/SkinPicker.tsx`: **clean**.
- I did not run the full suite. The author reports base 1421 passed / 1 failed, head 1438
  passed / 1 failed, with a pre-existing CRLF failure.
- `git merge-tree` checks: the feature commit is clean on `main` and on
  `communities/integration`, and the docs commit conflicts on integration (`AUTONOMOUS-LOG.md`).
