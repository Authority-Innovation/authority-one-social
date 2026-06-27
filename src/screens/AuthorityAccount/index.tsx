import {useCallback, useState} from 'react'
import {TextInput, View} from 'react-native'
import {useNavigation} from '@react-navigation/native'

import {DEFAULT_AGENT} from '#/lib/agent-runtime'
import {type NavigationProp} from '#/lib/routes/types'
import {
  useSupabaseAuth,
  useSupabaseSession,
} from '#/state/supabase'
import {atoms as a, useTheme} from '#/alf'
import {Button, ButtonText} from '#/components/Button'
import * as Layout from '#/components/Layout'
import {Text} from '#/components/Typography'

type Mode = 'signin' | 'signup'

/**
 * Authority One account screen (Supabase). This is the account layer that
 * authorizes the agent channel — it is separate from the atproto/PDS social
 * login. Reachable at `/account`.
 *
 * All visible copy here is OUR custom (non-Bluesky) text, written as plain
 * string literals so it renders verbatim regardless of the compiled Lingui
 * catalog (Lingui macros would otherwise render as raw message-ID hashes).
 */
export function AuthorityAccountScreen() {
  const t = useTheme()
  const navigation = useNavigation<NavigationProp>()
  const {status, user} = useSupabaseSession()
  const {
    signInWithPassword,
    signUpWithPassword,
    signInWithMagicLink,
    signInWithGoogle,
    signOut,
  } = useSupabaseAuth()

  const [mode, setMode] = useState<Mode>('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)

  const reset = useCallback(() => {
    setError(null)
    setInfo(null)
  }, [])

  const onSubmit = useCallback(async () => {
    reset()
    if (!email.trim() || !password) {
      setError('Enter your email and password.')
      return
    }
    setBusy(true)
    const res =
      mode === 'signin'
        ? await signInWithPassword(email, password)
        : await signUpWithPassword(email, password)
    setBusy(false)
    if (!res.ok) {
      setError(res.error ?? 'Something went wrong.')
    } else if (res.needsEmailConfirmation) {
      setInfo('Check your inbox to confirm your email, then sign in.')
    }
    // On success with a session, onAuthStateChange flips status to signedIn and
    // the signed-in view below renders.
  }, [
    email,
    password,
    mode,
    reset,
    signInWithPassword,
    signUpWithPassword,
  ])

  const onMagicLink = useCallback(async () => {
    reset()
    if (!email.trim()) {
      setError('Enter your email first.')
      return
    }
    setBusy(true)
    const res = await signInWithMagicLink(email)
    setBusy(false)
    if (!res.ok) setError(res.error ?? 'Could not send magic link.')
    else setInfo('Magic link sent — check your inbox.')
  }, [email, reset, signInWithMagicLink])

  const onGoogle = useCallback(async () => {
    reset()
    setBusy(true)
    const res = await signInWithGoogle()
    setBusy(false)
    if (!res.ok) setError(res.error ?? 'Google sign-in unavailable.')
  }, [reset, signInWithGoogle])

  const inputStyle = [
    a.w_full,
    a.px_md,
    a.py_sm,
    a.rounded_md,
    a.text_md,
    a.border,
    t.atoms.border_contrast_low,
    t.atoms.bg_contrast_25,
    t.atoms.text,
  ]

  // ── Signed-in view ─────────────────────────────────────────────────────────
  if (status === 'signedIn') {
    return (
      <Layout.Screen>
        <Layout.Header.Outer>
          <Layout.Header.BackButton />
          <Layout.Header.Content>
            <Layout.Header.TitleText>
              Authority One account
            </Layout.Header.TitleText>
          </Layout.Header.Content>
        </Layout.Header.Outer>
        <View style={[a.flex_1, a.p_xl, a.gap_lg]}>
          <Text style={[a.text_lg, a.font_bold, t.atoms.text]}>
            {"You're signed in"}
          </Text>
          <Text style={[a.text_md, t.atoms.text_contrast_medium]}>
            {user?.email ?? user?.id}
          </Text>
          <Text style={[a.text_sm, t.atoms.text_contrast_medium]}>
            This account authorizes the agent channel. Your social (PDS) login
            is separate and unaffected.
          </Text>
          <Button
            label="Talk to your agent"
            size="large"
            variant="solid"
            color="primary"
            onPress={() => navigation.navigate('AgentChat', {agent: DEFAULT_AGENT})}>
            <ButtonText>
              Talk to your agent
            </ButtonText>
          </Button>
          <Button
            label="Sign out"
            size="large"
            variant="outline"
            color="secondary"
            onPress={() => void signOut()}>
            <ButtonText>
              Sign out
            </ButtonText>
          </Button>
        </View>
      </Layout.Screen>
    )
  }

  // ── Signed-out view (sign in / sign up) ────────────────────────────────────
  return (
    <Layout.Screen>
      <Layout.Header.Outer>
        <Layout.Header.BackButton />
        <Layout.Header.Content>
          <Layout.Header.TitleText>
            {mode === 'signin'
              ? 'Sign in to Authority One'
              : 'Create your Authority One account'}
          </Layout.Header.TitleText>
        </Layout.Header.Content>
      </Layout.Header.Outer>

      <Layout.Content contentContainerStyle={[a.p_xl, a.gap_md]}>
        <Text style={[a.text_sm, t.atoms.text_contrast_medium]}>
          {
            "This is your Authority One account. It's separate from your social (PDS) login and is what authorizes your agent."
          }
        </Text>

        <TextInput
          accessibilityLabel="Email"
          accessibilityHint=""
          value={email}
          onChangeText={setEmail}
          placeholder="Email"
          placeholderTextColor={t.atoms.text_contrast_low.color}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="email-address"
          textContentType="emailAddress"
          style={inputStyle}
        />

        <TextInput
          accessibilityLabel="Password"
          accessibilityHint=""
          value={password}
          onChangeText={setPassword}
          placeholder="Password"
          placeholderTextColor={t.atoms.text_contrast_low.color}
          autoCapitalize="none"
          autoCorrect={false}
          secureTextEntry
          textContentType="password"
          onSubmitEditing={() => void onSubmit()}
          style={inputStyle}
        />

        {error ? (
          <Text style={[a.text_sm, {color: t.palette.negative_500}]}>
            {error}
          </Text>
        ) : null}
        {info ? (
          <Text style={[a.text_sm, {color: t.palette.positive_500}]}>
            {info}
          </Text>
        ) : null}

        <Button
          label={mode === 'signin' ? 'Sign in' : 'Sign up'}
          size="large"
          variant="solid"
          color="primary"
          disabled={busy}
          onPress={() => void onSubmit()}>
          <ButtonText>{mode === 'signin' ? 'Sign in' : 'Sign up'}</ButtonText>
        </Button>

        <Button
          label="Email me a magic link"
          size="large"
          variant="outline"
          color="secondary"
          disabled={busy}
          onPress={() => void onMagicLink()}>
          <ButtonText>
            Email me a magic link
          </ButtonText>
        </Button>

        {/* Inert until the owner configures Google in the Supabase dashboard. */}
        <Button
          label="Continue with Google"
          size="large"
          variant="solid"
          color="secondary"
          disabled={busy}
          onPress={() => void onGoogle()}>
          <ButtonText>
            Continue with Google
          </ButtonText>
        </Button>

        <Button
          label={
            mode === 'signin'
              ? 'Need an account? Sign up'
              : 'Already have an account? Sign in'
          }
          size="small"
          variant="ghost"
          color="secondary"
          onPress={() => {
            reset()
            setMode(m => (m === 'signin' ? 'signup' : 'signin'))
          }}>
          <ButtonText>
            {mode === 'signin'
              ? 'Need an account? Sign up'
              : 'Already have an account? Sign in'}
          </ButtonText>
        </Button>
      </Layout.Content>
    </Layout.Screen>
  )
}
