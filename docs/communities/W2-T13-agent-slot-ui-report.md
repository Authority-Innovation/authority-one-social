# W2-T13: community agent in a thread, client UI (task 29293950)

- **Branch:** `communities/w2-agent-slot-ui`
- **Base:** `569b3b240`, then merged with merge commits:
  - `coord/communities-w1-t1-flags-routes-f-df17dfda` (T1) -> `021ee278f`
  - `coord/communities-w1-t2-lexicon-codege-98e02647` (T2) -> `63d12a338`
  - `coord/communities-w1-t8-communities-cl-f45195a0` (T8) -> `ed26cc47c`
  - Each merge conflicted only in `AUTONOMOUS-LOG.md` (add/add); resolved by keeping both entries.
- **Feature commit:** `c98b7f3a0`

## What changed

New feature directory `src/features/communityAgent/`:

| File | Purpose |
| --- | --- |
| `labelRule.ts` | `resolveAuthorLabel(author, community)`. The N1 rule. |
| `types.ts` | Thread-side types that extend the T8 client types additively (author `did`, `sources`, `agentSponsor`, `agentSponsorName`, `agentDisclosureUrl`). |
| `CommunityThreadPost.tsx` | One thread post. For an agent it shows the "◆ Agent" pill, the "AI agent · run by <sponsor>" line, a square avatar (members are circles), the Sources block or "No source cited", and the "Why am I seeing an agent?" disclosure. |
| `AgentGrantRow.tsx` | "Let my agent read this community" (or "Let <name> read this community for me"). Off by default. Calls `communitiesClient.setAgentGrant(id, on)` once per toggle and reverts if the call fails. |
| `__tests__/communityAgent.test.tsx` | 14 tests. |

The label rule (N1): an author is the agent only when `is_agent === true` from the runtime, the author DID equals the community config's `agentDid`, and `agentSponsor` is set. The handle is never read.

If there is no sponsor, the rule fails closed. The reply renders as a member, `logger.warn` fires (community id only, no DIDs), and admins (role `owner` or `moderator`) see a warning line.

Sources and the disclosure link only open `https://` URLs.

`SmsGroupThread.tsx` is unchanged. It is the SMS mirror and has no community config. Its `MessageRow` (`:154-163`) was the styling starting point, and the doc comment in `CommunityThreadPost.tsx` says so.

## Flags

| Flag | Default | Effect here |
| --- | --- | --- |
| `EXPO_PUBLIC_COMMUNITIES_ENABLED` (T1) | off | Off: every author renders as a member, with no pill, sponsor line, sources or "Why" link. `AgentGrantRow` renders nothing. |

No new flags.

## Tests

The full suite was run with `pnpm test --bail=0`. Without `--bail=0`, the repo script's `--bail` stops after the first failing suite.

| | Suites | Tests |
| --- | --- | --- |
| Before (`ed26cc47c`) | 133: 130 pass, 3 fail | 1479 pass, 1 fail, 28 todo |
| After (`c98b7f3a0`) | 134: 131 pass, 3 fail | 1493 pass, 1 fail, 28 todo |

The same three suites fail before and after, for environmental reasons on this Windows machine: `__tests__/lib/string.test.ts`, `plugins/uiSceneLifecycle/__tests__/withUISceneLifecycle.test.js` and `src/lib/contextEngine/__tests__/noBackgroundLocationShipped.test.ts`.

Label rule test names (in `src/features/communityAgent/__tests__/communityAgent.test.tsx`):

- `community agent label rule (N1) › agent author with is_agent and the config DID: pill, sponsor line, square avatar`
- `community agent label rule (N1) › human whose handle ends in pds.authority-one.com renders as a human`
- `community agent label rule (N1) › is_agent from an author that is not the config agent renders as a human`
- `community agent label rule (N1) › the config agent DID without is_agent renders as a human`
- `community agent label rule (N1) › agent with no sponsor renders as a human with an operator warning`
- `community agent label rule (N1) › agent with no sponsor shows no warning to an ordinary member`

Other tests: sources listed, "No source cited", the "Why" disclosure, the grant row (off by default, a toggle calls `setAgentGrant` once with `true`, then once with `false`, and reverts on error), and with the flag off, no agent UI and no grant row.

- Lint: `eslint src/features/communityAgent` is clean.
- Typecheck: no errors in the new code. The only errors are the pre-existing missing compiled locale catalogs (`src/locale/locales/*/messages`), because `intl:compile` is not run by rule.

## Not done / open questions

1. **Not wired into a screen.** `/c/:id` is still the T1 placeholder. The community home and thread screen, and the community settings screen, belong to other tasks. They should render `CommunityThreadPost` for each post and `AgentGrantRow` in settings.
2. **Runtime contract assumed.** T8's `CommunityPostAuthor` has no `did`, `CommunityPost` has no `sources`, and `Community` has no `agentSponsor`, `agentSponsorName` or `agentDisclosureUrl`. All of these are optional additions in `types.ts`. If the runtime does not send `did`, nobody is labelled an agent, which is fail-closed. The runtime (T7) needs to emit these fields.
3. **Disclosure URL source.** The config lexicon has no agent-disclosure field. I used an optional `agentDisclosureUrl` on the community view. Without it, the "Why" disclosure shows the explanation text with no link.
4. **Sponsor name.** The config holds a sponsor DID. The UI shows `agentSponsorName`, falling back to the community name. DIDs are never shown.
5. **Operator warning audience.** The spec says "a warning line for the operator", so I show it only to `owner` and `moderator` roles, plus a log line. Ordinary members just see a member reply.
6. **Grant semantics.** T8's comment says `setAgentGrant` covers the *community* agent's access, but mockup (d) and this spec describe the person's *own* agent. The row follows the spec copy and calls `setAgentGrant` as specified. This needs reconciling in T8 or the runtime.
7. No intl extraction or compile (CI does it). No `wrangler` or `check:bundle` (deny-listed). No deploy or EAS build. No PDS writes. No device test.
