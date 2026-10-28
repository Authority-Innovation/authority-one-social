# Communities: screen by state matrix

Wave 1, task T16. Docs only. Base: build line `569b3b240`.

The screens are the five in UI-SPEC.md:
**A** Switcher and combined feed, **B** Community home, **C** Brand app (locked), **D** Join and consent, **E** Agent in a thread.

## How the server response maps to a state

The client is `src/lib/agent-runtime/communitiesClient.ts` on the T8 branch (`d52f1bd82`), not yet on the build line. It never throws and returns `{ok:true,data}` or `{ok:false,error}`, where `error.kind` is `signed_out | invalid_argument | http | network | bad_response` (`communitiesClient.ts:22-31` on T8). Line refs to T8 are [verify once merged].

| State | Server response that drives it | Status of the contract |
| --- | --- | --- |
| signed-out | No runtime token, or HTTP 401 -> `error.kind: 'signed_out'` (T8 `:144`, `:152`) | In T8 |
| offline | `fetch` throws -> `error.kind: 'network'` (T8 `:170-173`) | In T8 |
| error | Any other non-2xx -> `error.kind: 'http'` with `status`; malformed body -> `bad_response` (T8 `:153-166`, `:178-191`) | In T8 |
| not_found | `getCommunity(id)` -> HTTP 404 | Status code [verify] against the runtime. Q5 |
| consent required | `join`, `getTimeline`, `post` or `reply` -> a typed refusal that consent is missing or out of date (the stored `consentVersion` is older than `Community.consentVersion`) | Not defined. Proposed: HTTP 409 with `{error:"consent_required", consentVersion}`. Q5 |
| non-member | `getCommunity(id)` ok, `community.role` is null/absent (T8 `:44-45`) | In T8 |
| member | `getCommunity(id)` ok, `community.role` is `owner`, `moderator` or `member` (T8 `:33`) | In T8 |
| pending | Not representable. `CommunityRole` has no `pending` (T8 `:33`) | Gap. Q6 |
| banned | Not representable. No role or error for it | Gap. Proposed: HTTP 403 `{error:"banned"}`. Q6 |
| left | `leave(id)` ok, then `getCommunity(id)` shows `role` null. Same as non-member, but the Join sheet must ask for consent again | In T8 for the data. "Ask again" is a UI rule |
| empty | Member, `getTimeline` ok with `posts: []` (T8 `CommunityTimelinePage`, `:85-88`); or `listMyCommunities` ok with `communities: []` (T8 `:208-213`) | In T8 |
| agent present | `community.agentDid` is a non-empty string (T8 `:41-42`) | In T8 |
| agent absent | `community.agentDid` null/absent | In T8 |
| agent grant on/off | `community.agentGrant` (T8 `:48-49`); set by `setAgentGrant(id, on)` (T8 `:335-344`) | In T8, but its meaning differs from the mockup. Q7 |

## Matrix

"-" means the screen is not reachable in that state.

| State | A Switcher + feed | B Community home | C Brand app (locked) | D Join + consent | E Thread |
| --- | --- | --- | --- | --- | --- |
| **non-member** | No chip for it. May show the "Suggested" card with **Join**. | Header, "Join community" button, "You choose what to share before you join.", wall as blurred placeholder rows, notice block. Agent card if agent present. | Locked community shows a join call to action instead of the feed (copy: Q8). | Full sheet, box unticked, "Agree and join" disabled. | Not reachable. A deep link shows Community home (non-member). Never the thread body. |
| **member** | Chip with name, lock if members-only, "member" tag. "All" includes its posts with a community badge. | "✓ Member" badge, tabs Posts / Episodes / Members, posts list, composer that can only post here. | Feed (Stories / Events / Members), reply box "Reply to the circle…". | Not shown (already a member). If opened, show "You're in." success state. | Full thread, reply box "Reply to Between Two Beers members…". |
| **pending** | Chip greyed with a "pending" tag, no posts in "All" (proposal, Q6). | Header, "Request sent" in place of the Join button, wall stays blurred (proposal, Q6). | Same as B pending. | Not shown again; consent was already given with the request. | Not reachable. |
| **left** | Chip removed on the next `listMyCommunities`. Cached posts for it are dropped from "All". | Same as non-member. | Same as non-member. | Shown again in full. Previous consent does **not** carry over. | Not reachable. |
| **banned** | No chip. No "Suggested" card for it. | Header only, no Join button, a short notice (copy: Q6). | Locked app shows the same notice; nothing else is reachable. | Not reachable. | Not reachable. |
| **signed-out** | No switcher (signed-out Home is unchanged). | Header from `getCommunity` is not available (it needs a token), so show a sign-in prompt. | Sign in with Authority Signature, brand scheme and client. | Not reachable; sign-in first. | Not reachable. |
| **offline** | Switcher shows last known chips; "All" shows Following only plus a "Couldn't load communities" row. | Last cached header if any, error row with Retry. Composer disabled. | Same as B offline. | "Agree and join" disabled with a retry message. Never record consent locally to send later. | Cached thread read-only, reply box disabled. |
| **error** | As offline, with the generic error copy. | Error state with Retry. | Same as B error. | Error under the buttons, sheet stays open, box stays ticked. | Error row with Retry. |
| **empty** | No memberships: only "All", "Following", "+ Join". "All" equals Following. | Member, no posts: empty state on Posts (copy: Q8). | Same as B empty. | n/a | n/a |
| **not_found** | Chip removed. | "This community isn't available." (proposed, Q8). Same copy for "does not exist" and "you may not see it", so the response does not leak which. | Locked id not found is a build error; show the same copy and nothing else. | Not reachable. | Not reachable. |
| **consent required** | Chip stays; its posts are left out of "All" until consent is renewed. | Banner "The community updated what joining shares." with a button that opens D (proposed, Q8). | Same as B. | Shown in full with the new version. "Consent version N" in the footer. | Reply box replaced by the same banner. |
| **agent present** | Agent items labelled in the feed (AGENT-LABEL.md). | Agent card shown. | Agent card if the brand shows one [verify with brand]. | "The community agent" section shown. | Agent replies labelled, Sources block, "Why am I seeing an agent?". |
| **agent absent** | No agent labels. | No agent card. | No agent card. | "The community agent" section hidden. | Any `is_agent` reply is refused (AGENT-LABEL.md case 8). |

## Rules that hold in every state

- The chip a person picked is a UI choice only. Every read is re-checked by the server. A stale chip never grants access.
- Members-tier posts come only from `communitiesClient` (the runtime door). No state ever reads them from a PDS or the AppView, and no state writes them to a PDS.
- When the client returns `ok:false`, the screen shows less, never more: no cached members content is shown to a person whose last response was signed-out, not_found, banned or left.
