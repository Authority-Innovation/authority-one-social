# Communities W2-T9: join and consent screen (task cfbd6f15)

## Branch and base

- Branch: `communities/w2-join-consent` (draft PR, never merged by the builder).
- Base: `569b3b240` (build line), then two merge commits:
  - `5ffec5997` merges T1 `origin/coord/communities-w1-t1-flags-routes-f-df17dfda` (head `345180401`).
  - `41a6c2e55` merges T8 `origin/coord/communities-w1-t8-communities-cl-f45195a0` (head `d52f1bd82`). The only conflict was `AUTONOMOUS-LOG.md` (both added it). Both entries were kept, T1 first.
- Feature commit: `fcbab086e`. The report and log follow in a later commit.
- Note: the worktree was first created at `571924785` (main). That commit is an ancestor of `569b3b240`. The branch was reset to `569b3b240` before the merges. Nothing had been pushed yet, so no force-push was needed.

## What changed

| File | Change |
| --- | --- |
| `src/screens/Community/JoinConsent.tsx` | New. `CommunityJoinScreen`, laid out like mockup (d). |
| `src/screens/Community/consent.ts` | New. `agreeAndJoin`, `consentVersionFor`, `CONSENT_WORDING_VERSION = '1'`, `JoinConsentConfig`. |
| `src/screens/Community/__tests__/JoinConsent.test.tsx` | New. 17 tests. |
| `src/routes.ts`, `src/lib/routes/types.ts`, `src/Navigation.tsx` | Adds `CommunityJoin: '/c/:id/join'` next to the T1 routes. Params are `{id: string; invite?: string}`. |
| `src/screens/Community/linking.ts` | Adds `CommunityJoin` to `COMMUNITY_ROUTE_NAMES`, so a deep link with the flag off lands on Home. |
| `src/screens/Community/index.tsx` | Exports T1's `useCommunitiesDisabledFallback` so the new screen can reuse it. |
| `src/screens/Community/__tests__/routeTable.test.ts` | Adds `CommunityJoin` to the filter of new routes. The snapshot of existing routes is unchanged. |

The logic file is `consent.ts`, not `joinConsent.ts`. On a case-insensitive filesystem (Windows, macOS default), `joinConsent.ts` and `JoinConsent.tsx` resolve to the same module.

### Behaviour

- **Consent comes first.** `join` is called only from "Agree and join". The button is disabled until the consent box is ticked. `agreeAndJoin` also refuses without consent (`no_consent`), so a second guard sits below the UI.
- **Consent version.** `join(id, consentVersion)` uses `consentVersion` from the community config (`getCommunity(id)`). If the config does not name one, it falls back to this build's wording version, `'1'`. The footer shows the version being agreed to: "Consent version {v} · saved with your membership."
- **Being asked again.** The screen does not skip consent for people who are already members. If a later config version shares more, the community home (T12) can send a member back here, and joining again records the new version.
- **Agent grant.** The toggle is off by default. `setAgentGrant(id, true)` is called only after a successful join, and only if the toggle is on. It is never called with `false`, never called when the join fails, and never called before the join. If the grant fails, the membership stays and the success state says so.
- **Invites.** `route.params.invite` is never read. A test opens the screen with `invite` set: the box is unticked, the button is disabled, and neither `join` nor `setAgentGrant` is called.
- **Flag.** With `EXPO_PUBLIC_COMMUNITIES_ENABLED` off, a deep link to `/c/:id/join` lands on Home (T1 linking). An in-app push renders nothing, goes Home, and never fetches the config.
- **No PDS.** All calls go through T8's `communitiesClient` (`getCommunity`, `join`, `setAgentGrant`). The screen makes no `com.atproto.repo.*` call and no `uploadBlob`.

## Tests

The suite was run with `corepack pnpm --config.script-shell="C:/Program Files/Git/bin/bash.exe" test --bail=0` on Windows. The `pnpm test` script needs bash for `NODE_ENV=test`, and `--bail=0` gives complete counts.

| | Suites | Tests |
| --- | --- | --- |
| Before (merged base `41a6c2e55`) | 2 failed, 130 passed, 132 total | 1 failed, 28 todo, 1495 passed, 1524 total |
| After (`fcbab086e`) | 2 failed, 131 passed, 133 total | 1 failed, 28 todo, 1512 passed, 1541 total |

There are 17 new tests, all passing. The same two suites fail before and after, and neither is touched by this change:

- `src/lib/contextEngine/__tests__/noBackgroundLocationShipped.test.ts`: a string match expects `\n`, but the Windows checkout has CRLF.
- `plugins/uiSceneLifecycle/__tests__/withUISceneLifecycle.test.js`: the suite fails to load because the `AppDelegate.swift` template does not match.

How the required tests map:

| Required | Test |
| --- | --- |
| "Agree and join" disabled until ticked | `keeps “Agree and join” disabled until the box is ticked` |
| No `join` before tick and press | `makes no join call before the box is ticked and the button pressed`, `agreeAndJoin › never calls join without consent` |
| `join` gets the config's consent version | `joins with the consent version from the community config` (config `'3'` → `join('btb', '3')`) |
| Grant not set unless toggle on | `does not set the agent grant when the toggle is left off`, `sets the agent grant after joining when the toggle is on` (also checks order), `does not set the agent grant when the join fails` |
| Invite link does not call join | `does not call join when opened from an invite link`, `carries an invite as a plain param, nothing more` |
| Flag off: unreachable | `is unreachable with the flag off: renders nothing and goes Home`, `CommunityJoin route › lands on Home with the flag off` |

Other checks:

- `pnpm typecheck` is clean. The install's postinstall ran `lingui compile` automatically, so the locale modules exist in this worktree. I did not run `intl:extract` or `intl:compile` myself.
- `eslint` passes on all touched files. The one warning is in T1's `flags.test.ts`.
- The pre-commit hook (lint-staged) ran and passed.

The screen tests mock ALF, Layout, Button, Toggle and Link: their native modules cannot load under jest. This follows the pattern in `AgentGrid.test.tsx`. The tests check behaviour (disabled state, calls, call order), not visual layout. Nothing was tested on a device.

## Copy checked against mockup (d)

| Mockup (d) | Screen | Match |
| --- | --- | --- |
| Join community (sheet title) | Header "Join community" | same |
| Community card: name, "Run by Between Two Beers · Members only" | `{name}`, "Run by {sponsor} · Members only" | same, from config |
| Before you join: here is what membership shares, and with whom. | same | same |
| ✓ Your name, handle and picture (the same profile you use everywhere on Authority One) | Title plus "The same profile you use everywhere on Authority One." | same, the parenthetical is a detail line |
| ✓ Posts and replies you make here (members only, kept in this community's private store, not your public account) | "Members only, kept in this community’s private store, not your public account." | same |
| ✗ Your posts in other communities (each community is separate, nothing crosses over) | "Each community is separate. Nothing crosses over." | same |
| ✗ A public record that you joined (your membership is not written to the open network) | "Your membership is not written to the open network." | same |
| The community agent | same | same |
| Steve is here ◆ Agent | "{agent} is here" plus "◆ Agent" | same |
| Steve is an AI agent run by Between Two Beers. He answers questions in threads, always labelled as an agent, and cites the episode he used. For the show's numbers he sees totals only, never your profile. | "{agent} is an AI agent run by {sponsor}. It answers questions in threads, always labelled as an agent, and cites the source it used. For the community’s numbers it sees totals only, never your profile." | **changed**: generic across communities. "he" → "it", "episode" → "source", "the show's" → "the community’s" |
| Your own agent (optional) | same | same |
| Let Bob read this community for me (off by default) | "Let {my agent} read this community for me", off by default | same. The name is the person's first owned agent. The section is hidden if they have no agent |
| Bob can give you recaps of threads you can already see. You can turn it off any time. | same, with the agent's name | same |
| Rules and links / Community rules / sample rules text | "Rules and links", "Community rules", `rulesText` from config | same |
| Between Two Beers terms and privacy | "{sponsor} terms and privacy" (link to `termsUrl` or `privacyUrl`) | same, shown only if the config has a URL |
| Leaving: leave any time; you can export or delete your posts first. | "Leaving" / "Leave any time. You can export or delete your posts first." | same |
| I've read what joining shares and I agree to the community rules. | same, with a typographic apostrophe | same |
| Consent version 1 · saved with your membership. | "Consent version {v} · saved with your membership." | same; v comes from config, falling back to 1 |
| Agree and join / Not now | same | same |
| You're in. Welcome to Between Two Beers Listeners. Go to the community. | "You’re in." / "Welcome to {name}." / button "Go to the community" | same |

Added copy that is not in the mockup:

- Load error: "We couldn’t load this community. Please try again." with a "Try again" button.
- Join error: "Couldn’t join right now. Please try again."
- Grant failure after a successful join: "{agent} couldn’t be turned on for this community. You can try again from the community."

## Flags

| Flag | Default | Effect here |
| --- | --- | --- |
| `EXPO_PUBLIC_COMMUNITIES_ENABLED` (T1) | off | Off: `/c/:id/join` deep links land on Home. In-app pushes render nothing and go Home. |

No new flags.

## Not done / not in scope

- Community home (T12) and feed (T10).
- No PDS writes. No deploy, EAS, TestFlight or App Store build.
- I did not run `wrangler` or `check:bundle`; both are deny-listed.
- No device or simulator run.
- No `intl:extract`. New strings are picked up by the nightly CI job.
- It is a full screen, not a bottom sheet, because it is a route. The content order follows the sheet in mockup (d).

## Open questions

1. **Config fields.** T8's `Community` type has no fields for sponsor name, agent display name, rules text, terms or privacy URL, or members-only. The screen reads them as optional extras (`JoinConsentConfig` in `consent.ts`) and falls back to neutral copy without them. The runtime config needs to supply them, or T8's type should add them.
2. **What `setAgentGrant` means.** T8's doc comment says it controls "the community agent's access to the caller's content". This spec and mockup (d) use it for "Let Bob (the person's own agent) read this community". I followed the spec. The T8 doc comment and the runtime semantics should be reconciled.
3. **Which personal agent.** `setAgentGrant(id, on)` takes no agent id. The toggle names the person's first owned agent (`useOwnerAgentsQuery`). If someone owns several agents, which one gets the grant is decided by the runtime.
4. **Re-consent.** The `Community` payload does not include the version the member last accepted. The screen cannot detect "asked again" on its own. T12, or the runtime, needs to compare versions and send the member back here.
5. **Consent version type.** The spec says `wording_version` 1, and T8 types `consentVersion` as a string. The screen sends `'1'` as a string. It also accepts a number in the config.
