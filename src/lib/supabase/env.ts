// ─────────────────────────────────────────────────────────────────────────────
// Supabase project configuration.
//
// These are the PUBLIC project URL + anon (publishable) key. They are safe to ship
// in the client bundle — the anon key only grants what Row Level Security allows,
// exactly like the atproto PDS host is public. They are read from EXPO_PUBLIC_*
// env vars so dev/staging/prod can repoint without code changes, falling back to
// the Authority One project values so `pnpm web` works with no extra setup.
//
// Set in your shell / .env (optional — defaults below are the live project):
//   EXPO_PUBLIC_SUPABASE_URL=https://naaorgpquohrhwcniatp.supabase.co
//   EXPO_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_5Dwa2Qs_sS1Ssj60hsAbNQ_h_SOC4FG
// ─────────────────────────────────────────────────────────────────────────────

const DEFAULT_SUPABASE_URL = 'https://naaorgpquohrhwcniatp.supabase.co'
const DEFAULT_SUPABASE_ANON_KEY =
  'sb_publishable_5Dwa2Qs_sS1Ssj60hsAbNQ_h_SOC4FG'

export const SUPABASE_URL: string =
  process.env.EXPO_PUBLIC_SUPABASE_URL ?? DEFAULT_SUPABASE_URL

export const SUPABASE_ANON_KEY: string =
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? DEFAULT_SUPABASE_ANON_KEY
