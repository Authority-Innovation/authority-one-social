# Communities W1-T14: After Pride skin stub (report)

- Task: `359bd349`
- Branch: `coord/communities-w1-t14-after-pride-s-359bd349` (loop-assigned; the spec's
  suggested name `communities/w1-afterpride-skin-stub` was not used)
- Base: `569b3b240` (fix/ao-uiscene-lifecycle). The worktree was created from `main`
  (571924785); the branch was unpushed and clean, so it was reset to the stated base
  before any work.
- Feature commit: `155d1721e`

## What changed

| File | Change |
| --- | --- |
| `src/lib/skins/afterpride.ts` | New. ALF theme set + legacy theme set, placeholder primary ramp (violet, anchored at `#7C3AED`), explicit contrast ramp (= base neutrals), `headingFont: undefined`, `alternateIconName: undefined`, `pending: true`. Comment: "Placeholder skin. Brand colours and font pending." |
| `src/lib/skins/registry.ts` | `afterprideSkin` appended to `SKIN_LIST` (last). Nothing else changed. |
| `src/lib/skins/selectable.ts` | New pure helper `selectableSkins(skins)` - drops `pending` skins. |
| `src/lib/skins/index.ts` | Re-exports `selectableSkins`. |
| `src/screens/Settings/SkinPicker.tsx` | `const skins = selectableSkins(listSkins())` instead of `listSkins()`. |
| `src/lib/skins/__tests__/afterpride.test.ts` | New, 17 tests. |

Not touched: `app.config.js`, any asset, any icon, the default skin, `authority.ts`,
`hurricanes.ts`, `ids.ts`, `types.ts`, `state/skin`.

## Did the picker already filter `pending`?

**No.** At base the picker rendered every registered skin and showed pending ones with
a "Preview - final assets pending" sub-label, so a pending skin was selectable. The
smallest fix is the one-line filter above via `selectableSkins`. The sub-label branch
in `SkinPickerRow` is now unreachable; it was left in place to keep the change minimal.

## Tests

The registry and skin definitions cannot be evaluated under jest-expo (the `#/alf` ->
Layout -> native chain, same constraint the existing `skins.test.ts` notes), so the new
suite follows the existing pattern: pure tests for `selectableSkins`, source-level
guards for the rest.

- registry imports/registers `afterprideSkin`; `afterpride.ts` has `id: 'afterpride'`,
  `pending: true`, the placeholder comment, plain-literal display name, ALF + legacy sets
- no icon (`alternateIconName: undefined`, no `skin_afterpride`), no heading font, no
  `app.config.js` entry, no asset file
- picker renders `selectableSkins(listSkins())`; `selectableSkins` drops pending, keeps
  order, treats a missing flag as live
- registry snapshot vs base: `SKIN_LIST` is exactly base order + `afterprideSkin`; the
  `defaultSkin` block is byte-identical to base; `DEFAULT_SKIN_ID` is `default`; the
  unknown-id fallback is unchanged; the legacy `themePack` seed can never yield
  `afterpride`

Full suite (`pnpm test --bail=0`, Windows, Git-bash script shell):

| | Suites | Tests |
| --- | --- | --- |
| Base `569b3b240` | 2 failed, 126 passed, 128 total | 1 failed, 28 todo, 1421 passed, 1450 total |
| Head `155d1721e` | 2 failed, 127 passed, 129 total | 1 failed, 28 todo, 1438 passed, 1467 total |

The 2 failing suites are identical on base and head and unrelated to skins (Windows
checkout line-ending/template matching):
`plugins/uiSceneLifecycle/__tests__/withUISceneLifecycle.test.js` (suite fails to run:
AppDelegate template regex) and
`src/lib/contextEngine/__tests__/noBackgroundLocationShipped.test.ts` (expected
substring contains `\n`, file is CRLF).

`pnpm typecheck` clean. ESLint and Prettier clean on changed files (also run by the
pre-commit hook).

## Flags

| Flag | Default | Notes |
| --- | --- | --- |
| (none new) | - | The skin is gated by `pending: true`, which hides it from the picker. No runtime path selects it: it is not the default, the legacy seed cannot map to it, and the picker cannot offer it. |

## Rules

- No deploy. `wrangler` and `check:bundle` are deny-listed and were not run. No PDS
  writes. No prod config, no EAS/TestFlight.
- Draft PR only. Not merged. A separate reviewer must review before ready.

## Not done / open questions

1. Brand colours, font and icon (later task). Placeholder values only.
2. Locked brand build (`EXPO_PUBLIC_BRAND_SKIN`) - later task.
3. Defence in depth (not done, out of scope): `getSkin()` still resolves a pending id
   if one were ever persisted in `activeSkin` (e.g. hand-edited storage). No in-app
   path writes it. Making `getSkin` refuse pending skins would also need a carve-out
   for the later brand-build task, so it was left for that task to decide.
4. The now-dead "Preview - final assets pending" label in the picker could be removed
   in a follow-up.
