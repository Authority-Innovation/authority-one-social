# REVIEW - Wave 4 communities end to end: RUNTIME pieces (read-only)

- Task: `c7a487e1` (independent, priority normal, read-only)
- Reviewer: Authority One PC builder (headless), 2026-11-01
- Companion report (app side): `docs/REVIEW-WAVE-COMMUNITIES-1cc4c02e.md` (same branch)
- **Where this file lives:** the spec asks for a runtime report in the runtime repo. The builder's
  deny-list blocks writing outside this run's worktree (the runtime was reviewed from a read-only
  scratch clone), so this runtime report is committed here, on the social review branch
  `review/communities-wave-r302`, instead. No runtime branch was created or pushed.

## Heads reviewed

There are **no `communities/*` branches on the runtime remote**. The runtime communities code lives on:

| Head | Commit | What it is |
| --- | --- | --- |
| `origin/main` | `e4e6ba29` | All landed communities work: T5 door, T6 CommunityStoreDO (v12), T7 agent slot, F-GRANT, R1 admins (+fix), R2 launch (+fixes), R3 authorDid, seed route (c0d7c9df, e68bb777, 513fc833, 5e156f7e), dev clear-smoke (3687bd66, 4a3a5256). This report is anchored here. |
| `origin/deploy/dev-communities` | `cca6020d` | Not an ancestor of main (merge-base `eec9ca71`). Relative to main, for communities: the router wires `getStore` into the door, the door adds a `COMMUNITIES_STORE_ENABLED` gate, `itemsOf` is fixed for the DO's bare-key `list()`, and `sponsorView` (bfd5a63c) is added; `dev-clear.js` is absent. Reviewed as a diff against main. |
| `origin/docs/prod-staged-rollout-main` | `e1e19bc1` | `docs/PROD-STAGED-ROLLOUT-MAIN-2026-10-30.md` (stage list: S2 = v12 alone, S3 = communities dark). |

Commits touching the pieces, on main (`git log origin/main -- src/communities`): `d37fdb33` door, `2df6660f` CommunityStoreDO, `fb68c6fa` binding + v12, `64b2b80a`/`fcb0f339`/`64fb4950` agent slot, `8d9a6689`/`08f8d1cc` F-GRANT, `43613abc`/`79966ef4`/`dded26ea`/`1048d1e7` R1 admins, `ab686624`/`98592728`/`3148831a` R2 launch, `69151ea5` R3, `55e4fe74`..`4b7a8db3` seed route, `6d1bd057`/`6c9334f1` dev clear.

Unmerged communities runtime branches seen (log line only): `coord/community-posts-carry-author-did-a71f55d2` (fef2c746, a STOP report), `coord/member-community-response-carrie-bfd5a63c` (eabfbcdd; its code is on deploy/dev-communities).

Read in full on main: `src/communities/{door,store-do,store-client,keys,membership-commit,admins,launch,agent-slot,seed-config}.js`; the headers of `sealing.js` and `dev-clear.js`; the router mounts in `src/index.js` (688-707, 1476-1485); `resolvePrincipal` / `verifyConsoleSession` in `src/console.js` (339-445); `getAtprotoSession` in `src/pds-admin.js:138-152`; `community.agent_post` in `src/actions.js` (158-163, 215-216, 441, 1046-1052).

## What was run

| Run | Result |
| --- | --- |
| `node --test test/communities-*.test.js` at main `e4e6ba29` (9 files; scratch clone, `npm ci --ignore-scripts`, `scripts/write-build-info.mjs`) | **199 tests, 199 pass, 0 fail** |
| Same at `deploy/dev-communities` `cca6020d` (9 files) | **186 tests, 186 pass, 0 fail** |
| Full runtime `npm test`, workerd suite, lint | **NOT RUN** |
| Read the Worker deploy config file | **NOT RUN.** The builder deny-list blocks any command that names that file. The file was on disk for the store-DO test above (which pins the v12 migration and passed), but the reviewer did not read it. Bindings, `[env.*]` blocks, and whether Dev and prod share one `AO_ACCOUNT_CONFIG` Secrets Store secret are **NOT VERIFIED**. |

Nothing was deployed, no live system was contacted, and no feature branch was changed.

## Summary

The store isolation is solid: one DO per tenant, pinned to its tenant, per-tenant sealed values with the row bound in as AAD, and no fetch surface. Every member route re-reads the membership record server side on every call, so a stale token or a stale client list cannot read or write after a leave. The main gaps are in policy and lifecycle, not in the crypto:

1. Membership is **self-service**. Any provisioned customer who sends a community id from the directory with the current consent version becomes a member and can read the full history. There is no invite, allow-list, approval or ban. (HIGH-1)
2. There is **no server-side way to remove a member** (no admin remove or ban route), and a member who leaves can rejoin at will. (HIGH-2)
3. The agent **grant survives leave**, so the community agent would keep reading a former member's posts. (MEDIUM-1)
4. On **main**, the door is unreachable (the router never passes `getStore`), and against the real DO it would return empty timelines (`itemsOf` drops bare keys). The working door exists only on `deploy/dev-communities`, where **config alone** (two values) switches it on. There is no code-level production pin. (HIGH-3, MEDIUM-4)

## Findings

### HIGH-1 Privacy wall is consent-only: any authenticated customer can self-join any directory community and read all history
- **File:** `src/communities/door.js:476-525` (join), `:315-321`, `:62` (`COMMUNITY_ID_RE`)
- **Scenario:** Community `garden` holds private member posts. User X calls `GET /app/communities/garden/join-info`, then `POST /app/communities/garden/join {"consentVersion": N}`. X can be any principal with a provisioned agent account, or any holder of a `CONSOLE_CUSTOMER_TOKENS` entry. `join` checks only `consentVersion >= max(platform, community wording_version)`, then writes the membership. X then calls `/timeline` and pages through every post and reply ever written, including those from before X joined. Ids are short lowercase slugs, and a successful join (201) versus a refusal (404) also tells X which ids exist.
- **Fix:** Get an explicit product ruling. If communities are not open-join, add a server-side admission check (an invite record, an allow-list, or admin approval) inside the join commit, and consider a history cutoff at join time. **NOT VERIFIED** whether open join is intended: no spec on these heads says either way.

### HIGH-2 No server-side member removal or ban; membership cannot be revoked
- **File:** `src/communities/door.js:163-185` (route table), `src/communities/admins.js:122-156`
- **Scenario:** An admin wants to eject an abusive member. No route deletes another member's record: `/leave` only removes the caller, and `/admins` only changes roles. The member keeps reading and posting. If persuaded to leave, they can `POST /join` again at once (HIGH-1). An admin cannot delete another member's post either, because `delete` covers own posts only (`door.js:401-407`).
- **Fix:** Add an admin-only remove, plus an optional ban record that `join` checks. The remove should delete the membership and the agent grant in one `commitMembership`, with a ledger entry. Add admin post moderation.

### HIGH-3 No code-level production pin: on the dev-communities line, config alone turns the door on
- **File:** `deploy/dev-communities:src/communities/door.js` (`handleCommunities`: flag gate + `COMMUNITIES_STORE_ENABLED` gate), `deploy/dev-communities:src/index.js` (the door mount passes `getStore`); main `src/communities/seed-config.js:311-314`
- **Scenario:** The spec requires that config alone cannot turn the flag on in prod. On `deploy/dev-communities`, setting `communities.enabled: true` in `AO_ACCOUNT_CONFIG` plus `COMMUNITIES_STORE_ENABLED=1` opens every door route in any Worker that reads them. `dev-clear.js:19-21` itself says "Config and env are shared with production". If Dev and prod read the same Secrets Store `AO_ACCOUNT_CONFIG` (NOT VERIFIED; the deploy config was not read), then enabling communities to test Dev also flips prod's half of the gate. Only `COMMUNITIES_STORE_ENABLED` would then stand between prod and an open door. On main today, only the missing `getStore` wiring keeps the door shut (MEDIUM-4), and that is a bug, not a guard. The seed route on main already opens with `communities.enabled` + `COMMUNITIES_STORE_ENABLED` + `ADMIN_TOKEN`.
- **Fix:** Add a code-pinned environment guard, such as a constant that only the Dev environment sets, checked before the config read in the door, the seed route and dev-clear. If Dev shares `AO_ACCOUNT_CONFIG` with prod, give Dev its own secret.

### MEDIUM-1 Agent grant survives leave (and rejoin), so the agent keeps reading a former member's posts
- **File:** `src/communities/door.js:345-363` (leave deletes only the membership), `src/communities/agent-slot.js:162-170` (`agentMayRead` checks the grant record, never membership)
- **Scenario:** Member M turns their agent grant on, then leaves. `community/<id>/agent-grant/M` stays `on: true`, and M's posts stay in the store. `readCommunityForAgent` and the reply-parent check keep treating M's posts as readable. If M rejoins months later under a newer consent wording, the old grant applies with no new consent: the grant records `consentVersion` (`door.js:442-443`), but nothing ever compares it.
- **Fix:** Delete the agent grant in the leave commit, and in any future remove. Make `agentMayRead` require a current membership for the author and a grant `consentVersion` that matches the config's current one.

### MEDIUM-2 Seed route keeps the old sponsor when the agent DID changes, and config writes are not audited
- **File:** `src/communities/seed-config.js:252-298` (merge), `:346-356` (write, no ledger)
- **Scenario:** Admin A launched agent X, so `agentSponsor = A`. An operator later seeds `{"agent": "did:plc:Y"}`. The merge keeps `agentSponsor = A`, `readAgentSlot` accepts it, and A is now the accountable sponsor of an agent A never launched. Changes to the agent, to `creator` (which controls admin seeding, `admins.js:159-188`), to `autoReply` and to the wording write no ledger entry. Join, leave, admin changes and launch all do.
- **Fix:** Whenever the merged `agent` differs from the stored one, clear `agentSponsor` (or refuse the write) so a fresh launch is required. Write a `config-seed` ledger entry in the same commit.

### MEDIUM-3 Revoking a grant does not reach agent proposals already queued
- **File:** `src/communities/agent-slot.js:293-318`, `:247-283`; `src/actions.js:158-163`
- **Scenario:** With M's grant on, the agent reads M's post and queues a top-level `community.agent_post` whose `params.text` summarises it. M then revokes. On approve, `writeAgentItem` re-checks the grant only for a reply's parent, so a top-level post derived from M's content is written anyway. The text also sits in the approval queue's storage, outside the sealed tenant store. This is not live today: `proposeAgentPost`, `readCommunityForAgent` and `communityAgentClient` have no callers on main (grep). Treat it as a design note for when they are wired.
- **Fix:** Record the source item ids on each proposal and re-run `agentMayRead` on every one at execute time. Drop any proposal whose sources are no longer readable.

### MEDIUM-4 Main's door is dead code and broken against the real DO; the fix exists only on deploy/dev-communities
- **File:** main `src/index.js:1481-1483` (no `getStore` passed); main `src/communities/door.js:464-468` + `:129-135` (`itemsOf`/`entriesOf` throw away the bare-key array that `store-do.js:185-190` returns)
- **Scenario:** Prod stage 3 of the rollout ships from main. With every flag on, main's door still answers the dark 404 because there is no `getStore`. If someone wires `getStore` without the `itemsOf` fix, `timeline`, `export` and `roster` return empty lists. The 199 passing tests use in-memory fakes whose `list()` returns a `Map` or entries, so they do not catch this.
- **Fix:** Land the dev-communities door and router changes on main as one reviewed unit, together with HIGH-3's pin. Add a door test whose fake store `list()` returns bare keys, as the DO does.

### LOW-1 Member ids and item ids are cleartext in DO storage keys
- **File:** `src/communities/keys.js:15-29`, `src/communities/store-do.js:86-89`
- **Scenario:** Values are sealed, but keys of the form `community/<id>/member/<memberId>` expose the member list (account handles) and post timing to anyone with DO storage access: an operator, a backup, or a future debug export.
- **Fix:** Use an HMAC of the member id under a per-tenant key in record names, or accept this and document it as operator-visible metadata.

### LOW-2 Any admin can silently take over sponsorship; there is no admin hierarchy
- **File:** `src/communities/launch.js:68-132`, `src/communities/admins.js:122-156`
- **Scenario:** A newly promoted admin calls `/agent/launch` and replaces the current sponsor. They can also demote the creator. Both actions are in the ledger (`previousSponsor`, `admin-revoke`), but no route reads the ledger, so nobody sees them.
- **Fix:** Require the current sponsor (or the creator) to approve a sponsor change, and give admins a read-only view of the ledger.

### LOW-3 Static customer token map is an identity that never expires
- **File:** `src/console.js:435-441`
- **Scenario:** A `CONSOLE_CUSTOMER_TOKENS` entry authenticates as `role: customer`, with no DID and no expiry, so it can join and read any community (HIGH-1). Revoking it takes a secret edit and a redeploy. Membership is still re-checked on every request, so leave (and remove, once it exists) still applies.
- **Fix:** Exclude the token-map fallback (`via` absent) in `callerFromRequest`, or require a `did` for community access.

### INFO
- **Storage isolation (good).** One DO per tenant via `idFromName("community-store:"+tenantId)` (`store-client.js:62-81`). `#scope` refuses a mismatched `ctx.id.name` and pins the tenant on first use (`store-do.js:146-166`). Rows carry the encoded tenant as a prefix (`:121`). Values are sealed with AES-256-GCM under a per-tenant HKDF key, with tenant and key as AAD (`sealing.js:1-16`). `fetch()` answers 404 (`:141`). Two community ids mapped to one tenant share a DO and rely on `community/<id>/` prefixes. Those are encoded and slash-terminated, so community `a` cannot list `ab`.
- **Cross-community admin (good).** `setAdmin` uses the caller's record for the routed community and requires the target's `communityId` and `tenantId` to match (`admins.js:128-136`). An admin of one community cannot act on another.
- **Read revocation (good).** Every member route reads `community/<id>/member/<caller>` from the store on each request (`door.js:333-335`), and responses carry `cache-control: no-store` (`:71`). Nothing caches membership or grants server side (`agent-slot.js:147-170`).
- **Members content never reaches a PDS from the runtime.** `src/communities/*` makes no `fetch` and no `com.atproto` call (grep). The only network call is `getAtprotoSession`, for identity.
- **v12 is irreversible**, per rollout stage 2 (`PROD-STAGED-ROLLOUT-MAIN-2026-10-30.md:224-276`): an additive `new_sqlite_classes = ["CommunityStoreDO"]`. Once stage 3 has written data, never add a `deleted_classes` migration. Nothing here changes that: the R1 role is a field on existing records and needs no new class.
- **`isMembership` vs `isCurrentMembership`.** The door ignores the `active`, `status`, `removedAt` and `leftAt` fields that `launch.js:56-62` honours. No writer sets them today. If a soft remove is added (HIGH-2), the door must use the same predicate.
- **dev-clear is on main but not on `deploy/dev-communities`,** the opposite of what its name suggests. It is pinned in code to `ao-dev-test`, behind four gates plus a store marker (`dev-clear.js:1-60`). Confirm whether it is meant to ship to prod at all.

## Triage (proposed fix tasks, not fixes)

| # | Title | Target branch | Priority | Depends on |
| --- | --- | --- | --- | --- |
| R1 | Decide open-join vs admission; add a server-side admission check (invite / allow-list / approval) in the join commit (HIGH-1) | runtime `main` (via a `coord/` branch) | high | product ruling from Elliott |
| R2 | Admin remove-member + ban record + admin post delete, atomic with the ledger and the grant delete (HIGH-2, part of MEDIUM-1) | runtime `main` | high | R1 ruling (ban semantics) |
| R3 | Code-pinned non-prod guard for door, seed and dev-clear; separate Dev `AO_ACCOUNT_CONFIG` if shared (HIGH-3) | runtime `main` + `deploy/dev-communities` | high | a human checks the deploy config (deny-listed for builders) |
| R4 | Land the dev-communities door/router wiring + `itemsOf` fix on main, with a bare-key fake-store test (MEDIUM-4) | runtime `main` | normal | R3 (land together) |
| R5 | Delete the grant on leave; `agentMayRead` requires current membership + matching consentVersion (MEDIUM-1) | runtime `main` | normal | none |
| R6 | Seed route clears the sponsor on agent change; ledger every config seed (MEDIUM-2) | runtime `main` | normal | none |
| R7 | Re-check proposal source ids at execute (MEDIUM-3) | runtime `main` | low | before proposeAgentPost is wired |
| R8 | Hashed member ids in record names, ledger read route for admins, sponsor-change approval, exclude token-map callers (LOW-1..3) | runtime `main` | low | R2 |
