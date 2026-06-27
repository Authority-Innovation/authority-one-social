// ─────────────────────────────────────────────────────────────────────────────
// Supabase session token provider.
//
// The agent runtime authenticates /app/chat with the user's **Supabase session**
// bearer token (NOT the atproto/PDS session). The contract here is intentionally
// tiny — a function returning the current access token (or null when signed out) —
// so the rest of the network layer never imports the Supabase client directly.
//
// WIRED: `#/state/supabase` installs the real provider at startup via
// `setSupabaseTokenProvider(getFreshAccessToken)` (a module side-effect that runs
// when its Provider is mounted in App.{web,native}.tsx). That provider returns the
// live session's access token, refreshing it when at/near expiry, or null when
// signed out. The default below is only the pre-mount / test fallback.
// ─────────────────────────────────────────────────────────────────────────────

export type TokenProvider = () => Promise<string | null>

let provider: TokenProvider = () => {
  // Pre-mount / test fallback: until `#/state/supabase` installs the real
  // provider, return a hand-issued dev token if one is set, else null (the
  // runtime rejects un-authenticated requests with 401).
  return Promise.resolve(process.env.EXPO_PUBLIC_DEV_SUPABASE_TOKEN ?? null)
}

/**
 * Override the token provider. Called by the Supabase auth integration in
 * `#/state/supabase`: `setSupabaseTokenProvider(getFreshAccessToken)`.
 */
export function setSupabaseTokenProvider(next: TokenProvider): void {
  provider = next
}

/** Resolve the current Supabase access token, or null if not signed in. */
export async function getSupabaseAccessToken(): Promise<string | null> {
  return provider()
}
