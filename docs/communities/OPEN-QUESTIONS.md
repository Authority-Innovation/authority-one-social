# Communities: open questions from the design spec

Wave 1, task T16. Each question has a **recommended default** the build tasks can use until someone decides otherwise.

## Data contract gaps (found by reading the code)

**Q1. Posts carry no author DID, so the N1 label cannot be checked.**
`CommunityPostAuthor` on the T8 branch has `displayName`, `avatar` and `is_agent` only (`communitiesClient.ts:68-73`, T8 `d52f1bd82`). N1 needs the author DID to compare with `Community.agentDid`.
*Default:* add `did: string` to `CommunityPostAuthor` in the runtime response and the client. Until it exists, render every `is_agent: true` item as refused (AGENT-LABEL.md case 3), never as agent and never as human.

**Q2. No sponsor field, and no sponsor verification.**
The mockups show "sponsor: Between Two Beers" and the N1 cases need "no sponsor" and "sponsor not verified". Nothing in the T8 `Community` type carries a sponsor.
*Default:* add `agentSponsor: {name: string, verified: boolean} | null` to the community config response. No sponsor means the agent is refused.

**Q3. `isAgentHandle` (handle suffix) already exists and is in use.**
`src/lib/agent-runtime/config.ts:225-243`, used by `TalkToAgentButton.tsx:29` and `useAgentDirectory.ts:90`. This contradicts N1 if it leaks into community screens.
*Default:* leave the existing callers alone in wave 1 (they are not community screens), and add a test that fails if `src/screens/Community/**` or `src/lib/communities/**` imports `isAgentHandle`. Flag the existing callers for a later N1 clean-up.

**Q4. Copy for refused and unverified-sponsor agents.**
No mockup shows these.
*Default:* refused: "This reply is hidden because its agent has no sponsor on file." Unverified: "AI agent · sponsor not verified".

**Q5. Which HTTP status and error string mean not_found and consent required.**
T8 returns `{kind:'http', status, message}` for any non-2xx, but the runtime contract is not written down here.
*Default:* not_found = 404, and the same 404 for "exists but you may not see it". Consent required = 409 with `{error:"consent_required", consentVersion}`. The client should map these to typed kinds (`not_found`, `consent_required`) rather than each screen checking status numbers.

**Q6. Pending and banned are not representable.**
`CommunityRole` is `owner | moderator | member` (T8 `:33`). The task asks for pending and banned states.
*Default:* add `membershipStatus: 'none' | 'pending' | 'active' | 'banned'` to the community response, separate from role. Banned reads return 403 `{error:"banned"}`. Banned copy: "You can't join this community." Pending copy: "Request sent".

**Q7. `agentGrant` in T8 means something else than the mockup toggle.**
T8 documents `agentGrant` as "whether the caller lets the community agent read their content" (`communitiesClient.ts:48-49`). The mockup toggle is "Let Bob read this community for me": the person's **own** agent reading the community.
*Default:* treat them as two different grants. Keep T8's call for the one the runtime implements, and name the mockup one `ownAgentGrant` [new]. Do not ship the toggle until the runtime says which grant `PUT /agent-grant` sets. This needs a decision from the runtime owner.

## Copy and behaviour not in the mockups

**Q8. Missing copy.**
Not shown: not_found, empty community, empty switcher, consent-version-changed banner, locked-brand join call to action, offline rows.
*Default:* not_found "This community isn't available."; empty Posts "No posts yet. Start the conversation."; consent banner "The community updated what joining shares." with "Review and agree"; offline "Couldn't load communities." with "Retry"; brand app non-member uses screen D directly.

**Q9. "+ Join" chip target.**
No discovery screen is in the mockups.
*Default:* in wave 1, "+ Join" opens a simple "Enter an invite link" sheet that leads to screen D. A directory is out of scope.

**Q10. Members posts are not AppView feed items.**
`MergeFeedAPI` (`src/lib/api/feed/merge.ts:25`) merges `AppBskyFeedDefs.FeedViewPost`s. Community posts from the runtime have a different shape.
*Default:* a separate list item kind for community posts in the "All" feed, rendered by a new component. Do not fake `FeedViewPost`s, because the existing post actions (repost, quote, share) would then try to act on the PDS/AppView.

**Q11. Leaving.**
The mockups mention "leave any time" but show no Leave control.
*Default:* tapping "✓ Member" opens a menu with "Export my posts", "Leave community". Leave asks for confirmation and offers export first.

**Q12. Community-specific tabs ("Episodes"; "Stories, Events").**
*Default:* wave 1 ships "Posts" and "Members" only. Extra tabs come from community or brand config later.

**Q13. Agent pronouns and description.**
The agent text uses "He". That is the community's wording for its own agent.
*Default:* the agent section text comes from community config, verbatim. The app never generates pronouns for an agent.

**Q14. Where the Source block links to.**
*Default:* it opens the source URL from the runtime in the in-app browser, at the timestamp if given. No link means the block is plain text.

**Q15. Report on members content.**
The AppView moderation service cannot see members content.
*Default:* Report sends to the runtime (community admins). Not in T8; needs a runtime endpoint.

**Q16. Threads: `threadsClient` or `communitiesClient`?**
The mockup names `threadsClient.ts` (`sendToThread` `:505`, roster) for screen E, but T8 adds `getTimeline`, `post` and `reply` under `/app/communities`.
*Default:* community threads use `communitiesClient` (one door, one tenant check). `threadsClient` is a styling and roster-shape reference only.

## Process

**Q17. Branch name.** The spec says `communities/w1-design-spec`; the run assigned `coord/communities-w1-t16-design-ui-spe-8f2a732a`.
*Default:* used the run-assigned branch, as the run instructions require.

**Q18. Group stub replacement.** `src/screens/Group/index.tsx` and `src/state/queries/group.ts` write to the PDS (`group.ts:8`, `:255`, `:262`, `:299`, `:366`).
*Default:* the Community screens do not import either. Deleting them is a separate task, after Communities replaces them.
