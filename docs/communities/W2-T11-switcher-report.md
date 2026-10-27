# Communities W2-T11: community switcher in the Home header

- **Task:** `a9d6148f`
- **Branch:** `communities/w2-switcher`
- **Base:** `569b3b240`, with these merged in by merge commits:
  - `coord/communities-w1-t1-flags-routes-f-df17dfda` (T1, head `345180401`) as `6064990bb`
  - `coord/communities-w1-t8-communities-cl-f45195a0` (T8, head `d52f1bd82`) as `937c41fcf`. `AUTONOMOUS-LOG.md` conflicted (both added it). I kept both entries.
- **Code commits:** `f584bc28e` (feature), `b5608fcf5` (test fix).
- **State key:** `selectedCommunityFeed`, in `src/state/shell/selected-community.tsx`.

## What changed

| File | What |
| --- | --- |
| `src/state/shell/selected-community.tsx` | New in-memory context holding the selected chip: `'communities'` ("All") or `` `community|${id}` ``. The default is `'communities'`. It is not persisted. |
| `src/state/shell/index.tsx` | Mounts the new provider inside the shell providers. |
| `src/features/communities/switcher/index.tsx` | `CommunitySwitcher`: a horizontal row of chips with accent handling and long-press. It returns `null` unless the flags are on. |
| `src/features/communities/switcher/CommunitySheet.tsx` | The long-press sheet, modelled on `SwitchAccountDialog`. It has "Show in Home", "Open community" (`Community` route) and "Close". Each action runs from the `control.close(cb)` callback. |
| `src/features/communities/switcher/useMyCommunitiesQuery.ts` | TanStack query around `listMyCommunities()`. Errors give an empty list (fail closed). It is only enabled with the flags on and a signed-in account. |
| `src/features/communities/switcher/util.ts` | Flag gate, entry sanitising, a hex-only accent check, and the fallback to "All" when a selected community disappears. |
| `src/features/communities/switcher/README.md` | Feature notes. |
| `src/view/com/home/HomeHeader.tsx` | Renders `<CommunitySwitcher />` above the feed tab bar when signed in. |

## Flags

| Flag | Env key | Default | Effect here |
| --- | --- | --- | --- |
| `COMMUNITIES_ENABLED` | `EXPO_PUBLIC_COMMUNITIES_ENABLED` | off | Required for the row. |
| `COMMUNITY_SWITCHER` | `EXPO_PUBLIC_COMMUNITY_SWITCHER` | off | Required for the row. |
| `LOCKED_COMMUNITY` | `EXPO_PUBLIC_LOCKED_COMMUNITY` | empty | When set (brand build), there is no row. |

When either flag is off, nothing renders and `listMyCommunities()` is never called.

## Rules checked

- **No authority from the client:** the selection never leaves the device. Nothing reads it except the switcher.
- **No network on select:** the tests check that tapping a chip or using "Show in Home" makes no `fetch` call and no extra list call.
- **Memberships only:** the chips come only from `listMyCommunities()`. A community that drops out of the list loses its chip, and the selection falls back to "All".
- **N3:** the accent is drawn only on the chip (border and a dot) and on the header row's bottom border. The test freezes the theme object and checks that it is unchanged. The accent must be a hex colour, otherwise it is ignored.
- **No PDS writes, no tenant id:** this task adds no new requests. It uses only the T8 client's list call.

## Tests

There are 15 new tests in `src/features/communities/switcher/__tests__/` (12 component tests and 3 util tests). They cover:

- flag off, communities off, and locked build: no row and no request
- the chips match the mocked memberships, in order
- a client error shows "All" only
- malformed and duplicate entries are dropped
- selecting a chip updates the shell state, with no network call
- a community that has been left disappears, and the selection falls back to "All"
- the sheet opens on long-press and closes
- "Show in Home" selects the community
- "Open community" navigates to the community
- accent on the chip and header only; the frozen theme is unchanged and a non-hex accent is ignored

Full suite: `pnpm test --bail=0 --cacheDirectory=<private temp dir>`, on Windows with the Git-bash script shell. The private cache directory was needed because concurrent worktrees share the default jest cache, which caused EPERM rename failures.

| | Suites | Tests |
| --- | --- | --- |
| Before (merged base `937c41fcf`) | 3 failed, 129 passed, 132 total | 1 failed, 28 todo, 1461 passed, 1490 total |
| After (`b5608fcf5`) | 3 failed, 131 passed, 134 total | 1 failed, 28 todo, 1476 passed, 1505 total |

The same 3 suites fail before and after. All three are environment problems, as already reported by T1 and T8:

- `__tests__/lib/string.test.ts`: the compiled locale is missing.
- `src/lib/contextEngine/__tests__/noBackgroundLocationShipped.test.ts`: CRLF checkout.
- `plugins/uiSceneLifecycle/__tests__/withUISceneLifecycle.test.js`: CRLF checkout.

Lint and typecheck:

- `pnpm lint`: no errors in the changed files. The repo has about 90 errors elsewhere, all pre-existing.
- `pnpm typecheck`: no errors in the changed files. The only errors are the missing `src/locale/locales/*/messages` modules, because locales are not compiled here.

## Not done / assumptions

- **Home feed not switched yet.** The spec says selecting a chip "sets the Home pinned feed". The `communities` and `community|<id>` descriptors don't exist in `FeedDescriptor` or the feed API until T10. Writing them into the real `selected-feed` state would persist an unknown descriptor to account storage, and Home would fall back to tab 0. So the descriptor names live only in the new switcher state, behind the same flags. T10 should read `useSelectedCommunityFeed()` and drive the feed from it.
- **Not persisted.** The selection is in-memory only. I read "client state" as not needing to survive a restart.
- **Mockup chips not built:** there is no "Following" chip, no "+ Join" chip, no lock icon and no "member" tag. The scope lists "All" plus one chip per community. Also, `Community` has no members-only field yet, and every chip is a membership anyway.
- **Strings:** new strings use Lingui. Per CLAUDE.md I did not run `intl:extract` or `intl:compile`. This fork has rendered raw message ids before when the catalog was missing (see `ApprovalCard.test.tsx`), so the catalog must be compiled before these flags are turned on.
- **No device or simulator run.** It was tested with Jest only.
- **Not run:** `wrangler` and `check:bundle` (both deny-listed). Nothing was deployed. There was no EAS, TestFlight or App Store build.
- **Process note:** during the run I accidentally ran `git checkout 569b3b240 -- .`. I restored the tree from HEAD straight away, before any commit. The full-suite result above was taken before that mistake, from the same content that is committed.
