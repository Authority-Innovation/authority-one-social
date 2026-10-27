# Autonomous build log

## 2026-10-28 - Communities W1-T1 flags + routes (task df17dfda)

- Branch `coord/communities-w1-t1-flags-routes-f-df17dfda`, base `569b3b240`, feature head `322245a40`.
- Changed: 5 dark env flags in `src/env/common.ts` (all off/empty, `BRAND` = `authority-one`); same keys set to defaults in all 7 `eas.json` profiles; `Community` `/c/:id` and `CommunityMembers` `/c/:id/members` in routes, types and `commonScreens`; placeholder `src/screens/Community` that renders nothing; flag off -> `/c/...` deep links land on Home.
- Tests: +10 (3 suites). Full suite 1421 -> 1431 passed; the same 2 pre-existing suite failures before and after (Windows CRLF artefacts).
- Verdict: done, draft PR, awaiting a separate reviewer.
- NOT done: no real community screen, no API, no intl extraction, no device test, no Cloudflare deploy CLI or check:bundle (deny-listed), no deploy or EAS build.
- Report: `docs/communities/W1-T1-flags-routes-report.md`.

## 2026-10-28 – Communities W1-T4: merge Signature P2b dark (task a4ed5eb7)

- **Changed:** merged `feat/social-ao-signature-p2b` (589e00164) into the build
  line at 569b3b240 with a merge commit (da1fce83f). There were no conflicts.
  Added `src/screens/Login/__tests__/signInDark.test.tsx`: a snapshot taken at
  the pre-merge base, which the merged sign-in screen must match.
- **Branch:** `coord/communities-w1-t4-merge-signatur-a4ed5eb7`. Draft PR only.
- **Verdict:** Signature stays dark. No `EXPO_PUBLIC_AO_SIGNATURE_*` value is
  set anywhere. With it off, the bearer stays the PDS JWT. The scheme stays
  `one`. The parity, bearer call-site and dark tests pass. Full suite: no new
  failures compared with the base. The 2 CRLF failures were already there on
  this Windows checkout.
- **NOT done:** Signature is not on for anyone. No runtime allow-list entries.
  No deploy, no EAS build, no `wrangler` or `check:bundle` (deny-listed). Not
  reviewed yet: a separate reviewer must review before the PR is marked ready.
- Full report: `docs/communities/W1-T4-merge-p2b-dark-report.md`.
