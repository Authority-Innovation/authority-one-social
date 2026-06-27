// ─────────────────────────────────────────────────────────────────────────────
// The single Supabase client for the app.
//
// This is the **Authority One account layer** — distinct from the atproto/PDS
// session that powers the social side (see `#/state/session`). The Supabase JWT
// it issues is the bearer that authorizes the agent channel at `/app/chat`
// (see `#/lib/agent-runtime/authToken.ts`).
//
// Storage: `@react-native-async-storage/async-storage` is used as the session
// store on BOTH platforms. On native it persists to the device store; its web
// build transparently falls back to `localStorage`, so one adapter covers web +
// iOS + Android (the rest of the app already relies on this — see
// `#/state/persisted`). Sessions therefore survive app launches.
// ─────────────────────────────────────────────────────────────────────────────

import {Platform} from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import {createClient, type SupportedStorage} from '@supabase/supabase-js'

import {SUPABASE_ANON_KEY, SUPABASE_URL} from './env'

const isWeb = Platform.OS === 'web'

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: AsyncStorage as SupportedStorage,
    // Persist the session and rotate the access token automatically before it
    // expires, so a long-lived app keeps a valid bearer for /app/chat.
    autoRefreshToken: true,
    persistSession: true,
    // On web we want to parse the `#access_token=…` fragment that magic-link /
    // OAuth redirects land on. On native there is no URL to parse (deep-link
    // handling for native OAuth is out of scope for this pass).
    detectSessionInUrl: isWeb,
    flowType: 'pkce',
  },
})

/**
 * Resolve a currently-valid Supabase access token, refreshing if it is missing
 * or within ~60s of expiry. Returns `null` when signed out.
 *
 * This is the function the agent-runtime token provider delegates to (see
 * `#/lib/agent-runtime/authToken.ts` wiring in `#/state/supabase`), so every
 * `/app/chat` request carries a fresh, unexpired bearer.
 */
export async function getFreshAccessToken(): Promise<string | null> {
  const {data, error} = await supabase.auth.getSession()
  if (error || !data.session) return null

  const session = data.session
  const expiresAtMs = (session.expires_at ?? 0) * 1000
  const aboutToExpire = expiresAtMs > 0 && expiresAtMs - Date.now() < 60_000

  if (aboutToExpire) {
    const refreshed = await supabase.auth.refreshSession()
    if (!refreshed.error && refreshed.data.session) {
      return refreshed.data.session.access_token
    }
    // Refresh failed (e.g. offline) — fall back to the still-cached token.
  }
  return session.access_token
}
