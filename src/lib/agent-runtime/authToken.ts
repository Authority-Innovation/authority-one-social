// ─────────────────────────────────────────────────────────────────────────────
// Supabase session token provider.
//
// The agent runtime authenticates /app/chat with the user's **Supabase session**
// bearer token (NOT the atproto/PDS session). Supabase login is not yet wired into
// this fork, so this provider is a STUB.
//
// TODO(auth): replace `getSupabaseAccessToken` with the real implementation once
// Supabase auth lands in the app. The contract the rest of the network layer relies
// on is intentionally tiny — a function returning the current access token (or null) —
// so swapping the stub for the real provider touches only this file.
//
// Likely real implementation:
//   import {supabase} from '#/state/supabase'
//   const {data} = await supabase.auth.getSession()
//   return data.session?.access_token ?? null
// (plus a refresh path so an expired token is rotated before use.)
// ─────────────────────────────────────────────────────────────────────────────

export type TokenProvider = () => Promise<string | null>

let provider: TokenProvider = () => {
  // STUB: no Supabase session available yet. Returning null makes requests
  // un-authenticated; the runtime will reject them with 401 until this is wired.
  // Set EXPO_PUBLIC_DEV_SUPABASE_TOKEN to a hand-issued token for local testing.
  return Promise.resolve(process.env.EXPO_PUBLIC_DEV_SUPABASE_TOKEN ?? null)
}

/**
 * Override the token provider. Call this from the real Supabase auth integration
 * once it exists, e.g. `setSupabaseTokenProvider(async () => (await supabase.auth.getSession()).data.session?.access_token ?? null)`.
 */
export function setSupabaseTokenProvider(next: TokenProvider): void {
  provider = next
}

/** Resolve the current Supabase access token, or null if not signed in. */
export async function getSupabaseAccessToken(): Promise<string | null> {
  return provider()
}
