# Supabase auth integration — Authority One account layer

Wires **real Supabase authentication** into the fork so users get a persisted
session and the `/app/chat` agent channel is authorized with a live bearer token.
Additive and behavior-preserving: the existing atproto/PDS login is untouched.

Status: **code-complete, not deployed**. Verified with `tsc --noEmit` (no errors
in any changed file). `pnpm lint` is macOS-only — owner should re-run it.

---

## Files added

| File | Purpose |
|------|---------|
| `src/lib/supabase/env.ts` | Reads `EXPO_PUBLIC_SUPABASE_URL` / `EXPO_PUBLIC_SUPABASE_ANON_KEY`, falling back to the live Authority One project values so `pnpm web` works with zero setup. |
| `src/lib/supabase/client.ts` | The single Supabase client. Cross-platform storage via AsyncStorage (web + iOS + Android), `autoRefreshToken: true`, `persistSession: true`, PKCE. Exports `getFreshAccessToken()` (returns a valid access token, refreshing within ~60s of expiry; `null` when signed out). |
| `src/state/supabase/index.tsx` | React provider owning the session. Subscribes to `onAuthStateChange`, exposes sign-in/up/magic-link/Google/sign-out actions, runs native AppState auto-refresh, and **installs the agent-runtime token provider**. |
| `src/screens/AuthorityAccount/index.tsx` | Sign-in / sign-up screen (email+password, magic link, Google button). Route `/account`. |

## Files changed

| File | Change |
|------|--------|
| `package.json` | Added `@supabase/supabase-js@^2.45.4`. |
| `src/lib/agent-runtime/authToken.ts` | Comments updated — the provider is now wired by `#/state/supabase`; the dev-token path remains only as a pre-mount/test fallback. (Public contract `setSupabaseTokenProvider` / `getSupabaseAccessToken` unchanged.) |
| `src/App.web.tsx`, `src/App.native.tsx` | Mounted `<SupabaseSessionProvider>` just inside `<SessionProvider>`. |
| `src/Navigation.tsx` | Registered the `AuthorityAccount` screen. |
| `src/routes.ts` | Added `AuthorityAccount: '/account'`. |
| `src/lib/routes/types.ts` | Added `AuthorityAccount: undefined` to `CommonNavigatorParams`. |

---

## How a user signs in

1. Navigate to `/account` (route name `AuthorityAccount`). The signed-in view also
   links straight to **Talk to your agent** (`AgentChat`).
2. Enter email + password and tap **Sign in** (or **Sign up**). A magic-link option
   and a **Continue with Google** button are also present (Google is inert until the
   provider is configured in the Supabase dashboard — see below).
3. The session is persisted (AsyncStorage → device store on native, `localStorage`
   on web) and restored on next launch.

## How the token now flows to `/app/chat`

```
#/state/supabase (Provider mounts)
  └─ setSupabaseTokenProvider(getFreshAccessToken)      // module side-effect
        │
chatClient.streamChat()  →  getSupabaseAccessToken()    // authToken.ts
        │                         └─ delegates to the installed provider
        └─ getFreshAccessToken()  // refreshes if near expiry, else cached
                 └─ Authorization: Bearer <supabase access_token>  →  POST /app/chat
```

The same bearer is attached by `approvals.ts` for `POST /app/approvals`. When signed
out the provider returns `null` and the runtime responds 401 (already handled in
`chatClient.ts`).

## Relationship to the atproto/PDS login (coexistence)

The **Supabase session is the Authority One account layer** that authorizes the agent
channel. The **atproto/PDS/DID login (`#/state/session`) is unchanged** and continues
to power the social side. They are independent providers and do not conflict. Full
account-linking (mapping a DID ↔ a Supabase user) is intentionally **out of scope**
here — see the server step below.

---

## Env vars to set

Public, safe to ship in the bundle (defaults baked into `env.ts`, override per-env if
desired):

```
EXPO_PUBLIC_SUPABASE_URL=https://naaorgpquohrhwcniatp.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_5Dwa2Qs_sS1Ssj60hsAbNQ_h_SOC4FG
```

Optional, for hand-issued local testing before signing in:
`EXPO_PUBLIC_DEV_SUPABASE_TOKEN=<jwt>` (pre-mount fallback only).

## New dependency

`@supabase/supabase-js@^2.45.4`. The storage adapter reuses the already-present
`@react-native-async-storage/async-storage` (no new storage dep; Expo SecureStore not
needed). Run **`pnpm install`** before building.

> Note: a tiny local type stub was written to
> `node_modules/@supabase/supabase-js` to run `tsc` offline. Its version is
> `0.0.0-localstub`, which does **not** satisfy `^2.45.4`, so `pnpm install`
> replaces it with the real package. (If your install ever complains, just
> `rm -rf node_modules/@supabase` first.)

---

## Xcode / build steps (owner runs — this env can't build iOS)

1. `pnpm install` (pulls `@supabase/supabase-js`).
2. Web smoke test: `pnpm web` → open `/account` → sign up / sign in → confirm the
   session persists across reload and that `/agent` chat no longer 401s.
3. iOS:
   - `npx pod-install` (or `cd ios && pod install`) to link native deps.
   - `pnpm ios` (or open `ios/*.xcworkspace` in Xcode and Run). No extra native
     modules are introduced beyond what AsyncStorage already provides, so no
     additional Podfile edits are expected.
4. Android (when relevant): `pnpm android`.
5. Re-run `pnpm lint` (macOS) and `pnpm intl:build` if you want the new `<Trans>`
   strings extracted for translation (English renders fine without it).

### Optional — enable Google sign-in
The **Continue with Google** button calls `signInWithOAuth({provider:'google'})`. It
stays inert until you enable Google in **Supabase dashboard → Authentication →
Providers → Google** (client ID/secret + redirect URLs). On web it then redirects via
`window.location.origin`. Native Google needs deep-link/redirect setup, which is out of
scope for this pass (the button returns an informative message on native).

---

## SERVER-side step still needed (not done here)

For the runtime to actually accept the Supabase JWT, the **agent runtime must verify
it and map the user to their agent**:

1. **Verify the JWT.** Set `SUPABASE_JWT_SECRET` and `SUPABASE_PROJECT_URL` on the
   runtime (Cloudflare Worker), then **deploy**. Until deployed with these, `/app/chat`
   cannot validate the bearer.
2. **Map identity → handle.** Add an `/admin/app-index` row mapping the user's Supabase
   `sub` (and/or DID) → their agent handle `ada.pds.authority-one.com`, so an
   authenticated `/app/chat` request routes to the right per-user agent.

Do **not** deploy as part of this change — these are the owner's follow-ups.
