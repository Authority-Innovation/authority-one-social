# Lexicons

Authority One lexicons, tracked in the fork so the client can generate types
from them.

```
lexicons/com/authorityone/
├── group/        com.authorityone.group.* (carried from the groups spike)
└── community/    com.authorityone.community.config (DRAFT)
```

## Codegen

```bash
pnpm lexgen         # regenerate src/lib/lexicon/generated (commit the output)
pnpm lexgen:check   # fail if the committed output is stale
```

`scripts/lexgen.mjs` runs `lex gen-api` from `@atproto/lex-cli` over every
JSON file here, then:

- writes type-only shims for referenced `app.bsky.*` / `com.atproto.*` defs
  that re-export from `@atproto/api`, so we do not vendor those lexicons;
- replaces lex-cli's `index.ts` (a full `XrpcClient` with record write helpers)
  with a types-only barrel. Reads and writes still go through the app agent.

`src/lib/lexicon/__tests__/lexicon.test.ts` runs the check, so a lexicon edit
without a regen fails `pnpm test`.

Generated `validate*` helpers cannot resolve the shimmed external lexicons at
runtime; nothing calls them today.

## Deviations from the spike copies

Nine `group/*.json` files are byte-identical to the spike (the test pins their
sha256). Two were invalid lexicons, which lex-cli rejects (it silently skipped
`defs.json`, so no `GroupView` type would be generated). Both fixes keep the
JSON on the wire unchanged:

| File | Problem | Fix |
| --- | --- | --- |
| `group/defs.json` | `groupViewBasic.required` lists `creator`, which is not in its `properties` | added `creator` (`did`), same as `groupView` |
| `group/getMemberships.json` | output `memberships.items` is an inline `object`; lexicon only allows `ref`/`union` there | moved it to `com.authorityone.group.defs#membershipView` and referenced it |

sha256 (LF) of the original spike copies, for reference:
`defs.json` `5b58aeb71b689b2327cf8e91f810488324c158324e94ae191d6a0b20a51f5dc5`,
`getMemberships.json` `6227767d11ba822bd47978ec67d2ceb082c0daf876c188de5781e21d10a600e1`.

## community/config.json (draft)

Singleton record (`key: literal:self`) in the repo that hosts the community's
`group.profile`. Public configuration only: members-only posts have no lexicon
and never touch a repo. `agentSponsor` being required when `agent` is set
cannot be expressed in lexicon and must be enforced by the AppView.
