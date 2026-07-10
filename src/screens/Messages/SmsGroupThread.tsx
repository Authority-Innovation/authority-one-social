import {useEffect, useState} from 'react'
import {ActivityIndicator, View} from 'react-native'
import {Image} from 'expo-image'
import {Trans, useLingui} from '@lingui/react/macro'

import {
  fetchGroupThread,
  type MirrorGroupMeta,
  type MirrorMessage,
} from '#/lib/agent-runtime'
import {
  type CommonNavigatorParams,
  type NativeStackScreenProps,
} from '#/lib/routes/types'
import {atoms as a, useTheme} from '#/alf'
import {Button, ButtonText} from '#/components/Button'
import * as Layout from '#/components/Layout'
import {Text} from '#/components/Typography'

type Props = NativeStackScreenProps<
  CommonNavigatorParams,
  'MessagesSmsGroupThread'
>

// Keep the mirror fresh while the screen is open. Twilio is the source of truth;
// this is a read surface, so a gentle poll is enough.
const POLL_MS = 15000

/**
 * READ-ONLY mirror of one SMS/MMS group's conversation, opened from the "SMS
 * groups" section at the bottom of the Chats page. There is NO composer here —
 * nothing on this screen can post back to the group. The runtime returns display
 * names only, so no phone number ever reaches this screen.
 */
export function MessagesSmsGroupThreadScreen({route}: Props) {
  const {t: l} = useLingui()
  const t = useTheme()
  const sid = route.params.sid
  const [messages, setMessages] = useState<MirrorMessage[] | null>(null)
  const [meta, setMeta] = useState<MirrorGroupMeta | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [signedOut, setSignedOut] = useState(false)
  // Bumping this re-runs the effect below, giving the Retry button a single
  // fetch site to reuse (setState lives in the effect's own callback, which is
  // the pattern the effect lint rule wants).
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    let live = true
    const run = () => {
      void fetchGroupThread(sid).then(res => {
        if (!live) return
        setSignedOut(!!res.signedOut)
        setLoadError(res.error ?? null)
        if (res.group) setMeta(res.group)
        setMessages(res.messages)
      })
    }
    run()
    const id = setInterval(run, POLL_MS)
    return () => {
      live = false
      clearInterval(id)
    }
  }, [sid, reloadKey])

  const title = meta?.title || route.params.name || sid

  return (
    <Layout.Screen>
      <Layout.Header.Outer>
        <Layout.Header.BackButton />
        <Layout.Header.Content>
          <Layout.Header.TitleText>{title}</Layout.Header.TitleText>
          <Layout.Header.SubtitleText>
            <Trans>Read-only mirror</Trans>
          </Layout.Header.SubtitleText>
        </Layout.Header.Content>
        <Layout.Header.Slot />
      </Layout.Header.Outer>

      <Layout.Content>
        {/* Read-only banner */}
        <View
          style={[
            a.mx_lg,
            a.mt_md,
            a.mb_sm,
            a.p_sm,
            a.rounded_sm,
            t.atoms.bg_contrast_25,
          ]}>
          <Text style={[a.text_xs, t.atoms.text_contrast_medium]}>
            <Trans>
              Read-only mirror · display names only, phone numbers hidden · you
              can't post from here.
            </Trans>
          </Text>
        </View>

        {messages === null ? (
          <View style={[a.py_2xl, a.align_center]}>
            <ActivityIndicator />
          </View>
        ) : signedOut ? (
          <View style={[a.px_lg, a.py_xl]}>
            <Text style={[a.text_sm, t.atoms.text_contrast_medium]}>
              <Trans>Sign in to view this conversation.</Trans>
            </Text>
          </View>
        ) : loadError ? (
          <View style={[a.px_lg, a.py_xl, a.gap_md, a.align_start]}>
            <Text style={[a.text_sm, t.atoms.text_contrast_medium]}>
              {loadError}
            </Text>
            <Button
              label={l`Retry`}
              size="small"
              variant="solid"
              color="secondary"
              onPress={() => setReloadKey(k => k + 1)}>
              <ButtonText>
                <Trans>Retry</Trans>
              </ButtonText>
            </Button>
          </View>
        ) : messages.length === 0 ? (
          <View style={[a.px_lg, a.py_xl]}>
            <Text style={[a.text_sm, t.atoms.text_contrast_medium]}>
              <Trans>No messages yet.</Trans>
            </Text>
          </View>
        ) : (
          <View style={[a.px_lg, a.pt_sm, a.pb_2xl, a.gap_sm]}>
            {messages.map((m, i) => (
              <MessageRow key={m.id ?? String(i)} m={m} />
            ))}
          </View>
        )}
      </Layout.Content>
    </Layout.Screen>
  )
}

function MessageRow({m}: {m: MirrorMessage}) {
  const t = useTheme()
  const when = m.timestamp ? new Date(m.timestamp).toLocaleString() : ''
  return (
    <View
      style={[
        a.p_sm,
        a.rounded_md,
        {maxWidth: '85%'},
        m.is_agent ? a.self_end : a.self_start,
        m.is_agent ? t.atoms.bg_contrast_100 : t.atoms.bg_contrast_25,
      ]}>
      <View style={[a.flex_row, a.gap_sm, a.align_center, a.mb_2xs]}>
        <Text style={[a.text_xs, a.font_bold]}>{m.author_display_name}</Text>
        {m.is_agent ? (
          <Text style={[a.text_2xs, t.atoms.text_contrast_medium]}>
            <Trans>agent</Trans>
          </Text>
        ) : null}
        <Text
          style={[
            a.text_2xs,
            t.atoms.text_contrast_low,
            a.flex_1,
            {textAlign: 'right'},
          ]}>
          {when}
        </Text>
      </View>
      {m.body ? <Text style={[a.text_sm]}>{m.body}</Text> : null}
      {m.media.map((md, idx) =>
        md.url && (md.content_type ?? '').startsWith('image/') ? (
          <Image
            key={idx}
            source={{uri: md.url}}
            style={{width: '100%', height: 180, borderRadius: 10, marginTop: 6}}
            contentFit="cover"
            accessibilityIgnoresInvertColors
          />
        ) : (
          <Text
            key={idx}
            style={[a.text_xs, t.atoms.text_contrast_medium, a.mt_2xs]}>
            📎 {md.content_type ?? 'attachment'}
            {md.filename ? ` · ${md.filename}` : ''}
          </Text>
        ),
      )}
    </View>
  )
}
