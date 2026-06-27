// ─────────────────────────────────────────────────────────────────────────────
// Authority One account layer (Supabase session) context.
//
// This provider owns the Supabase auth session and exposes sign-in/up/out
// actions to the UI. It is INDEPENDENT of the atproto/PDS session in
// `#/state/session`: the PDS/DID login authenticates the social side, while this
// Supabase session authorizes the agent channel (`/app/chat`). The two coexist;
// account-linking (mapping a DID ↔ a Supabase user) is a server-side concern and
// out of scope for this layer — see the REPORT notes shipped with this change.
//
// On mount it also wires the agent-runtime token provider
// (`setSupabaseTokenProvider`) so `chatClient.ts` automatically attaches the
// current (auto-refreshing) Supabase access token as the bearer.
// ─────────────────────────────────────────────────────────────────────────────

import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react'
import {AppState, Platform} from 'react-native'
import {
  type Session,
  type User,
} from '@supabase/supabase-js'

import {setSupabaseTokenProvider} from '#/lib/agent-runtime'
import {getFreshAccessToken, supabase} from '#/lib/supabase/client'
import {logger} from '#/logger'

export type AuthStatus = 'loading' | 'signedIn' | 'signedOut'

export interface AuthResult {
  ok: boolean
  /** Human-readable error to surface in the UI, if any. */
  error?: string
  /** True for sign-up / magic-link flows that require an email confirmation. */
  needsEmailConfirmation?: boolean
}

interface SupabaseSessionState {
  status: AuthStatus
  session: Session | null
  user: User | null
}

interface SupabaseAuthApi {
  signInWithPassword: (email: string, password: string) => Promise<AuthResult>
  signUpWithPassword: (email: string, password: string) => Promise<AuthResult>
  signInWithMagicLink: (email: string) => Promise<AuthResult>
  /**
   * Kick off Google OAuth. Inert until the owner configures the Google provider
   * in the Supabase dashboard; on web it redirects, on native it currently just
   * returns an informative error (native deep-link handling is out of scope).
   */
  signInWithGoogle: () => Promise<AuthResult>
  signOut: () => Promise<void>
}

const StateContext = createContext<SupabaseSessionState>({
  status: 'loading',
  session: null,
  user: null,
})
StateContext.displayName = 'SupabaseSessionStateContext'

const ApiContext = createContext<SupabaseAuthApi | null>(null)
ApiContext.displayName = 'SupabaseSessionApiContext'

// Wire the agent-runtime bearer provider exactly once, at module load. The
// provider closes over the live client, so it always returns a fresh token (or
// null when signed out) regardless of React lifecycle.
setSupabaseTokenProvider(getFreshAccessToken)

/** Redirect target for magic-link / OAuth flows. Web only; null on native. */
function webRedirectTo(): string | undefined {
  if (Platform.OS !== 'web') return undefined
  if (typeof window === 'undefined') return undefined
  return window.location.origin
}

function toMessage(e: unknown, fallback: string): string {
  if (e instanceof Error && e.message) return e.message
  if (typeof e === 'string') return e
  return fallback
}

export function Provider({children}: React.PropsWithChildren<{}>) {
  const [state, setState] = useState<SupabaseSessionState>({
    status: 'loading',
    session: null,
    user: null,
  })

  // Defense-in-depth: (re)install the agent-runtime token provider on mount as
  // well as at module load (line ~75). Idempotent, and guarantees the chat path
  // has a live bearer source regardless of module-evaluation order across
  // platforms/bundlers.
  useEffect(() => {
    setSupabaseTokenProvider(getFreshAccessToken)
  }, [])

  // Load the persisted session and subscribe to auth changes.
  useEffect(() => {
    let mounted = true

    supabase.auth
      .getSession()
      .then(({data}) => {
        if (!mounted) return
        setState({
          status: data.session ? 'signedIn' : 'signedOut',
          session: data.session,
          user: data.session?.user ?? null,
        })
      })
      .catch(e => {
        logger.error('supabase getSession failed', {safeMessage: e})
        if (mounted) {
          setState({status: 'signedOut', session: null, user: null})
        }
      })

    const {data: sub} = supabase.auth.onAuthStateChange((_event, session) => {
      setState({
        status: session ? 'signedIn' : 'signedOut',
        session,
        user: session?.user ?? null,
      })
    })

    return () => {
      mounted = false
      sub.subscription.unsubscribe()
    }
  }, [])

  // On native, Supabase recommends pausing/resuming the auto-refresh timer with
  // app foreground/background. On web the library handles this itself.
  useEffect(() => {
    if (Platform.OS === 'web') return
    const appStateSub = AppState.addEventListener('change', s => {
      if (s === 'active') {
        supabase.auth.startAutoRefresh()
      } else {
        supabase.auth.stopAutoRefresh()
      }
    })
    if (AppState.currentState === 'active') {
      supabase.auth.startAutoRefresh()
    }
    return () => appStateSub.remove()
  }, [])

  const api = useMemo<SupabaseAuthApi>(
    () => ({
      async signInWithPassword(email, password) {
        try {
          const {error} = await supabase.auth.signInWithPassword({
            email: email.trim(),
            password,
          })
          return error ? {ok: false, error: error.message} : {ok: true}
        } catch (e) {
          return {ok: false, error: toMessage(e, 'Sign-in failed.')}
        }
      },

      async signUpWithPassword(email, password) {
        try {
          const {data, error} = await supabase.auth.signUp({
            email: email.trim(),
            password,
            options: {emailRedirectTo: webRedirectTo()},
          })
          if (error) return {ok: false, error: error.message}
          // When email confirmation is on, no session is returned until the
          // user clicks the link in their inbox.
          return {ok: true, needsEmailConfirmation: !data.session}
        } catch (e) {
          return {ok: false, error: toMessage(e, 'Sign-up failed.')}
        }
      },

      async signInWithMagicLink(email) {
        try {
          const {error} = await supabase.auth.signInWithOtp({
            email: email.trim(),
            options: {emailRedirectTo: webRedirectTo()},
          })
          return error
            ? {ok: false, error: error.message}
            : {ok: true, needsEmailConfirmation: true}
        } catch (e) {
          return {ok: false, error: toMessage(e, 'Could not send magic link.')}
        }
      },

      async signInWithGoogle() {
        if (Platform.OS !== 'web') {
          return {
            ok: false,
            error:
              'Google sign-in on mobile needs native deep-link setup (not configured yet).',
          }
        }
        try {
          const {error} = await supabase.auth.signInWithOAuth({
            provider: 'google',
            options: {redirectTo: webRedirectTo()},
          })
          // On success the browser navigates away to Google; nothing more to do.
          return error ? {ok: false, error: error.message} : {ok: true}
        } catch (e) {
          return {ok: false, error: toMessage(e, 'Google sign-in failed.')}
        }
      },

      async signOut() {
        try {
          await supabase.auth.signOut()
        } catch (e) {
          logger.error('supabase signOut failed', {safeMessage: e})
        }
      },
    }),
    [],
  )

  return (
    <StateContext.Provider value={state}>
      <ApiContext.Provider value={api}>{children}</ApiContext.Provider>
    </StateContext.Provider>
  )
}

/** Current Authority One (Supabase) session + status. */
export function useSupabaseSession(): SupabaseSessionState {
  return useContext(StateContext)
}

/** Auth actions (sign in / up / out). Throws if used outside the Provider. */
export function useSupabaseAuth(): SupabaseAuthApi {
  const api = useContext(ApiContext)
  if (!api) {
    throw new Error('useSupabaseAuth must be used within the Supabase Provider')
  }
  return api
}
