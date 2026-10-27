# Autonomous log (communities docs)

The build line at `569b3b240` has no root `AUTONOMOUS-LOG.md`, and this task may only change `docs/communities/**`, so the entry lives here.

## 2026-10-28 - W1-T16 design and UI spec (task 8f2a732a)

- **Branch:** `coord/communities-w1-t16-design-ui-spe-8f2a732a`, based on `569b3b240`.
- **What changed:** docs only, all under `docs/communities/`: `UI-SPEC.md`, `STATE-MATRIX.md`, `AGENT-LABEL.md`, `APP-STORE-NAMES.md`, `OPEN-QUESTIONS.md`, this log.
- **Code, config, flags:** none changed. No flag added. No secrets, no real DIDs.
- **Checked against code:** every `file:line` on the build line was read at `569b3b240`. Refs to sibling wave-1 branches (T1 `345180401`, T3 `cc80918e1`, T4 `11a255da3`, T8 `d52f1bd82`) were read on those branches and are marked [verify once merged].
- **Findings worth a look:** `isAgentHandle` suffix heuristic exists (`src/lib/agent-runtime/config.ts:225-243`); the Group stub's data layer writes to the PDS (`src/state/queries/group.ts:8`, `:255`, `:262`, `:299`, `:366`); T8's post author has no DID and no sponsor field, so N1 cannot be checked yet; T8's `agentGrant` means something other than the mockup's own-agent toggle.
- **Tests:** not run. The change is Markdown only and touches nothing the Jest suite loads.
- **Not run, by rule:** `wrangler`, `check:bundle` (both deny-listed), any deploy, EAS, TestFlight or store action.
- **Verdict:** deliverables complete as a draft for review. 18 open questions, each with a default, in `OPEN-QUESTIONS.md`.
- **Not done:** no name clearance performed (checklist only); no runtime contract changes; copy marked [proposed] needs a product decision.
