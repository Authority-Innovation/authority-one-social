# Communities: App Store name clearance checklist

Wave 1, task T16. Docs only. **Checklist only. Nothing is submitted, reserved or registered by this task.** No App Store Connect, Play Console, EAS or TestFlight action is taken.

## Known facts (plan fact C5)

- The App Store name for the main app is **`Authority-One`**. It is in `app.config.js:134` (`name`).
- The on-device label (under the icon) is **`authority-one`**. It is in `app.config.js:171` (`CFBundleDisplayName`).
- The name **"One"** was refused by App Store Connect with **ITMS-90129** (the name is already in use by another app). The slug and scheme are still `one` (`app.config.js:135-136`); those are not store-facing names, but see the scheme row below.
- iOS bundle id and Android package are both `com.authorityone.app` (`app.config.js:149`, `:327`).

Lesson from C5: a short, generic word is likely to be taken. Clear the name before any build that uses it is uploaded, because the name is checked at upload time.

## Checklist per brand

Tick each box by hand. "Owner" is the human who does it; a builder session never does any of these steps.

### 1. Authority One (main app)

| # | Check | Value | Status |
| --- | --- | --- | --- |
| 1.1 | App Store name accepted | `Authority-One` | Done (C5) |
| 1.2 | On-device label fits under the icon without truncation (about 12 characters on iPhone [verify]) | `authority-one` (13 characters) | [verify on device] |
| 1.3 | Name refused before, recorded | "One", ITMS-90129 | Done (C5) |
| 1.4 | Play Store title | [verify] | [ ] |
| 1.5 | Bundle id / package unchanged by the communities work | `com.authorityone.app` | [ ] confirm after brand config lands |
| 1.6 | URL scheme `one` does not clash with a brand scheme | `one` | [ ] |
| 1.7 | Subtitle and keywords do not name a community brand (After Pride, Between Two Beers) without its written permission | n/a | [ ] |

### 2. After Pride (white-label build, locked to one community)

| # | Check | Value | Status |
| --- | --- | --- | --- |
| 2.1 | Search App Store and Google Play for exact and near names | "After Pride" | [ ] |
| 2.2 | If taken, pick a fallback and clear it too (for example with a hyphen, as C5 did) | [verify with brand] | [ ] |
| 2.3 | Trademark search in the launch markets | "After Pride" | [ ] (owner or counsel) |
| 2.4 | Written permission from the brand owner to publish under their name, and who the seller of record is | n/a | [ ] |
| 2.5 | On-device label chosen and fits under the icon | [verify with brand] | [ ] |
| 2.6 | Bundle id and Android package distinct from `com.authorityone.app` | in `brands/afterpride/brand.json` [new] | [ ] |
| 2.7 | URL scheme distinct from `one` and from every other brand | in `brand.json` | [ ] |
| 2.8 | OAuth client for Sign in with Authority Signature registered for this scheme | in `brand.json` | [ ] |
| 2.9 | Separate EAS project id (not the one at `app.config.js:572`) | in `brand.json` | [ ] |
| 2.10 | Legal links (terms, privacy) are the brand's own | in `brand.json` | [ ] |
| 2.11 | Placeholder note "Placeholder skin. Brand colours, font and icon pending." removed before any store build | n/a | [ ] |
| 2.12 | Guideline 4.3 (spam / copycat apps) risk reviewed: several white-label apps from one codebase can be rejected [verify current guideline] | n/a | [ ] |

### 3. Between Two Beers (community inside the AO app)

No brand build is planned in the mockups; Between Two Beers appears only as a community inside the AO app. If one is planned later, copy section 2. Until then:

| # | Check | Status |
| --- | --- | --- |
| 3.1 | Permission to show the Between Two Beers name and artwork inside the AO app | [ ] |
| 3.2 | The name is not used in the AO app's store listing without permission | [ ] |

### 4. Template for any later brand

Copy section 2 and replace the name. Existing skins in `src/lib/skins/registry.ts:38` (`authority`, `hurricanes`) are in-app skins, not brand builds; whether either becomes a brand build is not specced [verify].

## Not done by this task

- No name was searched or reserved.
- No `brand.json` was written.
- No store listing, build or submission was touched.
