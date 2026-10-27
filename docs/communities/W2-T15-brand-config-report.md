# Communities W2-T15: brand config and config lint

- Task: `0bf1fa47`
- Branch: `communities/w2-brand-config`
- Base: `569b3b240` (build line) with T1 (`coord/communities-w1-t1-flags-routes-f-df17dfda`)
  and T4 (`coord/communities-w1-t4-merge-signatur-a4ed5eb7`) merged in with merge
  commits. The merged base is `baaf33d39`.
- Base merge note: the T4 merge had an add/add conflict in `AUTONOMOUS-LOG.md`.
  I kept both entries (T1's, then T4's). No other conflicts.

## What changed

- `brands/authority-one/brand.json` is the default brand. It holds displayName,
  appStoreName, slug, scheme, bundleId, androidPackage, easOwner, easProjectId,
  skinId (empty), lockedCommunity (empty), associatedDomains, icons, splash
  colours, legal URLs, and Signature schemes and client ids. The client ids are
  empty because Signature is off.
- `scripts/brand-config/loadBrand.js` resolves and loads the brand file. It
  rejects an invalid name, a missing file and any missing required field.
- `app.config.js` now reads `brands/$BRAND/brand.json`. If `BRAND` is unset it
  uses `authority-one`. The body moved into `appConfigForBrand(brand)`, which the
  tests call with fixture brands. Indentation and comments are unchanged.
- `scripts/lint-brand-config.js` (`pnpm lint:brands`): the brand config lint.
- `brands/README.md`: the fields, the golden and the lint rules.
- `eslint.config.mjs`: the brand scripts and their tests may import Node
  builtins (the same override `bskyogcard` and `dev-env` use).
- `src/`: no change.
- `eas.json`: no change.
- No `brands/afterpride/`.

### Literals replaced

Line numbers are on base `569b3b240`, as in the spec. The `->` column gives the
line in the new `app.config.js`.

| Base line | Literal                                             | Now                                | ->      |
| --------- | --------------------------------------------------- | ---------------------------------- | ------- |
| :109      | `'applinks:authority-one.com'`                      | `...BRAND.associatedDomains`       | 203     |
| :123      | `IOS_ICON_FILE` `'./assets/app-icons/ios_icon_default_next.png'` | `BRAND.icons.ios`     | 217     |
| :134      | name `'Authority-One'`                              | `BRAND.appStoreName`               | 228     |
| :135      | slug `'one'`                                        | `BRAND.slug`                       | 229     |
| :136      | scheme `'one'` (both places in T4's ternary)        | `BRAND.scheme`                     | 234-235 |
| :137      | owner `'blueskysocial'`                             | `BRAND.easOwner`                   | 236     |
| :141      | icon `'./assets/app-icons/ios_icon_default_next.png'` | `BRAND.icons.app`                | 240     |
| :149      | bundleIdentifier `'com.authorityone.app'`           | `BRAND.bundleId`                   | 248     |
| :171      | CFBundleDisplayName `'authority-one'`               | `BRAND.displayName`                | 270     |
| :320      | android icon `'./assets/app-icons/android_icon_default_next.png'` | `BRAND.icons.android` | 419   |
| :327      | package `'com.authorityone.app'`                    | `BRAND.androidPackage`             | 426     |
| :482      | iOS splash `'#F4F0E8'`                              | `BRAND.splash.backgroundColor`     | 581     |
| :487      | iOS splash dark `'#110C09'`                         | `BRAND.splash.darkBackgroundColor` | 586     |
| :493      | Android splash `'#F4F0E8'`                          | `BRAND.splash.backgroundColor`     | 592     |
| :497      | Android splash dark `'#110C09'`                     | `BRAND.splash.darkBackgroundColor` | 596     |
| :572      | projectId `'55bd077a-...'`                          | `BRAND.easProjectId`               | 671     |

## Byte compare (hard rule)

The default brand resolves byte-identical to the base.

- Env matrix, 72 cases: `EXPO_PUBLIC_ENV` {dev, testflight, production} x
  `PAID_SIGNING` {unset, 1} x `EAS_BUILD_PLATFORM` {unset, ios, android} x
  Signature {off, on} x Sentry {off, on}.
- One-off check (run before committing): the base `app.config.js` from
  `baaf33d39` and the new one were resolved side by side. Result: 72 of 72
  identical as full JSON (799,416 bytes in total), with nothing masked.
- Committed test (`scripts/__tests__/brandConfig.test.js`): it compares against
  `scripts/brand-config/base-config.golden.json`. That golden file was written
  from the unmodified `app.config.js` and committed alone, in `6ac319e91`,
  before `app.config.js` changed. It holds a sha256 per case and the full
  default config. Only `version` and `ios.buildNumber` are masked, so a
  TestFlight build-number bump does not break it. Result: 0 diffs with `BRAND`
  unset, and 0 diffs with `BRAND=authority-one`.
- Mutation check: I changed one splash colour in `brand.json`, and 3 compare
  tests failed. I then restored the file.

## Lint rules

| Rule            | Check                                                                                                      | Fixture                                                     |
| --------------- | ---------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| `owner`         | Only the default brand may have the `blueskysocial` owner.                                                 | `fixture-owner-blueskysocial`                               |
| `bundle-id`     | iOS bundle ids and Android packages are unique across brands.                                              | `fixture-duplicate-bundle-id`                               |
| `legal`         | `legal.termsOfService` and `legal.privacyPolicy` are https URLs.                                           | `fixture-missing-legal`                                     |
| `age-assurance` | Every eas build profile sets `EXPO_PUBLIC_DISABLE_AGE_ASSURANCE`, directly or through `extends`.           | `eas-missing-age-assurance.json`                            |
| `scheme`        | Each `signature.schemes` entry is in `AO_SIGNATURE_SCHEMES`. The list is read from `src/features/aoSignature/config.ts`, so it has a single source. | `fixture-scheme-not-allowed` |

The lint passes on the repo: `brand config lint: ok (authority-one)`.

## Tests

- `scripts/__tests__/brandConfig.test.js` (9 tests):
  - The golden covers all 72 cases.
  - The config is byte-identical with `BRAND` unset.
  - The config is byte-identical with `BRAND=authority-one`.
  - The default config matches field for field.
  - A missing `BRAND` falls back to `authority-one`.
  - An unknown brand or a path-traversal name is refused.
  - A `BRAND` that disagrees with `EXPO_PUBLIC_BRAND` is refused.
  - A fixture brand's values reach the config.
  - Resolving every brand (real and fixture) leaves `src/` byte-identical. The
    test takes a sha256 of the file list under `src/` before and after, and
    checks that no resolved config points into `src/`.
- `scripts/__tests__/lintBrandConfig.test.js` (8 tests):
  - The allow-list is read correctly.
  - The default brand passes.
  - A valid fixture passes.
  - Each rule has a fixture that fails it alone. The `blueskysocial` owner
    fixture is one of them.

### Full suite

The command was `pnpm test --bail=0` on Windows, with bash as the script shell.

|        | Suites                    | Tests                                |
| ------ | ------------------------- | ------------------------------------ |
| Before | 148 passed, 2 failed, 150 | 1614 passed, 1 failed, 28 todo, 1643 |
| After  | 150 passed, 2 failed, 152 | 1631 passed, 1 failed, 28 todo, 1660 |

The same 2 suites fail before and after. Neither involves a file this task
touched:

- `plugins/uiSceneLifecycle/__tests__/withUISceneLifecycle.test.js`
- `src/lib/contextEngine/__tests__/noBackgroundLocationShipped.test.ts`

The second failure is a string-match against source that has CRLF line endings.
This is a Windows checkout artefact, and earlier wave reports show it too.

Other checks:

- `pnpm typecheck`: clean.
- ESLint on the touched files: clean.

## Flags

| Flag                                | Default         | Note                                                  |
| ----------------------------------- | --------------- | ----------------------------------------------------- |
| `BRAND` (build env)                 | `authority-one` | New. Unset means the default brand, the same as base. |
| `EXPO_PUBLIC_BRAND`                 | `authority-one` | T1's flag. Not changed. Must agree with `BRAND` when set. |
| `EXPO_PUBLIC_BRAND_SKIN`            | empty           | T1's flag. Not touched (out of scope).                |
| `EXPO_PUBLIC_AO_SIGNATURE_*`        | unset           | Not touched. Signature stays dark.                    |

## Not done / constraints

- No After Pride brand, because there are no assets yet.
- No locked skin.
- No EAS build, no prebuild, no submission, no deploy.
- `wrangler` and `check:bundle` were not run. Both are deny-listed.
- No PDS writes. This task has no runtime code.
- `eas.json` was not touched (T1 owns it).
- `brand.json` fields not read by `app.config.js` yet: `skinId`,
  `lockedCommunity`, `legal` and `signature`. The lint uses `legal` and
  `signature`. The runtime still takes its legal URLs from
  `src/lib/constants.ts`.

## Assumptions and open questions

1. **Signature scheme rule.** The default brand's app scheme is `one`, which is
   not in `AO_SIGNATURE_SCHEMES` and must stay `one` for the byte-identical
   rule. So the lint checks the brand's Signature bounce schemes
   (`signature.schemes`), not its app scheme. Is that the intended rule?
2. **Age-assurance rule.** `base` in `eas.json` does not set
   `EXPO_PUBLIC_DISABLE_AGE_ASSURANCE`, and every profile that extends it does.
   The lint treats a profile used only as an `extends` parent as a template and
   skips it. The alternative is to add the key to `base`, which is T1's file.
3. **`BRAND` vs `EXPO_PUBLIC_BRAND`.** The spec names `BRAND`. T1's eas profiles
   set `EXPO_PUBLIC_BRAND`. The config refuses to resolve if both are set and
   differ. It does not read `EXPO_PUBLIC_BRAND` as a fallback.
4. **Not in the spec's literal list, still hard-coded:**
   - Android intent-filter host `authority-one.com` (base :335)
   - adaptive-icon background `#F4F0E8` (:324)
   - `primaryColor` (:143)
   - `CFBundleSpokenName` (:193)
   - the location and contacts permission strings
   - the updates URL

   A real second brand will probably need some of these.
5. **Tooling.** `pnpm` is not on PATH on this machine. I ran it through
   `corepack pnpm`, with a temporary shim outside the repo. The install
   postinstall ran `lingui compile`, whose output is gitignored. Nothing was
   extracted or committed.
