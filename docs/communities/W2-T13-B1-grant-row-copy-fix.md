# W2-T13 fix pass: B1 grant-row copy (task a3f59220)

Fix commit: `93b496b4d` on `coord/independent-fix-pass-w2-t13-gran-a3f59220`.

**Elliott must confirm this wording before the row ships.** The relabel is a
wording decision (review option b).

## Copy before and after

| Where | Before | After |
| --- | --- | --- |
| Toggle label (with `agentName`) | Let {name} read this community for me | removed (`agentName` prop dropped) |
| Toggle label (default) | Let my agent read this community | Let this community’s agent read my posts here |
| Helper (with `agentName`) | {name} can give you recaps of threads you can already see. You can turn it off any time. | removed |
| Helper (default) | Your agent can give you recaps of threads you can already see. You can turn it off any time. | The community’s agent will be able to read what you post in this community, including members-only posts. Off unless you turn it on. You can turn it off any time. |

Unchanged: off by default, one `setAgentGrant(communityId, next)` call per
toggle, request body `{on}` untouched, no own-agent endpoint added. M1 to M3
and the minors were not touched.

The helper says "including members-only posts" because the review states the
grant may cover members-tier content. If the runtime does not grant that, the
sentence should be cut.

## Tests

- `pnpm test -- src/features/communityAgent`: 1 suite, 15/15 passed (was 14;
  added "copy names the community agent, never the person’s own agent", which
  asserts "community’s agent" and "members-only" appear and "Bob", "my agent",
  "your agent", "for me" do not). Two existing tests updated for the new copy.
- `eslint src/features/communityAgent`: clean.
- `pnpm typecheck`: the only errors are missing `src/locale/locales/*/messages`
  (catalogs not compiled; intl:compile is CI-only). No errors in touched files.

## Not verified

- Full jest suite not run (only this feature's suite).
- Not rendered on device or web; row is not mounted anywhere yet (M1).
- Translation catalogs not extracted (CI job).
- Pushed to the task branch, not to `communities/w2-agent-slot-ui`: the
  runner rules allow pushing only the task branch.
- Spec asked for a Co-Authored-By line for Claude Haiku 5.5; this run was Opus
  5.5, so the commit carries the Opus line to keep attribution accurate.
