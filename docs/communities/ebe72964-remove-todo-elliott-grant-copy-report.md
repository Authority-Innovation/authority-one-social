# Remove TODO(Elliott) markers from AgentGrantRow copy (task ebe72964)

Base: `communities/integration` at `d6f45e754`. Flags unchanged (off).

## Change

Elliott signed off the members-only AgentGrantRow copy as-is on 2026-10-29
(21:40 NZDT). Commit `1fc5479cb` removes the 3-line `TODO(Elliott)` comment
above `label` in `src/features/communityAgent/AgentGrantRow.tsx`. No copy text,
default, request or endpoint changed.

```
git diff --stat d6f45e754 1fc5479cb
 src/features/communityAgent/AgentGrantRow.tsx | 3 ---
 1 file changed, 3 deletions(-)
```

All three deleted lines are `//` comment lines. This report is a separate
commit so the code commit stays comment-only.

## Search

`grep -rn "TODO(Elliott)" src docs` on the base found two hits:

1. `src/features/communityAgent/AgentGrantRow.tsx:40` - the grant-row copy
   marker. Removed.
2. `docs/communities/W2-T13-fix-sponsor-label-report.md:51` - left in place.
   It is a past task report that describes the marker that task added, not a
   live marker. Editing it would rewrite a historical record and would break the
   "comment lines only in AgentGrantRow.tsx" rule for this task.

No other `TODO(Elliott)` exists in `src` or `docs`.

## Tests

`jest src/features/communityAgent` (same flags as `pnpm test`, without
`--bail`): 2 suites, 25 tests, all passed.

`pnpm` is not on PATH and the worktree had no `node_modules`, so I ran jest
through `node` against a local `node_modules` junction to worktree
`1c9f639f-app-community-launch-con`, which has an identical `pnpm-lock.yaml`.
The junction is untracked and not committed.
