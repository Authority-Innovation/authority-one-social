# REVIEW - communities integration: security, tenancy and privacy, before arming

- Task: `ac354e0c` (independent, priority low, read-only, one-shot)
- Date: 2026-11-05
- Target: `communities/integration`
- **Audited sha: `1cc4c02e14a9ec5e1c38d08fea20bf4a986f8878`** (`git rev-parse origin/communities/integration`)
- Method: code reading only, as the code would behave once armed. No flags changed, no live calls, no installs, no tests run, no app run.

## Verdict: NOT READY to arm

| Scope | Verdict | Why |
| --- | --- | --- |
| Members tier (the part that would go live) | **NOT READY** | F1 to F6 below |
| Public tier | **NOT READY, and not armable at this sha** | Refused in the client, and no group AppView is configured. P1 to P6 must be settled first |
| Combined and per-community Home feed | **Not wired at this sha** | W1 to W3 must be fixed in the same change that wires it |

The client's own gates are good: members content does not reach a PDS, and the client never claims tenancy. The gaps are:

- A person cannot leave, report, block or delete anything.
- As far as the evidence shows, nobody can remove anyone.
- The join screen describes the agent grant incorrectly.
- Picked videos leave the device before the target check.

### How to read the ratings

- **Reachability** is rated on the code as armed: `EXPO_PUBLIC_COMMUNITIES_ENABLED` and `EXPO_PUBLIC_COMMUNITY_SWITCHER` on.
- Findings that cannot be reached at this sha are capped at MED, however serious they would become. The "Blocks" note says what they block.
- **Second-hand** means the evidence comes from the runtime review on `review/communities-wave-r302` (`docs/REVIEW-WAVE-COMMUNITIES-RUNTIME-e4e6ba29.md`, 2026-11-01, runtime `e4e6ba29` and `cca6020d`). I did not read the runtime for this audit, and I do not know whether it has changed since.

## Findings: members tier, reachable once armed

### F1 - BLOCKER - "Members only" has no admission control
- **Where:** `src/lib/agent-runtime/communitiesClient.ts:253-262` (join sends only `consentVersion`), `src/screens/Community/JoinConsent.tsx:74` (invite deliberately not read), `src/routes.ts:122`. Runtime, second-hand: `door.js:476-525`.
- **Failure scenario:** Someone opens `/c/garden/join`, ticks the box and presses "Agree and join". Per the runtime review, join checks only the consent version, and the member can then read the whole history. The screens still say "Members only" (`JoinConsent.tsx:221`) and "Posts here are for members" (`PostsSection.tsx:138`). First-hand, the client has no field for an invite or other proof, so it could not satisfy a stricter door without a change. The prior review also notes that join's 201 versus 404 reveals which community ids exist.
- **Reachability:** Reachable in practice once armed, if the door is unchanged. Client side verified; runtime side second-hand.
- **Needs:** Elliott's ruling on open join (decision D1).

### F2 - BLOCKER - No moderation path: no report, block, remove or ban
- **Where:**
  - `src/features/communities/postActionGuard.ts:61-62` routes `report` and `delete` to "the door", but `src/screens/Community/components/MemberPostRow.tsx` has no actions at all.
  - `src/components/PostControls/index.tsx:87-163`: members controls are reply and a disabled like only.
  - `communitiesClient.ts` has no route for reporting, removing a post, removing a member, banning, or changing rules.
  - Second-hand: the runtime has no remove or ban route, and an admin cannot delete another member's post (`door.js:163-185`, `:401-407`).
- **Failure scenario:** A member is harassed in a community. They cannot report the post, block the author or leave (F5). An admin cannot remove the post or the person. If the person is persuaded to leave, they can rejoin immediately (second-hand).
- **Who can do what, as built:** only the caller can delete their own post (runtime route, no UI). Rules come from community config, with no client edit path; the prior review notes that config writes through the seed route are not audited. Admins can launch the agent. "Can a removed member come back" has no meaningful answer yet, because removal does not exist.
- **Reachability:** Reachable in practice once armed. Client absence verified; runtime absence second-hand.
- **Also note:** Apple's App Review guideline 1.2 requires reporting and blocking for user-generated content, so this is likely a store issue as well. This audit did not check store submission.

### F3 - BLOCKER - Join consent names the wrong agent
- **Where:** `src/screens/Community/JoinConsent.tsx:92-94`, `:235-270`; `src/screens/Community/consent.ts:124-127`; contract at `communitiesClient.ts:404-420`; `src/features/communityAgent/AgentGrantRow.tsx:4-7`.
- **Failure scenario:** A person who owns an agent called Bob sees "Your own agent (optional): Let Bob read this community for me. Bob can give you recaps of threads you can already see", and turns it on. The call made is `setAgentGrant(id, true)`. Per the client contract, that gives the **community's** agent access to the person's content, and it does not touch Bob. They consented to something else.
- **It gets worse in two ways:**
  - The toggle depends on the person owning an agent, not on the community having one. A grant set while a community has no agent is already on when one launches later.
  - "You can turn it off any time" is not always true: the settings row is hidden when the community names no agent or the grant read fails (`AgentGrantSection.tsx:36-37`).
- **History:** `AgentGrantRow` copy was corrected for this exact reason (`docs/communities/W2-T13-B1-grant-row-copy-fix.md`), but the join screen was not. `docs/communities/W2-T9-join-consent-report.md:125` flagged the mismatch as open.
- **Reachability:** Reachable in practice once armed, for anyone who owns an agent and opens the join route. I did not read the runtime's grant semantics, so the conflict is between the client's contract and this copy.
- **Needs:** Elliott's decision on what the toggle means (D2), and new wording under a new consent version.

### F4 - HIGH - A picked video leaves the device before any target check
- **Where:** `src/view/com/composer/Composer.tsx:398-424` (`onSelectAuthorityVideo` calls `uploadAuthorityVideo` with no gate), callers at `:2672` and `:2743`; `videoBtnDisabled` at `:2694` ignores the target. `EXPO_PUBLIC_VIDEO_POSTS_ENABLED` is `"true"` in the eas profiles.
- **Failure scenario:** A member opens the composer on a members community and picks a video. The bytes upload at once to the runtime video pipeline. Publishing is later refused (`writeGate.ts:59-65`), and the person sees an error, but a copy of the video already sits outside the walled store. No PDS write happens.
- **Reachability:** Reachable in practice once armed. Verified first-hand. The prior review reported the same issue (HIGH-A1), and it is still present at this sha.

### F5 - HIGH - No way to leave, delete a post, or export
- **Where:** `leave`, `deleteMine` and `exportMine` (`communitiesClient.ts:274`, `:359`, `:369`) have no non-test callers.
- **Failure scenario:** A person joins, posts something, and regrets it. In the app they cannot remove the post or leave. `useLeaveGroupMutation` in `group.ts:425` is the public-tier path, and it also has no callers.
- **Second-hand addition:** the agent grant survives leave, so the community agent could keep reading a former member's posts (runtime MEDIUM-1). Adding a Leave button without that runtime fix would mislead people.
- **Reachability:** Reachable in practice once armed.

### F6 - HIGH - Every membership and IDOR check is on the server, which this audit did not verify
- **Where:** `communitiesClient.ts:9-12`; `src/screens/Community/queries.ts:58-86` (the client's membership check only avoids making a call); `src/lib/api/feed/communities.ts:125-126`.
- **Failure scenario:** The community id comes from the URL and is sent to the door. That is the right design only if the door checks membership on every route. If any route does not, a signed-in person can read another community by changing the id, and nothing in this client would stop it.
- **What is known, second-hand:** every member route re-reads membership on each request, stores are isolated per tenant, and responses are `no-store`. These are strong results, but they are dated 2026-11-01.
- **Arming preconditions, also second-hand:**
  - On runtime `main`, the door is not wired and would return empty timelines. The working door exists only on `deploy/dev-communities`.
  - No code-level production pin exists there, so config alone can turn the door on (runtime HIGH-3).
- **Reachability:** Cannot be rated from this repo. Re-verify against the runtime sha that will actually be armed.

### F7 - MED - An agent's post can lose its label and read as a human's
- **Where:** `src/features/communities/agentLabel.ts:19-29`, `src/screens/Community/components/MemberPostRow.tsx:33`, `src/screens/Community/descriptor.ts:112-117`, `src/lib/communities/doorContract.ts:18-21`.
- **Failure scenario:** The label requires `is_agent`, a stored author DID, and a match with the current config's agent DID. It disappears from real agent posts in these cases:
  - The agent is replaced, so old posts have a different DID.
  - The slot is misconfigured, so the door sends `agent: null` with `agent_error`.
  - The runtime's agent flag is turned off, so `author` and `is_agent` are not sent at all.

  The row then shows the agent's name with no label. This rule correctly stops spoofing, but it fails in the direction of dropping an honest label.
- **Reachability:** Reachable under a rare path (agent replacement, misconfiguration or flag rollback).
- **Needs:** Elliott's decision (D3), because the current rule is decision N1.

### F8 - MED - URLs in a members post go to a third party while typing
- **Where:** `src/view/com/composer/text-input/TextInput.tsx:110-119`, `src/view/com/composer/state/composer.ts:510`, `src/view/com/composer/ExternalEmbed.tsx:88`, `src/lib/constants.ts:159`.
- **Failure scenario:** A member pastes a private link into a members post. The composer adds a link card and resolves it through `cardyb.bsky.app`, before publishing and regardless of target. The publish path then drops the card (`submit.ts:100-104` says it is "dropped rather than resolved", which is only true of publishing), so the person also sees a preview that never appears.
- **Reachability:** Reachable in practice once armed. Only the URL leaves, not the post text. The prior review rated this LOW; I rate it MED because it is routine and the data goes to an outside operator.

### F9 - MED - Existing members are never asked to re-consent
- **Where:** `src/screens/Community/consent.ts:15-18`. Second-hand: the grant's stored consent version is never compared (runtime MEDIUM-1).
- **Failure scenario:** The wording changes, including any fix for F3. Existing members stay on the terms they accepted, and nothing asks them again.
- **Reachability:** Reachable under a rare path (a wording change with existing members). Small today, because there are no production members yet.

### LOW findings, members tier

| ID | Where | Failure scenario | Reachability |
| --- | --- | --- | --- |
| F10 | `src/view/com/composer/state/submit.ts:122-131` | Content warnings, threadgate and postgate are silently dropped on a members post, because only the text is sent. A multi-post thread can also half-post if a later call fails. | Reachable in practice |
| F11 | `communitiesClient.ts:94-101`, `:122-124` | `encodeURIComponent` leaves `.` and `..` alone, so an id of `..` could point an authenticated runtime request at a different route. Whether the router delivers that id and each platform's fetch normalises it was not tested. | Rare path |
| F12 | `src/screens/Community/roster.ts:81` | The sponsor always gets an ADMIN badge, even after losing admin. The door only says the sponsor is a current member. | Rare path |
| F13 | `roster.ts:100-105`, `memberRows.ts:53-69` | Roster entries and old items identify people by handle. If a handle later belongs to someone else, that person's name and picture are shown. | Rare path |
| F14 | `MemberPostRow.tsx:62-77` | A human can set their display name to "◆ Agent", which looks like the label. The real label is safe, but `sanitizeDisplayName` strips only check marks and control characters. | Reachable in practice, low harm |
| F15 | `src/features/communityAgent/CommunityThreadPost.tsx:26` | This component has no render callers, so agent sources, "No source cited" and "Why am I seeing an agent?" never appear. `MemberPostRow` shows only the label. | Reachable in practice |
| F16 | `descriptor.ts:165`; `JoinConsentEntry.tsx:53-56` | Membership is inferred from `viewer_is_admin` being present. With the runtime's admin role off, real members look like non-members. Fails closed, but is a rollout dependency. The join sheet on the home is still a "Joining isn't open yet" placeholder, so the only real join is the `/c/:id/join` route. | Rare path |
| F17 | `src/env/common.ts:205-207` | The flag is fixed at build time, so turning communities off after arming needs a new build or OTA update. The runtime gate is the only fast off switch. | Reachable when a rollback is needed |
| F18 | `consent.ts:31`; fixture `door.json` (`wording_version: 3`) | This build only has copy for version 1. A community on any other version shows "needs a newer version". Fails closed, but check real config before arming. | Depends on config |

## Findings: Home feed, not reachable at this sha

**Evidence it is not wired:** `src/features/communities/switcher/index.tsx:94` and `switcher/README.md:23` say Home does not read the selection, and `useSelectedCommunityFeed` is used only inside the switcher.

**Blocks:** wiring the feed. Fix these in the same change.

| ID | Sev | Where | Failure scenario once wired |
| --- | --- | --- | --- |
| W1 | MED | `src/features/communities/membersPost.ts:96-110`, `:131` (`getMembersPostRef` has no callers); `src/view/com/posts/PostFeedItem.tsx:427` | **The agent label is dropped entirely.** `isAgent` is computed and nothing reads it. The author has a synthetic DID and `labels: []`, so the bot badge cannot show either. Every agent post in the feed reads as a person. |
| W2 | MED | `src/view/com/posts/PostFeed.tsx:1004-1010`, `:701-705`, `:728-732`, `:311`; `src/state/queries/post-feed.ts:231` | **Members ids reach analytics and logs.** `post:view` sends the `ao-community://<community>/<post>` uri, and the feed descriptor carries the community id. This contradicts the rule at `PostFeedItem.tsx:256`, which only covers one event. Text is not sent. |
| W3 | LOW | `membersPost.ts:103-111`; `post-feed.ts:228` | **Blocks, mutes and removals do not apply.** Blocks and mutes cannot apply to a synthetic author. With `STALE.INFINITY`, a removed post stays visible until refresh. |

## Findings: public tier, not reachable at this sha

**Evidence it is dark:**
- `resolveTarget.ts:168-171`, `submit.ts:76-78` and `writeGate.ts:54-56` refuse public targets.
- `guardComposerPdsWrite` refuses a public target with no binding (`composerTarget.ts:133-137`), and no caller passes one to `apilib.post`.
- `EXPO_PUBLIC_AUTHORITYONE_GROUP_PROXY_DID` is absent from `eas.json` and empty in `.env.example`, so reads throw before sending (`group.ts:139-140`).
- `useJoinGroupMutation`, `useLeaveGroupMutation`, `usePostToGroupMutation`, `useCreateGroupMutation` and `useGroupMembersQuery` have no callers.

**Blocks:** enabling the public tier. The enforcement all of this relies on belongs to a group AppView that is not in this repo, and I did not review it.

| ID | Sev | Where | Failure scenario if enabled |
| --- | --- | --- | --- |
| P1 | MED | `lexicons/com/authorityone/group/` (no post-removal record); `ban.json`; `post.json` | **A removed post has no mechanism and can come back.** A moderator can ban an account but has no record for removing one post. The binding is in the author's repo, so the author can rewrite it at any time. |
| P2 | MED | `membership.json`; `ban.json`; `invite.json`; `group.ts:363-373`, `:400-412` | **Authority rests entirely on the AppView.** Anyone can write a membership with `role: owner, status: active` to their own repo, or write a ban or invite naming any group. The AppView must check the issuer's role and corroborate every claim. `ban`, `invite` and `membership` also pin the group by CID, so an owner edit could stop a ban matching unless the AppView matches on URI. |
| P3 | MED | `src/lib/communities/groupPostBinding.ts:62-83`; `src/lib/api/index.ts:108-110`; `group.ts:457-480` | **A post can be routed to the wrong group.** Only the URI's shape is checked, nothing ties it to the community, and the guard compares `binding.target` with itself. There is no member pre-check (`index.ts`, OPEN Q4). `usePostToGroupMutation` accepts any subject, so the AppView must require that the post is in the binding's own repo, or someone else's post can be pulled into a hostile group. Bindings after the author leaves are undecided (design Q10). |
| P4 | MED | `src/lib/communities/feedPostTarget.ts:26`; `PostFeedItem.tsx:210`; `resolveTarget.ts:161-163` | **Replies lose the community.** Every at:// post maps to `{kind: 'profile'}`, including a public community post, and an explicit parent target wins. The reply is written as an unbound profile reply. The fail-closed rule for unknown parents never runs. |
| P5 | MED | `defs.json` (`visPrivate`, `private`); `getMemberships.json`; `getMembers.json`; `group.ts:229-238` | **A public-tier group cannot actually be private, and members can be enumerated.** Posts, bindings and memberships are public repo records, whatever `visPrivate` says. `getMemberships` takes any actor and declares no auth error. `getMembers` offers `banned` and `pending` filters, so the AppView must restrict them. Anyone can already see who joined by reading repos. |
| P6 | MED | `PostFeedItem.tsx:427`; `src/view/com/util/PostMeta.tsx:112`; `src/components/BotBadge.tsx:13` | **No agent label rule for public posts.** A `FeedViewPost` has no `is_agent`, so the only signal is the account-level `bot` self-label. See A1. |
| P7 | LOW | `src/state/queries/post.ts:356` | Deleting a bound post leaves the binding behind (design Q6). The AppView must drop orphans. |
| P8 | LOW | `src/lib/api/index.ts:276-289` | On a CID mismatch the post stays published but is reported as failed, so a retry creates a duplicate (design Q6). |

## Agent posting labels, all paths

| Path | Label | Result |
| --- | --- | --- |
| Community home post | `◆ Agent` by DID rule (`MemberPostRow.tsx:69-77`) | Present, but see F7 |
| Community home reply | Same row; replies render flat | Present, but see F7 |
| Members tab | `◆ Agent` (`MembersSection.tsx:143-151`); an `is_agent` entry with another DID is dropped | Present |
| Agent card | `◆ Agent` plus sponsor line | Present |
| Combined or single feed | None | **Dropped** (W1, not wired) |
| Repost or quote of a members post | Disabled by `postActionGuard.ts`; `embeddingDisabled` set | No path |
| Edit of a members post | No client route | No path |
| Post-as-agent into a members community | Refused (`writeGate.ts:59-69`) | No path |
| Post-as-agent into a public community | Refused (`writeGate.ts:54-56`) | No path |
| Spoof by name or handle | Never read for the label (`agentLabel.ts`) | Blocked, except the lookalike in F14 |

### A1 - MED - Post-as-agent depends on an account label this repo cannot confirm
- **Where:** `src/lib/agent-runtime/agentPostsClient.ts:151-193`, `:201-251`; `Composer.tsx:1321-1327`, `:1447-1453`; `src/components/ProfileBadges.tsx:50`; `src/screens/Settings/AutomationLabelSettings.tsx:41-73`.
- **Failure scenario:** Outside communities, an owner posts or edits as an agent on the agent's own profile. Nothing in the record says it is agent-authored, so the only visible signal is the account's `bot` self-label. If the runtime does not set that label on agent accounts, or it is removed, the post carries no label. An edit keeps the same uri and writes on the server, so the client cannot tell whether a label survives.
- **Also:** the owner writes this text verbatim, so an "agent" label is itself debatable (D4).
- **Reachability:** The path is reachable in practice today, regardless of the community flags. Whether a label is actually missing is unverified, because it depends on the runtime and live account records.
- **Replies:** the composer does not forward `replyTo` on these paths, and AgentHub does not set it, so there is no client agent-reply path through here. Agent reposts were not found in the composer paths; `socialAutonomyClient` was not audited.

## Answers to the brief

1. **Moderation.** Only a post's author can delete it, and that has no UI. Nobody can remove or ban (F2). On the public tier a ban record exists but no post removal does (P1). A person who leaves can rejoin (second-hand).
2. **Membership.** Anyone can join with the consent tick (F1, second-hand). Leave exists only in the client API (F5). There is no invite path. The client sends a community id and never a tenant. The door must check membership on every route, which is reported but not re-verified here (F6). The client has no IDOR of its own because it decides nothing.
3. **Public group.** The app reads nothing today. If enabled, a non-member would see whatever the AppView serves. Members-tier content is designed not to be there: it never reaches a PDS, and `fetchGroupTimeline` refuses non-at:// ids (`group.ts:215-219`). Members can be enumerated from public repo records (P5).
4. **group.post binding.** The write is sound: one atomic `applyWrites`, same rkey, the author's own repo, a CID check, and client validation. It is not reachable. Nothing in the client stops a post being routed to a group the author is not in or has left. Only the AppView can enforce that, and its behaviour after leaving is undecided (P3).
5. **Agent labels.** See the table above: present on the community home, absent in the unwired feed (W1), and lost in the rare cases in F7.
6. **Privacy.** See below.

### Privacy: where personal data goes

| Destination | Finding |
| --- | --- |
| PDS | **Verified clean for members content.** Drafts, blobs, post writes and post-as-agent are gated. |
| Runtime video pipeline | **Leak:** video bytes before the gate (F4). |
| Third-party link service | **Leak:** URLs while composing (F8). |
| Analytics | Clean at this sha for members content, as the feed is not wired. **Leak once wired** (W2). |
| Logs | `communitiesClient` logs only an error message. The composer logs the caught error with a fixed message on a community failure. No post text found in a log call on these paths. |
| Push payloads | No community code in the client's notification handling. **Payloads are built by the runtime and were not checked.** |
| Other members | Members see each other's handles and posts, which the consent screen states. Each row also makes a profile lookup by handle or DID (`MemberPostRow.tsx:29`, `MembersSection.tsx:110`), which tells the AppView who the viewer looked up, but not which community. |
| On-device cache | Community queries carry the viewer's DID and have no `persistedVersion`, so they are not persisted (`queries.ts:27-38`, `state/queries/util.ts:67-68`). Community feed queries are removed on account change. |

## Verified sound

- **Members content and the PDS:** `guardComposerPdsWrite` refuses members and paid targets on drafts, blobs, video and post writes, and the guard is not behind a flag. The only exception found is the runtime video upload in F4, which is not a PDS write.
- **Unknown targets fail closed:** an unknown tier reads as members (`descriptor.ts:83-90`). An unresolved target is `null`, which is refused. Unknown parents are refused.
- **Admin controls are not trusted from the client:** a client-supplied `viewerIsAdmin` is dropped (`communitiesClient.ts:82-88`), and the runtime is said to enforce launch.
- **Request bodies** are built field by field, with no tenant id.
- **Non-members:** walled timelines and rosters are not requested for them.
- **Binding atomicity** and client-side validation of every record in a bound batch (`src/lib/api/index.ts:300-335`).

## Readiness

### Must fix before arming the members tier

1. F1: admission decision, then the door and client changes it requires.
2. F2: report, block, admin remove and ban, in both runtime and app.
3. F3: correct the join grant wording and meaning, with a new consent version.
4. F4: gate the video upload on the target.
5. F5: leave and delete UI, plus the runtime fix so the agent grant ends on leave.
6. F6: re-verify the door at the exact runtime sha being armed, including route wiring, the production pin and the shared-config question.

Strongly recommended in the same pass: F7, F8 and F9.

### Must fix before wiring the Home feed

W1, W2, W3.

### Must fix before enabling the public tier

P1 to P6, plus an actual review of the group AppView.

### Decisions for Elliott

| # | Decision | Recommendation |
| --- | --- | --- |
| D1 | Are communities open-join, or invite or approval only? Should a new member see history from before they joined? | Not open-join while the screens say "Members only". If open join is intended, change that wording. |
| D2 | What does the join-time toggle mean: the community's agent, or the person's own agent? | Community agent, matching the client contract, and off by default. Show it only when the community has an agent. If own-agent access is wanted, build a separate grant. |
| D3 | When an item says `is_agent` but its DID does not match the current config, what should it show? This changes N1. | Show a label anyway, because the door is the authority and an honest label matters more here. Keep the DID match only for what the sponsor line claims. |
| D4 | How should an owner's verbatim post through an agent's identity be labelled? | Your call. It is a policy question, and I found no written platform label policy in this repo, so I audited against decision N1 and the lexicon's description of `agent`. |
| D5 | What should happen to a public binding after the author leaves or is removed (design Q10), and the other OPEN items in `docs/design/group-post-binding.md` (Q1, Q4, Q6, Q7, Q9)? | Follow the design doc's recommendations. Hide on ban. Remove `usePostToGroupMutation` unless Q9 wants it. |
| D6 | Is a private group on public repo records a product at all? | Remove `visPrivate` and `private` from what can be created, and use the walled tier for anything private. |

## What I did NOT check

- **The runtime door:** not read for this audit. All runtime statements are second-hand and dated 2026-11-01.
- **The group AppView:** not in this repo and not reviewed. Every statement about it is a requirement, not an observation.
- **Live behaviour:** nothing was run, so there is no test run, device run, or live call. Reachability comes from reading code and greps for callers.
- **Deploy config, secrets and live flag values.** Only `eas.json` and `.env.example` were read.
- **Push payloads, the analytics provider's configuration, and Sentry breadcrumb contents.**
- **Not audited:** `SmsGroupThread` and the group mirror (a code comment says it trusts `is_agent` alone), `socialAutonomyClient`, `searchGroups`, `src/state/session/agent.ts` changes, and the scheme handling of `rulesUrl` in `InlineLinkText` (`src/screens/Community/index.tsx:232-238`).
- **Second-hand runtime claims:** I did not re-verify them or check whether they have since been fixed.

## Flag state at this sha

- `EXPO_PUBLIC_COMMUNITIES_ENABLED` is `"false"` in every `eas.json` profile **except `development-communities`** (`eas.json:67-68`), where it and the switcher are `"true"`. That profile is an internal dev-client build pointed at the Dev runtime. The statement in `docs/design/group-post-binding.md` section 5 that all profiles are false is out of date.
- I changed no flags.

## Process notes

- One read-only shell command early in the run was stopped by the builder deny-list as "service-control". It was only `git` and `grep`, and the likely trigger was a word in my filter pattern. I did not try to control any service. I got the file list with plain `git diff --name-only` and the search tools instead.
- The earlier review on `review/communities-wave-r302` audited this same app sha. I read it after forming most of these findings, and used it for the runtime evidence. F4 was added after reading it and then confirmed in the code. F8, F10 and F11 overlap with it. F1 and F2 rely on its runtime findings. Findings F3, F7, W1, W2, P1 and P3 are not among its listed app-side finding headings.
