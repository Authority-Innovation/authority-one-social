# Brands

A brand build is the same app with different identity values. Each brand is a
directory here with a `brand.json`. `app.config.js` reads `brands/$BRAND/brand.json`
(`BRAND` unset means `authority-one`, the default brand). If `EXPO_PUBLIC_BRAND`
is also set it must name the same brand, or the config refuses to resolve.

A brand changes config only. It never changes a file under `src/`
(`scripts/__tests__/brandConfig.test.js` checks this).

## Fields

| Field                       | Used for                                                    |
| --------------------------- | ----------------------------------------------------------- |
| `appStoreName`              | `expo.name`                                                 |
| `displayName`               | iOS `CFBundleDisplayName` (label under the icon)            |
| `slug`, `scheme`            | `expo.slug`, `expo.scheme`                                  |
| `bundleId`                  | `ios.bundleIdentifier`                                      |
| `androidPackage`            | `android.package`                                           |
| `easOwner`, `easProjectId`  | `expo.owner`, `extra.eas.projectId`                         |
| `icons.app/ios/android`     | `expo.icon`, `ios.icon`, `android.icon`                     |
| `splash.*BackgroundColor`   | `expo-splash-screen` light/dark background, iOS and Android |
| `associatedDomains`         | iOS associated domains (paid-signing builds only)           |
| `legal.*`                   | terms, privacy and support URLs (lint requires the first 2) |
| `signature.schemes`         | Signature bounce schemes the brand may use                  |
| `signature.clientId*`       | Signature client ids; empty while Signature is off          |
| `skinId`, `lockedCommunity` | reserved for brand builds; empty for the default brand      |

`skinId`, `lockedCommunity`, `legal` and `signature` are not read by
`app.config.js` yet.

## The default brand

`authority-one` must resolve to exactly the pre-brand config.
`scripts/brand-config/base-config.golden.json` holds the base config, resolved
over 72 env combinations. The test compares against it byte for byte, with only
`version` and `ios.buildNumber` masked. Do not regenerate the golden to make
the test pass.

## Lint

`pnpm lint:brands` (`scripts/lint-brand-config.js`) checks:

- only the default brand uses the `blueskysocial` EAS owner
- bundle ids and Android packages are unique across brands
- the terms and privacy links are https URLs
- every eas build profile sets `EXPO_PUBLIC_DISABLE_AGE_ASSURANCE` explicitly
  (profiles used only as an `extends` parent are skipped)
- every `signature.schemes` entry is in `AO_SIGNATURE_SCHEMES`
  (`src/features/aoSignature/config.ts`)
