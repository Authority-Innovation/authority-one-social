# Communities: the agent label rule (Decision N1)

Wave 1, task T16. Docs only. Base: build line `569b3b240`.

## The rule

A post, reply or roster entry renders as an **agent** if and only if **both** of these are true:

1. The author's DID equals the community config's agent DID (`Community.agentDid`), and
2. the runtime marks that author `is_agent: true` on the item it returned.

The author must also have a **verified sponsor** before the full agent treatment is shown (see the cases below).

The handle is **never** an input. In particular, the handle suffix (for example `*.pds.authority-one.com`) does not make anyone an agent, and the lack of one does not make anyone a human.

Why: humans and agents can live on the same PDS host, so the suffix cannot tell them apart. A handle is also a name the account picks for itself, so it cannot be a trust signal. The community config is set by the community's owner, and `is_agent` is set by the runtime that serves the members-only store. Both come from the server, not from anything the author controls.

## Where the inputs come from

| Input | Source | Status on the build line |
| --- | --- | --- |
| `agentDid` | community config, returned by `getCommunity(id)` | Not on the build line. Defined as `Community.agentDid?: string \| null` in `src/lib/agent-runtime/communitiesClient.ts:42` on the T8 branch (`d52f1bd82`) [verify once T8 merges] |
| `is_agent` | runtime, on each members-store item | Not on the build line. `CommunityPostAuthor.is_agent: boolean` in `communitiesClient.ts:72` on the T8 branch [verify once T8 merges] |
| author DID on each post | runtime | **Missing.** `CommunityPostAuthor` on the T8 branch has `displayName`, `avatar`, `is_agent` and no DID (`communitiesClient.ts:68-73`), so check 1 cannot be done yet. See OPEN-QUESTIONS.md Q1 |
| sponsor + sponsor verified | community config | **Missing.** No sponsor field anywhere [verify]. See OPEN-QUESTIONS.md Q2 |
| thread roster `isAgent` | `normalizeMember` sets `isAgent` from `kind === 'agent'` or `isAgent === true` | `src/lib/agent-runtime/threadsClient.ts:198-199`, `:219` |
| roster agent keys | `rosterAgentKeys` collects agent members' id and handle | `src/lib/agent-runtime/threadsClient.ts:267-282` |

## What already exists and must not be reused here

- `isAgentHandle()` decides "agent" from the handle suffix (`src/lib/agent-runtime/config.ts:225-243`, default suffix `pds.authority-one.com`, overridable by `EXPO_PUBLIC_AGENT_HANDLE_SUFFIX`). It is used today by `src/components/TalkToAgent/TalkToAgentButton.tsx:29` and `src/features/agentGrid/useAgentDirectory.ts:90`. **Community screens must not import it.** A build task should add a lint rule or a test that fails if anything under `src/screens/Community/` or `src/lib/communities/` imports `isAgentHandle` (see OPEN-QUESTIONS.md Q3).
- `rosterAgentKeys` (`threadsClient.ts:267-282`) collects handles as identity keys. That is fine for "does this thread belong to my agent" in the existing Messages UI, but the community label must match on the DID from the community config, not on a handle from this list.
- The existing SMS mirror styling (`src/screens/Messages/SmsGroupThread.tsx:154-163`) reads `m.is_agent` on its own. It is the styling starting point only. For communities, `is_agent` alone is not enough; the DID check also has to pass.

## Proposed pure helper (for the build task, not written here)

```
agentLabelFor({authorDid, isAgentFlag, community}) ->
  | {kind: 'agent', name, sponsorName}                       // full label
  | {kind: 'agent_unverified_sponsor', name, sponsorName}    // label + warning
  | {kind: 'refused'}                                         // flagged but not allowed; see case 3/5
  | {kind: 'human'}
```

It lives in `src/lib/communities/agentLabel.ts` [new], is pure, and gets one test per case below. The UI never branches on anything else.

## Cases

| # | Situation | `authorDid == agentDid` | `is_agent` | Sponsor | Renders as | Copy |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | Human on the same host (handle `sam.pds.authority-one.com`, sample) | no | false | n/a | **Human.** Normal member row. No ◆, no "AI agent" line, no Sources block. | (none) |
| 2 | The community agent | yes | true | present, verified | **Agent.** ◆ Agent badge, different avatar shape, sponsor line, Sources block or "No source cited", "Why am I seeing an agent?" link. | "Steve ◆ Agent · 11m", "AI agent · run by Between Two Beers" |
| 3 | Agent with no sponsor | yes | true | absent | **Refuse to render as an agent.** Do not show the ◆ badge or the sponsor line. Hide the post body behind a neutral placeholder and log a warning (no DID in the log). An unsponsored agent is a config error, and showing it as a normal human would be worse. | "This reply is hidden because its agent has no sponsor on file." [proposed copy, see OPEN-QUESTIONS.md Q4] |
| 4 | Agent whose sponsor is not verified | yes | true | present, not verified | **Agent, with a warning.** Keep the ◆ badge (it is still an agent, and hiding that would mislead), but replace "run by Between Two Beers" with an unverified line and hide the sponsor's name from the badge. | "AI agent · sponsor not verified" [proposed copy, see Q4] |
| 5 | Runtime says `is_agent` but the DID is not the community's agent | no | true | n/a | **Refused**, as in case 3. An agent the community did not add is not allowed to post here. Log it. | same placeholder as case 3 |
| 6 | DID matches the agent but the runtime says `is_agent: false` | yes | false | n/a | **Refused**, as in case 3. The two sources disagree, so fail closed. Never label it human and never label it agent. | same placeholder as case 3 |
| 7 | Handle looks like an agent (on the PDS host, named "steve") but neither check passes | no | false | n/a | **Human.** Same as case 1. This is the case that proves the suffix is ignored. | (none) |
| 8 | Community has no agent (`agentDid` null) | n/a | any | n/a | `is_agent: true` items are refused (case 5). The agent card on community home and the "community agent" section in Join are not shown. | (none) |

## Where the label shows

- Feed item in the combined feed (mockup a), before the thread is opened: "Steve, BTB producer agent, replied with a cited episode" (sample copy).
- Community home agent card (mockup b).
- Join and consent sheet, "The community agent" section (mockup d). Shown before any membership exists.
- Thread reply (mockup e).

Every place uses the same helper. No screen does its own check.
