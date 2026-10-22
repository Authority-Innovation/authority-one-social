# Social app: Signature sign-in, P2b client (2026-10-22)

Branch `feat/social-ao-signature-p2b`, based on `origin/main` 571924785. Plan: `authority-one-spike/ao-signature-signin-plan-2026-10-22.md` §1–§3, §6 P2b, §6a. Server contract: pilot-agent-runtime `feat/sig-signin-clients-2026-10-23` (read only). Parity: Authority Studio P2a (capture-engine PR #74).

**Dark, nothing armed.** Every `EXPO_PUBLIC_AO_SIGNATURE_*` value is unset, so `AO_SIGNATURE_CONFIG` is `null`. While it is null:
- no button, account section, picker or shell is drawn (each component returns `null` before any hook);
- nothing calls Janus or the runtime's `/auth/*` routes;
- `expo-crypto` and `expo-secure-store` are never `require`d (lazy, inside functions only);
- the agent-runtime bearer is the PDS `accessJwt`, byte for byte;
- `app.config.js` `scheme` stays exactly `'one'`.

No Janus, PDS or runtime call was made. No build, no TestFlight, no secret, no account.

## What was built

All logic is in `src/features/aoSignature/` and is unit-tested. The app shell only gained hook points.

| Part | Where | What |
|---|---|---|
| Config | `config.ts` | Per-platform parse, fail-closed. Anything partial, non-https or off the bounce allow-list means dark. The runtime URL must have the **same origin** as `EXPO_PUBLIC_AGENT_RUNTIME_URL`, because the `aos1.` bearer replaces the token the `/app/*` clients send and must never go to another host. |
| PKCE | `pkce.ts`, `cryptoPort(.web).ts` | S256 (verifier 43 chars, RFC 7636 vector tested), plus a new state and nonce per attempt.<br>State is `as.authorityone(-dev).<random>` on native, which is what `janus-bounce.js markedScheme` accepts. Web has no bounce, so its state is the random part only.<br>The callback check requires exactly one state, byte-equal, plus one code. `error=access_denied` means cancelled. A flow older than 10 minutes is refused. |
| Redeem | `client.ts`, `wire.ts` | `POST /auth/janus/session` in **grant mode** (see below) with `{grant:{…, client_id}, nonce[, link_code]}`.<br>A normal sign-in sends no `Authorization`. Link mode sends `Bearer <PDS jwt>` + `X-Authority-Auth: atproto`.<br>**Fail-closed decode:** `ok`, one of the three outcomes and a `did:` are required. `aoSession.token` must be `aos1.` (3 parts), unexpired, and its signed payload must name the same DID and sid. A link must come back `linked` to the code's DID.<br>The window-bound PDS `session` is never read or kept. A pre-v2 runtime answer becomes `no-ao-session`. |
| AO session | `store.ts`, `storage(.web).ts`, `session.ts` | **Races:** every action applies its result only if the session it started from is still current (see Review fixes). Every runtime call times out after 20 s.<br>**Storage.** Native uses `expo-secure-store` with `AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY` (not in iCloud Keychain or encrypted backups). Web keeps the token in memory only (see "Web storage"). A record that fails decode at boot is wiped.<br>**Bearer** (`authToken.ts`). The AO token is used only when it belongs to the PDS account signed in now (or no PDS account is signed in), **and** only for a request to the pinned runtime origin. A different DID keeps its own PDS token. It is sent as plain `Bearer aos1…` with no `X-Authority-Auth` (resolvePrincipal branch 2b).<br>**Refresh.** At most every 12 h, on app foreground, only inside the 24 h liveness window. A token past liveness is marked `reverify` without spending the call.<br>**Refresh answers:**<br>• `janus-reverify` marks the record; the token works until its exp, and the account section shows "Continue with Authority Signature".<br>• Any other 401 ends the session ("Your Authority Signature session ended — sign in again.").<br>• A network failure or 5xx backs off 15 min.<br>**Sync.** `GET /auth/ao/session` at most every 10 min on foreground picks up a primary chosen elsewhere. A 401 there ends the session (signed out everywhere, unlinked, revoked).<br>**Sign-out** (`/auth/ao/signout`): the device forgets the session even when the runtime can't be reached.<br>**Sign out everywhere and Unlink** (`/auth/ao/signout-everywhere`, `/auth/ao/unlink`): the device signs out only after the runtime confirms. Both sit behind a confirmation prompt.<br>**PDS sign-out:** signing out of the PDS account also signs out its AO session (`state/session` hook). |
| Link | `signIn.ts prepareLink/linkProofFor`, `AccountSection.tsx` | "Link Authority Signature" in Account settings runs:<br>1. `POST /auth/ao/link-code` with the current PDS session, refreshed first if less than 15 minutes remain;<br>2. the Signature sheet;<br>3. the redeem with the **same** PDS jwt plus `link_code`.<br>Two cases are refused **before** the redeem: an expired code, or a different signed-in account. A code minted for another DID is refused too. |
| Picker | `picker.ts`, `AgentPicker.tsx`, `Shell.tsx` | A pure state machine.<br>• "Create my agent" (`POST /app/agents {handle,name}`). A null or absent `primary` is never adopted: the list is re-read and the choices say why.<br>• "Use an agent you've been given" (`POST /app/agents/primary {agent}`), limited to the listed set.<br>• Any primary ends the picker.<br>**Re-entry:** a 403 `not-provisioned` on `GET /app/agents` (agentsClient) or `needsAgent` from sync. |
| Shell | `createNativeStackNavigatorWithAuth.tsx`, `Shell.tsx` | A Signature-only person (AO session, no PDS session) gets the AO shell: the picker, or "You're signed in to Authority One" with the account actions and "Sign in with your handle". A PDS user whose AO session needs an agent also gets the picker. |
| Words | `errors.ts` | The Studio mapping, word for word, as lingui `msg` descriptors. Covered: `owner-exists`, `already-bound`, `unlinked-contact-support`, `full-session-required`, `not-a-person`, `not-an-owner`, `rate-limited`, `link-code-invalid` (start again), `no-verified-email`, `not-allowlisted`, `provision-failed`, the `*-unavailable` family, 401, 429, 5xx, 403, plus the picker's 402, `not-your-agent`, `invalid-handle` and `not-provisioned`. |

### Why the runtime exchanges the code (grant mode), on every platform
The runtime already verifies everything strictly: JWKS, the ES256 pin, `iss`, `aud`/`azp`, `exp`, the nonce against the **signed** id_token, the same subject, the same client (`grant.client_id`), and Janus userinfo. Exchanging on the server means:
- **No tokens on the device.** No Janus access, refresh or id token ever lands on the device or in a browser.
- **No verifier to ship.** There is no JWKS/ES256 verifier in JS, and Hermes has no WebCrypto.
- **No CORS from Janus.** Expo web needs no CORS from the Janus token endpoint.
- **One code path** for iOS, Android and web.

The PKCE verifier stays in the app until the redeem.

**Trade-off:** there is no client-side `logout?scope=local`, because the app holds no Janus token to revoke (the runtime discards the one it gets). Studio holds the Janus pair for exactly this. See open items.

### Web
- **The redirect.** A full-page redirect to Janus, back to this app's `…/auth/janus/callback` (`browser.web.ts`). `App.web.tsx` calls `captureAOSignatureWebCallback()` before the navigator reads the URL. It takes the code and the pending attempt into memory and `replaceState`s the address bar back to where the person was (same-origin paths only).
- **Why not expo-web-browser's popup.** Mobile browsers block popups, Janus's consent page may break out of a popup, and the popup handshake parks the code-bearing URL in localStorage.
- **What survives the redirect.** The pending attempt (verifier, state, nonce, and in link mode the minting PDS jwt) is kept in **sessionStorage**: this tab only, at most 10 minutes, and deleted when read back. The PDS session itself already lives in localStorage on web, so the PDS jwt adds no new exposure.
- **Web storage.** The runtime returns the 30-day bearer in JSON and has no httpOnly-cookie session (its `/app/*` CORS is Bearer-only, no credentials). So the AO token is kept **in memory only**, never in localStorage.
  - Residual risk: an XSS on the app origin could read it while the tab is open, the same exposure the PDS session already has on web.
  - A reload signs the person out of Signature. Continuing is one tap while Janus's browser session lives.

## Arming on Dev
All values are public identifiers, set as build env (EAS profile / `.env` / Cloudflare Pages env). **Native: a NEW native build is required**: `expo-crypto` and `expo-secure-store` are new native modules, so do not arm through OTA onto an older binary.

```sh
EXPO_PUBLIC_AO_SIGNATURE_ISSUER=https://gemyfvrahreujominqdl.supabase.co/auth/v1      # Janus DEV, exact
EXPO_PUBLIC_AO_SIGNATURE_AUTHORIZE_BASE=                                              # optional branded host
EXPO_PUBLIC_AO_SIGNATURE_RUNTIME_URL=<same origin as EXPO_PUBLIC_AGENT_RUNTIME_URL>
EXPO_PUBLIC_AO_SIGNATURE_AUDIENCE=                                                    # only if Beau wants audience=
# iOS
EXPO_PUBLIC_AO_SIGNATURE_CLIENT_ID_IOS=<Beau: AO social iOS Dev client>
# Android
EXPO_PUBLIC_AO_SIGNATURE_CLIENT_ID_ANDROID=<Beau: AO social Android Dev client, or the iOS one if Janus allows>
# native (both)
EXPO_PUBLIC_AO_SIGNATURE_SCHEME=authorityone-dev      # also registers the scheme in app.config.js
EXPO_PUBLIC_AO_SIGNATURE_APP_REDIRECT_URI=https://app-dev.authority-one.com/auth/janus/app-callback
# web (Cloudflare Pages env for the Dev web build)
EXPO_PUBLIC_AO_SIGNATURE_CLIENT_ID_WEB=<Beau: AO social web Dev client>
EXPO_PUBLIC_AO_SIGNATURE_WEB_REDIRECT_URI=https://<dev web app host>/auth/janus/callback
```

**Janus clients needed (Beau addendum §6a, item 2):** three Dev clients for `com.authorityone.app`. All are public clients with PKCE S256, scopes `openid email profile`, the AO audience, and `authority_principal_id` stamped.

| Client | Redirect |
|---|---|
| iOS | `https://app-dev.authority-one.com/auth/janus/app-callback` |
| Android | the same, or `/auth/janus/android-callback`. It may share the iOS client if Janus allows; the env takes either. |
| Web | `https://<dev web host>/auth/janus/callback` |

**Runtime side (Elliott, per the SIGNATURE-SIGNIN runbook):**
- `JANUS_AO_CLIENT_ID` lists all three ids (comma list), alongside Studio's.
- `JANUS_AO_REDIRECT_URIS` holds the app-callback URI and the web callback URI. Grant mode checks the redirect exactly.
- `AO_SIGNIN_V2=1` and `AO_SESSION_SECRET` are set.

## Tests
`npx jest src/features/aoSignature`: **18 suites, 169 tests, all pass.** The full suite: **140 suites, 1549 passed (28 todo), 0 failed.** (First commit: 10 suites / 119 tests. First review round: 14 / 143. Second round: 18 / 169.)

| Suite | Covers |
|---|---|
| `config` | Dark in this build; per-platform arming; 10 refusal cases; the runtime-origin pin. |
| `pkce` | The RFC 7636 S256 vector; state shape; new values per attempt; authorize URL; callback check (foreign, double or missing state, no code, cancel, Janus error, expired); grant shape incl. `client_id`. |
| `wire` | **Redeem decode, fail-closed:** pre-v2 runtime, null session, non-aos1, foreign DID or sid, expired, bad DID, ok:false, unknown outcome. Link outcome and DID. The PDS window token is never kept. Picker list decode. |
| `client` | Exact headers per route (no auth on redeem; PDS + atproto marker on a link; `aos1` without a marker); code-over-error; transport; refresh decode; link-code checks; picker routes. |
| `session` | Store round-trip, wiping bad records, the bearer DID rule. Renewal policy, liveness, reverify. **Refresh outcomes:** refreshed, reverify, ended, backoff. Sync. 403 re-entry. **Sign-out rules:** sign-out clears even when offline; sign out everywhere and unlink clear only after confirm; PDS sign-out of the same DID only. |
| `signIn` | Browser then redeem with the flow's nonce, state and verifier. Cancel and foreign state never reach the runtime. **Link ordering:** link-code, then sheet, then redeem with the same jwt and code. A short PDS token refreshes first. No PDS session, a foreign code DID, an expired code, or an account switch are each refused before the redeem. |
| `picker` | The full state machine: null primary re-read with a note, a local invalid name, select limited to the set, busy phases ignore taps, effects per phase. |
| `errors` | Every refusal's words (Studio parity) and the picker words. |
| `browserWeb` | sessionStorage only; the callback taken into memory and wiped from the URL and storage; an expired attempt dropped; an off-site `returnTo` never followed; other paths untouched. |
| `race` | A refresh that rotates the token mid sign-out / everywhere / unlink still ends signed out. Late answers for a replaced session are dropped: refresh 200, refresh 401, reverify, sign-out, sign out everywhere, unlink, sync 200 and sync 401 for account A never touch account B's record. The picker's primary only lands on the session it ran for. A new sign-in revokes the old sid first, best effort. |
| `bearerHosts` | Which hosts get the AO bearer: the pinned runtime origin only. A foreign origin, a look-alike host, http, and garbage all get the PDS token. `createLiveMatch` to a game server on another origin sends the PDS token; to the runtime itself, the AO session. |
| `lifecycle` | The armed lifecycle's wiring: a foreground during boot doesn't tick, boot ticks once, later foregrounds tick; a FAILED boot still lets foreground ticks run; overlapping foregrounds share one tick. |
| `shellPickerKey` | A session swap remounts the picker (`key={record.sid}`); fails without the key. |
| `bearerCallSites` | Source scan: every no-URL call of the bearer getter is in a client built on the agent-runtime config (no literal hosts, no other base env, no game-server base); `createMatch` passes its URL. |
| `appConfigParity` | `app.config.js`'s scheme registration agrees with `parseAOSignatureConfig` over 17 env cases × iOS / Android / local prebuild. |
| `singleFlight` | Overlapping calls share one run; a failed run releases the guard. |
| `usePickerMachine` | Under a real `<StrictMode>`: one load, a token rotation while `creating` never re-POSTs `/app/agents`, the next phase uses the current token, and an answer for session A that lands after a swap to B is dropped. |
| `dark` | Config unset: no client; button, account section and lifecycle render `null`; the gate is always null; `getAgentRuntimeAccessToken()` returns the PDS token; store writes are inert; zero `fetch`; `expo-secure-store` and `expo-crypto` never required. |

**Checks on changed files:**
- **Typecheck:** `pnpm typecheck` (tsgo, whole project) is clean.
- **ESLint:** clean on every changed and new file. One pre-existing warning remains, `Login/index.tsx:107` (`ax` dependency), which is not mine.
- **Prettier:** applied. It also reflowed a pre-existing mis-indent in the `App.native.tsx`/`App.web.tsx` provider trees (whitespace only).
- **Not run:** `intl:extract`, per the repo rules (nightly CI).

No device or simulator run: no native builds were allowed.

## Review fixes (second commit, after the fresh review of `bfefc9dda`)
1. **The AO bearer only goes to the pinned runtime (MEDIUM).**
   - **The gap:** `createMatch.ts` sent `getAgentRuntimeAccessToken()` to `GAME_SERVER_BASE_URL`, which `EXPO_PUBLIC_GAME_SERVER_URL` can move to another origin.
   - **The fix:** `getAgentRuntimeAccessToken(targetUrl?)` and `aoRuntimeBearer(…, targetUrl)` now return the AO token only when the target's origin equals the pinned `EXPO_PUBLIC_AO_SIGNATURE_RUNTIME_URL` origin. Anything else gets the PDS token, and an unparseable URL counts as foreign. `createMatch` passes its URL.
   - **Callers without a URL:** every other caller builds its URL from `AGENT_RUNTIME_BASE_URL`, which the config already pins to that origin. `createMatch` was the only consumer on another base.
2. **Session races (MEDIUM).**
   - **The rule:** every async action (refresh and its 401/reverify, sign-out, sign out everywhere, unlink, sync, the picker's primary, the 403 re-entry) captures the session it started from (sid + token). It applies its result through `patchAORecordIf` / `clearAORecordIf` only if that session is still current. A late answer is `stale` and dropped.
   - **Timeout:** every runtime call has a 20 s timeout (`AO_REQUEST_TIMEOUT_MS`). The request is aborted and the call ends as `transport`.
3. **Picker re-POST (LOW-MED).** The picker's side effect now runs once per phase object (`usePickerMachine`), keyed on phase identity with the token read from a ref. A token refresh or StrictMode's double effect can't repeat `POST /app/agents`, and the reducer ignores a load answer that no longer fits the phase.
4. **Overlapping ticks (LOW).** The refresh/sync tick is single-flight, and AppState `active` ticks start only after the boot run (whose own tick covers boot).
5. **403 from another account (LOW).** A 403 `not-provisioned` changes the AO record only when that request carried this AO session's own token.
6. **Scheme without config (LOW).** `app.config.js` registers `authorityone(-dev)` only when the full native config is present: issuer, runtime, scheme, the bounce redirect on the right path, and an iOS or Android client id. A scheme-only env stays `'one'`.
7. **Old session on re-sign-in (LOW).** A new sign-in, or a reverify "Continue", revokes the previous sid first (`adoptRedeem`). This is best effort: a failure never blocks the new session, and the same sid is never revoked.

**Not changed, on purpose:** the web PKCE attempt in sessionStorage (verifier, state, nonce, and the minting PDS jwt in link mode). That is for the user to sign off.

## Review fixes, round 2 (third commit, after the review of `18cfda2fe`)
1. **M1: a user's sign-out could lose to a refresh.**
   - **The bug:** user-initiated ends matched sid AND token. A refresh keeps the sid and rotates the token, so a sign-out racing a refresh was dropped as stale, and the device kept the new token for a revoked sid.
   - **The fix:** sign out, sign out everywhere and unlink (and the PDS sign-out cascade, which goes through sign out) now clear by **sid + DID** (`clearAORecordIfSignIn`).
   - **Unchanged:** server-driven results (refresh, sync, the 401 end) and 403 attribution still match sid + token.
2. **M2: picker state could survive a session swap.** `AOAgentPicker` is keyed `key={record.sid}`. `usePickerMachine` also captures the sid when each phase starts and drops an answer that lands after the session changed, so A's primary can never land on B.
3. **L2: app.config arming didn't fully mirror config.ts.** It is now one helper, `aoSignatureNativeScheme`, which mirrors `parseAOSignatureConfig` for native:
   - the runtime must be on the same origin as `EXPO_PUBLIC_AGENT_RUNTIME_URL` (or its default);
   - the client id is platform-specific via `EAS_BUILD_PLATFORM` (either platform for a local prebuild);
   - a client id containing whitespace or a comma is refused;
   - `?`/`#` are rejected; the authorize base, scheme and bounce path are checked.

   It can't be literally shared, because `app.config.js` is plain node and can't import the TS module, so `appConfigParity.test.ts` holds the two together. Any mismatch keeps `scheme 'one'`.
4. **L3: a failed boot blocked foreground ticks.** `booted` is now set in `.finally`, after a `.catch`. Wiring test added.
5. **L4: StrictMode wasn't really exercised.** The picker hook test now renders under a real `<StrictMode>`.
6. **L1: the no-URL default stays.** About 25 runtime clients rely on it, so it is unchanged. `authToken.ts` now documents the rule, and `bearerCallSites.test.ts` enforces it over the source tree.

## Open items
1. **Runtime CORS for web (blocks web).** `/auth/janus/session` and `/auth/ao/*` send no CORS headers, so the browser can't call them from the web app's origin.
   - The fix is a runtime change: `appCorsHeaders` on those routes, with `X-Authority-Auth` added to the allowed headers for web link mode.
   - The `/app/*` picker routes already have CORS.
2. **Signature-only people have no social timeline.** By design the lane never hands a PDS session to the device. A person with only a Signature identity gets the AO shell (picker, account actions, "Sign in with your handle"), not the atproto feed. Making the social side work needs a decision, for example a refreshable server-held PDS session proxied for the app, or PDS OAuth.
3. **No Janus `logout?scope=local`.** It isn't possible from the app in grant mode, because the app holds no Janus token. Options:
   - the runtime calls logout right after its exchange, since it discards the tokens anyway;
   - accept the Janus session's natural expiry until Beau's `end_session_endpoint`.
4. **Web callback route.** Confirm the Pages deploy serves `index.html` at `/auth/janus/callback` (SPA fallback).
5. **Android backup.** Secure-store values sit in Keystore-encrypted prefs. A restored backup can't decrypt them, so the app starts signed out. Excluding them from backup would be cleaner.
6. **Per-request 401 repair.** The existing `/app/*` clients aren't wrapped, so a 401 between syncs shows their usual "signed out" state until the next foreground sync or refresh.
7. **`/public/chat`.** It gets the `aos1.` bearer as its optional viewer bearer for AO users. Confirm the runtime ignores or accepts it (that path is fail-open).
8. **Notices.** `GET /auth/ao/notices` (`signature-linked`) isn't shown yet. Studio doesn't show it either.
9. **Silent reverify.** The same as Studio: reverify is the ordinary sheet (one tap, non-ephemeral), not a silent refresh.
