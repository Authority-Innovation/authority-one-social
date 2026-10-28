# Communities: UI spec for the five screens

Wave 1, task T16. Docs only, no code. Base: build line `569b3b240`.

Companion docs: STATE-MATRIX.md (every screen in every state, and the server response behind each), AGENT-LABEL.md (decision N1), APP-STORE-NAMES.md, OPEN-QUESTIONS.md.

## Conventions

- **Copy** is quoted exactly from the mockup text. "(sample)" marks invented data in the mockup; it is not shipped copy. Copy marked **[proposed]** is not in any mockup; it is a default for the build task and is listed in OPEN-QUESTIONS.md Q8.
- All copy goes through Lingui (`` l`...` `` or `<Trans>`), per CLAUDE.md. Names, counts and handles are variables, never baked into strings.
- **Refs** are `file:line` on `569b3b240` unless marked otherwise. Refs to sibling wave-1 branches name the branch and say [verify once merged]. [new] marks a file that does not exist yet. [verify] marks anything not checked.
- **Flags** (T1 branch `345180401`, `src/env/common.ts` [verify once merged]), all default OFF or empty: `EXPO_PUBLIC_COMMUNITIES_ENABLED` (whole feature and the `/c/:id` routes), `EXPO_PUBLIC_COMMUNITY_SWITCHER` (screen A switcher), `EXPO_PUBLIC_LOCKED_COMMUNITY` (screen C), `EXPO_PUBLIC_BRAND`, `EXPO_PUBLIC_BRAND_SKIN`. With `COMMUNITIES_ENABLED` off, none of these screens render and a `/c/:id` deep link lands on Home (T1 `src/screens/Community/linking.ts`).
- **Data**: every members-tier read and write goes through `src/lib/agent-runtime/communitiesClient.ts` (T8 branch `d52f1bd82` [verify once merged]). No members content is read from or written to a PDS or the AppView. Composer writes to a community target are refused by the fail-closed guard in `src/lib/communities/composerTarget.ts` (T3 branch `cc80918e1` [verify once merged]) until a runtime write path exists.
- **Do not reuse** `src/state/queries/group.ts`. The existing Group stub's data layer writes groups, memberships and group posts to the user's PDS with `com.atproto.repo.createRecord` (`src/state/queries/group.ts:8`, `:255`, `:262`, `:299`, `:366`). That breaks the "members content never to a PDS" rule and the "no public record that you joined" promise on screen D.
- **Agent label**: every place that marks something as an agent uses the single helper in AGENT-LABEL.md. Never `isAgentHandle` (`src/lib/agent-runtime/config.ts:236`).
- **Accent** (N3): a community's `accent` colours its header only. No whole-app reskin in the AO app.

---

## A. Switcher and combined feed (Home)

**Purpose.** Let a person move between their Following feed, each community they belong to, and an "All" view that merges them, from the Home header.

### Elements, copy and controls

| Element | Copy | What it does | Lives in |
| --- | --- | --- | --- |
| Switcher row | (chips below) | Horizontal chip row in the Home header. Shown only when `COMMUNITIES_ENABLED` and `COMMUNITY_SWITCHER` are on, and hidden when `LOCKED_COMMUNITY` is set. | `src/view/com/home/HomeHeader.tsx:53-66` today renders the feed `TabBar`; the items come from `feeds` at `:30-36`. Switcher is a new component [new: `src/screens/Community/components/CommunitySwitcher.tsx`] rendered by `HomeHeader` |
| "All" chip | "All" | Selects the merged feed: Following plus every community the person belongs to. Each item carries its community badge. | Feed descriptor `communities` [new], see below |
| "Following" chip | "Following" | Selects the existing Following feed, unchanged. | Existing `'following'` descriptor, `src/state/queries/post-feed.ts:61` |
| Community chip | community name, lock icon if members-only, "member" tag | Selects that one community's feed. Long-press is not defined. | Chips come from `listMyCommunities()` (T8). The selected chip is UI state only; the server re-checks membership on every read |
| "+ Join" chip | "+ Join" | Opens community discovery [verify: no discovery screen exists or is specced; see Q9]. | [new] |
| Feed item | author, handle, time, reply count, like count; community badge in "All" | Tap the post: opens the thread (screen E). Tap the badge: opens Community home (screen B). | Item rendering: existing feed item, plus a badge [new] |
| Agent activity line | "Steve, BTB producer agent, replied with a cited episode" (sample) | Labels agent activity before the thread is opened. Only shown when AGENT-LABEL.md says "agent". | Uses the N1 helper |
| "Suggested" card | "Suggested", "Between Two Beers Listeners" (sample), "members only", "has a community agent", button "Join" | Tap the card: Community home (B). Tap "Join": Join and consent (D). Never joins directly. | [new] |

### Data and fork files

- New feed descriptor: add `'communities'` (the "All" merge) and `` `community|${id}` `` (one community) to the `FeedDescriptor` union at `src/state/queries/post-feed.ts:60-67`. The selected descriptor is read by Home at `src/view/screens/Home.tsx:156-161`.
- Merge pattern: follow `MergeFeedAPI` in `src/lib/api/feed/merge.ts:25`, with a new source class alongside `MergeFeedSource_Following` (`:234`) and `MergeFeedSource_Custom` (`:255`). The community source must fetch from `communitiesClient.getTimeline`, not the AppView, and must not reuse `MergeFeedSource_Custom` (it calls the AppView).
- Members posts are not `AppBskyFeedDefs.FeedViewPost`s. The merge needs an adapter type or a separate list item kind [verify]; see Q10.
- Tabs at the bottom are unchanged: `src/Navigation.tsx:735-772` (`TabsNavigator`).

### States

See STATE-MATRIX.md column A. Summary: no memberships shows "All", "Following", "+ Join" only; offline keeps last chips and shows Following; a left/banned/not_found community loses its chip.

---

## B. Community home (Between Two Beers Listeners, members only)

**Purpose.** The community's own page: who runs it, what joining means, its agent, and (for members) its posts.

### Elements, copy and controls

| Element | Copy | What it does | Lives in |
| --- | --- | --- | --- |
| Back arrow | (icon, label "Back") | Navigation back. | `Layout.Header.BackButton` [verify] |
| Avatar, name | "Between Two Beers Listeners" (sample) | None. Header gets the community `accent` (N3). | `src/screens/Community/index.tsx` [new; T1 adds a placeholder] |
| Visibility | lock icon, "Members only" | None. | same |
| Run by line | "Run by Between Two Beers · 1,240 members (sample)" | None. Count uses `plural`. | same |
| Description | one line from `community.description` | None. | same |
| Join button (non-member) | "Join community" | Opens screen D. Never joins directly. | same |
| Join reassurance (non-member) | "You choose what to share before you join." | None. | same |
| Member badge (member) | "✓ Member" | None [verify: should it open a leave/settings menu? Q11]. | same |
| Tabs | "Posts", "Episodes", "Members" | Switch tab. Episodes is BTB-specific content; see Q12. | same; Members tab uses route `CommunityMembers` `/c/:id/members` (T1) |
| Rules link | "Rules" [verify exact label] | Opens the rules text (same text as on screen D). | same |
| Agent card | "Steve ◆ Agent. BTB producer agent · sponsor: Between Two Beers. Answers from the show's episodes and cites them. Sees totals, never your profile." | Shown only when `agentDid` is set and the N1 helper says agent. Tap: same disclosure as "Why am I seeing an agent?" (E). | `src/screens/Community/components/AgentCard.tsx` [new] |
| Wall (non-member) | blurred placeholder rows | None. These are **placeholders**, not blurred real posts: a non-member's client never receives members content. | same |
| Posts list (member) | member question; agent reply "Steve ◆ Agent · 11m" with "🔗 1 source cited"; other posts with reply and like counts | Tap a post: screen E. | `communitiesClient.getTimeline` (T8) |
| Notice block | "Posts here are for members. They are kept in the community's private store, not on the open network, so they don't show up in public feeds or search." | None. | same |
| Notice link | "See what joining shares" | Opens screen D in read-only mode for members, or the join flow for non-members [verify]. | same |
| Composer entry (member) | [verify: no copy in mockup] | Opens composer with the target fixed to this community. Fail-closed: it can only post here. | T3 `composerTarget.ts`; until a runtime write path exists, the guard refuses and the UI shows its refusal reason |

The mockup's "Not a member / Member" toggle is a mockup device only, not a shipped control.

### Data and fork files

- New `src/screens/Community/` replaces the stub `src/screens/Group/index.tsx:27-44` (which renders an empty `View` and wires PDS-writing hooks; do not carry those hooks over).
- Route `/c/:id` (`Community`) and `/c/:id/members` (`CommunityMembers`) in `src/routes.ts` and `src/Navigation.tsx` (T1 branch; the route table on the build line ends at `src/routes.ts:118`).
- Reads: `communitiesClient.getCommunity(id)`, `getTimeline(id, cursor)` (T8).
- Why not the PDS or the AppView: the PDS is public, and the AppView indexes public data only and takes the viewer from a request field, so it cannot enforce a wall.

### States

See STATE-MATRIX.md column B.

---

## C. After Pride brand app, and the same thread in the AO app

**Purpose.** Show that one community can be reached two ways: inside the Authority One app, and in a white-label brand build locked to that one community.

### Left: the thread inside Authority One

| Element | Copy | What it does |
| --- | --- | --- |
| Thread header | "After Pride · members" | None. Accent in header only (N3). |
| Reply box | "Reply to After Pride members…" | Composer target fixed to After Pride. |

Same screen as E, with After Pride data.

### Right: the After Pride brand app

| Element | Copy | What it does |
| --- | --- | --- |
| Title | "After Pride" | None. |
| Tabs | "Stories", "Events", "Members" | Switch tab. Tab names come from brand config, not code [verify; Q12]. |
| Placeholder note | "Placeholder skin. Brand colours, font and icon pending." | Dev builds only. Must not ship. |
| Reply box | "Reply to the circle…" | Composer target fixed to the locked community. |
| Links to other communities | "Open in Authority One" | Opens the AO app (or its store page) at `/c/:id`. Nothing else in the brand app can reach another community. |
| Sign in | "Sign in with Authority Signature" [verify exact label] | Same identity as AO, with the brand's own URL scheme and OAuth client. |

### Build config and fork files

- `brands/afterpride/brand.json` [new]: name, bundle id, scheme, EAS project, icon, splash, legal links. No secrets in it.
- `app.config.js` reads `brand.json` instead of the literals at `app.config.js:134-137` (`name`, `slug`, `scheme`, `owner`), `:149` (iOS `bundleIdentifier`), `:171` (`CFBundleDisplayName`), `:327` (Android `package`), `:572` (EAS `projectId`). With no brand set, the values must be exactly today's literals.
- Skin: `src/lib/skins/afterpride.ts` [new] plus one entry in `SKIN_LIST` at `src/lib/skins/registry.ts:38`, pinned by `EXPO_PUBLIC_BRAND_SKIN`. A pinned skin hides the skin picker.
- `EXPO_PUBLIC_LOCKED_COMMUNITY` hides the switcher (screen A), fixes the composer target, and makes Home the locked community's feed.
- In a locked build: no switcher, no skin picker, no route to any other community. A `/c/:otherId` deep link shows "Open in Authority One", never the other community.
- The T14 branch (`coord/communities-w1-t14-after-pride-s-359bd349`) covers the After Pride skin [verify once merged].

### States

See STATE-MATRIX.md column C.

---

## D. Join and consent

**Purpose.** Show exactly what membership shares, and with whom, before any membership exists, and record consent with its wording version.

### Elements, copy and controls

| Element | Copy | What it does |
| --- | --- | --- |
| Sheet title | "Join community" | Dialog (bottom sheet on native, modal on web). |
| Community card | name; "Run by Between Two Beers · Members only" | None. |
| Intro | "Before you join: here is what membership shares, and with whom." | None. |
| Shares row ✓ | "Your name, handle and picture" / "the same profile you use everywhere on Authority One" | None. |
| Shares row ✓ | "Posts and replies you make here" / "members only, kept in this community's private store, not your public account" | None. |
| Does not share ✗ | "Your posts in other communities" / "each community is separate, nothing crosses over" | None. |
| Does not share ✗ | "A public record that you joined" / "your membership is not written to the open network" | None. This row is why `src/state/queries/group.ts` must not be used. |
| Agent section title | "The community agent" | Hidden when `agentDid` is null. |
| Agent section body | "Steve is here ◆ Agent. Steve is an AI agent run by Between Two Beers. He answers questions in threads, always labelled as an agent, and cites the episode he used. For the show's numbers he sees totals only, never your profile." | None. Pronoun and wording come from community config, not code (Q13). |
| Own agent section title | "Your own agent (optional)" | Hidden when the person has no agent [verify]. |
| Own agent toggle | "Let Bob read this community for me" / "Bob can give you recaps of threads you can already see. You can turn it off any time." | **Off by default.** A separate grant for this community only. Sent after a successful join via `setAgentGrant(id, on)` (T8). Not part of consent. See Q7 on what T8's `agentGrant` means. |
| Rules link | "Community rules" | Expands the rules. Sample: "Be kind. No spoilers before release day." |
| Terms link | "Between Two Beers terms and privacy" | Opens the community's legal link. |
| Leaving line | "Leaving: leave any time; you can export or delete your posts first." | None. Export and delete are `exportMine` and `deleteMine` (T8). |
| Consent box | "I've read what joining shares and I agree to the community rules." | Unticked by default. Gates the primary button. |
| Footer | "Consent version 1 · saved with your membership." | The version comes from `community.consentVersion`. |
| Primary button | "Agree and join" | Disabled until the box is ticked. Calls `communitiesClient.join(id, consentVersion)`. On success, then the grant call if the toggle is on. |
| Secondary button | "Not now" | Closes the sheet. Nothing is recorded. |
| Success | "You're in." / "Welcome to Between Two Beers Listeners." / "Go to the community." | "Go to the community." closes the sheet with `control.close(() => navigate(...))` (CLAUDE.md dialog footgun). |

### Rules this screen carries

- Consent comes first. No membership exists before "Agree and join" succeeds.
- An invite never counts as consent. An invite link opens this sheet; it does not join.
- The membership stores the consent wording version. If the community later publishes a version that shares more, the server answers "consent required" and this sheet is shown again (STATE-MATRIX.md).
- The agent's presence and sponsor are shown before joining.
- The own-agent grant is separate, off by default, and for this community only.
- Offline or error: nothing is queued. Consent is never recorded locally to send later.

### Fork files

- `src/screens/Community/JoinConsent.tsx` [new].
- `communitiesClient.join(id, consentVersion)` and `setAgentGrant(id, on)` (T8, `communitiesClient.ts:225-238`, `:335-344` [verify once merged]).
- Copy and layout pattern: the Signature agent picker, `src/features/aoSignature/components/AgentPicker.tsx` on the T4 branch (P2b merge) [verify once merged].

### States

See STATE-MATRIX.md column D.

---

## E. Community agent in a thread

**Purpose.** A members-only thread where the community agent answers, clearly labelled, with its source.

### Elements, copy and controls

| Element | Copy | What it does |
| --- | --- | --- |
| Thread header | "Between Two Beers · members" | Accent in header only (N3). |
| Lock line | "Only members of this community can see this thread." | None. |
| Member post | "Sam R." (sample), "9:29 AM", "8 likes" | Like, reply. Time via `i18n.date`. |
| Agent avatar | different avatar shape | Only for N1 "agent". |
| Agent name line | "Steve ◆ Agent · 11m" | Tap: agent disclosure. |
| Agent sponsor line | "AI agent · run by Between Two Beers" | None. Changes for an unverified sponsor (AGENT-LABEL.md case 4). |
| Agent answer | "Welcome, Sam. A good first listen is Episode 12 (sample)..." | Like, report. |
| Source block | "Source" / "🎧 Between Two Beers, Episode 12 (sample)" / "From 14:32 · episode transcript" | Tap: opens the source [verify target; Q14]. |
| No source | "No source cited" | Shown instead of the Source block when the reply has no source. Every agent reply shows one or the other. |
| Why link | "Why am I seeing an agent?" | Opens the disclosure with the notice text below. |
| Counts and actions | "3 likes", "Report" | Report uses the runtime, not the AppView moderation service [verify; Q15]. |
| Notice | "Between Two Beers added Steve to this community. You saw this when you joined." | None. |
| Notice | "Steve answers from the show's own episodes and says which one he used. He can't see your profile or your other communities. Community admins approve how he posts." | None. |
| Reply box | "Reply to Between Two Beers members…" | Composer target fixed to this community (T3 guard). |
| Reply hint | "Replies here stay in the community. To share publicly, start a new post." | None. There is no "share publicly" or quote-to-public control. |

### How the agent appears

- The runtime adds the agent to the thread roster from the community config's agent DID. The client does not add it.
- The label follows AGENT-LABEL.md: agent DID plus runtime `is_agent`, never the handle suffix.
- Every agent answer carries a Sources block or "No source cited".
- Agent posts going outward are proposals behind the owner's approval gate, unless the community allows auto-replies. That is runtime behaviour; the UI only shows what the runtime returns.

### Fork files

- Thread transport: `src/lib/agent-runtime/threadsClient.ts`. `sendToThread` at `:505`. Roster: `normalizeRoster` `:242-248`, `isCreatorIdentity` `:250-265`, `rosterAgentKeys` `:267-282`; the per-member agent flag is set in `normalizeMember` at `:190-221` (`isAgent` at `:198-199`). Note: the mockup's ":242-273" range covers `normalizeRoster` and `isCreatorIdentity`; the agent-relevant code is `:190-221` and `:267-282`.
- Open question: whether community threads use `threadsClient` (the existing `/app/threads` endpoints) or `communitiesClient.getTimeline` / `reply` (T8). They are different runtime surfaces. See Q16.
- Agent styling starts from `src/screens/Messages/SmsGroupThread.tsx:154-163` (bubble alignment and colour from `is_agent`, and the "agent" tag). Communities must add the DID check on top.
- New: citation block `src/screens/Community/components/SourceBlock.tsx` [new] and disclosure `src/screens/Community/components/WhyAgentDisclosure.tsx` [new].

### States

See STATE-MATRIX.md column E.
