import {useCallback, useEffect, useRef, useState} from 'react'
import {ActivityIndicator, Pressable, View} from 'react-native'
import {setStringAsync} from 'expo-clipboard'
import {Image} from 'expo-image'
import {Trans, useLingui} from '@lingui/react/macro'

import {
  downloadGroupExport,
  fetchGroupThread,
  fetchOwnerGroups,
  fetchShareStatus,
  type MirrorGroup,
  type MirrorMessage,
  setShare,
  type ShareStatus,
} from '#/lib/agent-runtime'
import {
  type CommonNavigatorParams,
  type NativeStackScreenProps,
} from '#/lib/routes/types'
import {atoms as a, useTheme} from '#/alf'
import {Button, ButtonText} from '#/components/Button'
import * as Layout from '#/components/Layout'
import * as Toast from '#/components/Toast'
import {Text} from '#/components/Typography'

type Props = NativeStackScreenProps<CommonNavigatorParams, 'GroupConversations'>

const POLL_MS = 15000

/**
 * READ-ONLY SMS/MMS GROUP MIRROR — lets an owner view a group's live conversation in
 * the app, share it (a tokenized read-only link, safe for an investor), and export a
 * transcript. Twilio is the source of truth; the SMS group runs untouched and there
 * is NO composer here — nothing on this screen can post. The runtime returns display
 * names only, so no phone number ever reaches this screen.
 */
export function GroupConversationsScreen({}: Props) {
  const {t: l} = useLingui()
  const [groups, setGroups] = useState<MirrorGroup[] | null>(null)
  const [selected, setSelected] = useState<MirrorGroup | null>(null)

  useEffect(() => {
    let live = true
    void fetchOwnerGroups().then(g => {
      if (live) setGroups(g)
    })
    return () => {
      live = false
    }
  }, [])

  return (
    <Layout.Screen>
      <Layout.Header.Outer>
        <Layout.Header.BackButton />
        <Layout.Header.Content>
          <Layout.Header.TitleText>
            <Trans>Group conversations</Trans>
          </Layout.Header.TitleText>
        </Layout.Header.Content>
        <Layout.Header.Slot />
      </Layout.Header.Outer>

      <Layout.Content>
        {selected ? (
          <ConversationView
            group={selected}
            onBack={() => setSelected(null)}
            l={l}
          />
        ) : (
          <GroupList groups={groups} onOpen={setSelected} l={l} />
        )}
      </Layout.Content>
    </Layout.Screen>
  )
}

function GroupList({
  groups,
  onOpen,
  l,
}: {
  groups: MirrorGroup[] | null
  onOpen: (g: MirrorGroup) => void
  l: (s: TemplateStringsArray) => string
}) {
  const t = useTheme()
  if (groups === null) {
    return (
      <View style={[a.py_2xl, a.align_center]}>
        <ActivityIndicator />
      </View>
    )
  }
  if (groups.length === 0) {
    return (
      <View style={[a.px_lg, a.py_2xl]}>
        <Text style={[a.text_md, a.font_bold, a.mb_xs]}>
          <Trans>No group conversations</Trans>
        </Text>
        <Text style={[a.text_sm, t.atoms.text_contrast_medium]}>
          <Trans>
            Once your agent hosts an SMS/MMS group, it shows up here as a
            read-only mirror.
          </Trans>
        </Text>
      </View>
    )
  }
  return (
    <View style={[a.px_lg, a.py_md, a.gap_sm]}>
      <Text style={[a.text_sm, t.atoms.text_contrast_medium, a.mb_xs]}>
        <Trans>Read-only. Viewing a conversation never posts to it.</Trans>
      </Text>
      {groups.map(g => (
        <Pressable
          key={g.conversationSid}
          accessibilityRole="button"
          accessibilityLabel={l`Open conversation`}
          accessibilityHint=""
          onPress={() => onOpen(g)}
          style={[
            a.p_md,
            a.rounded_md,
            a.border,
            t.atoms.border_contrast_low,
            t.atoms.bg_contrast_25,
          ]}>
          <Text style={[a.text_md, a.font_bold]} numberOfLines={1}>
            {g.title || g.conversationSid}
          </Text>
          <Text style={[a.text_xs, t.atoms.text_contrast_medium, a.mt_2xs]}>
            {g.memberCount}{' '}
            {g.memberCount === 1 ? l`member` : l`members`}
            {g.openJoin ? ` · ${l`open`}` : ''}
          </Text>
        </Pressable>
      ))}
    </View>
  )
}

function ConversationView({
  group,
  onBack,
  l,
}: {
  group: MirrorGroup
  onBack: () => void
  l: (s: TemplateStringsArray) => string
}) {
  const t = useTheme()
  const sid = group.conversationSid
  const [messages, setMessages] = useState<MirrorMessage[] | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [share, setShareState] = useState<ShareStatus | null>(null)
  const [auto, setAuto] = useState(false)
  const [busy, setBusy] = useState(false)
  const timer = useRef<ReturnType<typeof setInterval> | null>(null)

  const load = useCallback(() => {
    return fetchGroupThread(sid).then(res => {
      if (res.error) setLoadError(res.error)
      else setLoadError(null)
      setMessages(res.messages)
    })
  }, [sid])

  useEffect(() => {
    void load()
    void fetchShareStatus(sid).then(setShareState)
  }, [sid, load])

  useEffect(() => {
    if (auto) {
      timer.current = setInterval(() => void load(), POLL_MS)
    }
    return () => {
      if (timer.current) clearInterval(timer.current)
      timer.current = null
    }
  }, [auto, load])

  const onCreateShare = useCallback(async () => {
    setBusy(true)
    const res = await setShare(sid, 'create')
    setBusy(false)
    if (res.error) {
      Toast.show(l`Could not create link`)
      return
    }
    setShareState(res)
    if (res.url) {
      await setStringAsync(res.url)
      Toast.show(l`Read-only link copied`)
    }
  }, [sid, l])

  const onRevokeShare = useCallback(async () => {
    setBusy(true)
    const res = await setShare(sid, 'revoke')
    setBusy(false)
    setShareState(res)
    Toast.show(l`Link revoked`)
  }, [sid, l])

  const onCopyShare = useCallback(async () => {
    if (share?.url) {
      await setStringAsync(share.url)
      Toast.show(l`Copied`)
    }
  }, [share, l])

  const onExport = useCallback(
    async (format: 'html' | 'text' | 'json') => {
      const res = await downloadGroupExport(sid, format)
      Toast.show(res.ok ? l`Transcript downloaded` : l`Export available on web`)
    },
    [sid, l],
  )

  return (
    <View>
      <View style={[a.px_lg, a.py_sm, a.flex_row, a.gap_sm, a.align_center]}>
        <Button
          label={l`Back to groups`}
          size="small"
          variant="ghost"
          color="secondary"
          onPress={onBack}>
          <ButtonText>
            <Trans>← Groups</Trans>
          </ButtonText>
        </Button>
        <Text style={[a.text_md, a.font_bold, a.flex_1]} numberOfLines={1}>
          {group.title || sid}
        </Text>
      </View>

      {/* Read-only banner */}
      <View style={[a.mx_lg, a.mb_sm, a.p_sm, a.rounded_sm, t.atoms.bg_contrast_25]}>
        <Text style={[a.text_xs, t.atoms.text_contrast_medium]}>
          <Trans>
            Read-only mirror · display names only, phone numbers hidden · you
            can't post from here.
          </Trans>
        </Text>
      </View>

      {/* Share + export controls */}
      <View style={[a.px_lg, a.pb_sm, a.gap_sm]}>
        <View style={[a.flex_row, a.gap_sm, a.flex_wrap]}>
          {share?.shared ? (
            <>
              <Button
                label={l`Copy share link`}
                size="small"
                variant="solid"
                color="primary"
                disabled={busy}
                onPress={() => void onCopyShare()}>
                <ButtonText>
                  <Trans>Copy link</Trans>
                </ButtonText>
              </Button>
              <Button
                label={l`Revoke share link`}
                size="small"
                variant="outline"
                color="negative"
                disabled={busy}
                onPress={() => void onRevokeShare()}>
                <ButtonText>
                  <Trans>Revoke</Trans>
                </ButtonText>
              </Button>
            </>
          ) : (
            <Button
              label={l`Create read-only share link`}
              size="small"
              variant="solid"
              color="primary"
              disabled={busy}
              onPress={() => void onCreateShare()}>
              <ButtonText>
                <Trans>Share (read-only link)</Trans>
              </ButtonText>
            </Button>
          )}
          <Button
            label={l`Refresh`}
            size="small"
            variant="ghost"
            color="secondary"
            onPress={() => void load()}>
            <ButtonText>
              <Trans>Refresh</Trans>
            </ButtonText>
          </Button>
          <Button
            label={auto ? l`Stop auto-refresh` : l`Auto-refresh`}
            size="small"
            variant="ghost"
            color="secondary"
            onPress={() => setAuto(v => !v)}>
            <ButtonText>{auto ? <Trans>Live ✓</Trans> : <Trans>Live</Trans>}</ButtonText>
          </Button>
        </View>
        {share?.shared && share.url ? (
          <Text style={[a.text_xs, t.atoms.text_contrast_medium]} selectable>
            {share.url}
          </Text>
        ) : null}
        <View style={[a.flex_row, a.gap_sm, a.flex_wrap]}>
          <Text style={[a.text_xs, t.atoms.text_contrast_medium, a.self_center]}>
            <Trans>Export:</Trans>
          </Text>
          <Button label={l`Export HTML`} size="tiny" variant="outline" color="secondary" onPress={() => void onExport('html')}>
            <ButtonText>HTML</ButtonText>
          </Button>
          <Button label={l`Export text`} size="tiny" variant="outline" color="secondary" onPress={() => void onExport('text')}>
            <ButtonText>TXT</ButtonText>
          </Button>
          <Button label={l`Export JSON`} size="tiny" variant="outline" color="secondary" onPress={() => void onExport('json')}>
            <ButtonText>JSON</ButtonText>
          </Button>
        </View>
      </View>

      {/* Message thread */}
      {messages === null ? (
        <View style={[a.py_2xl, a.align_center]}>
          <ActivityIndicator />
        </View>
      ) : loadError ? (
        <View style={[a.px_lg, a.py_xl]}>
          <Text style={[a.text_sm, t.atoms.text_contrast_medium]}>{loadError}</Text>
        </View>
      ) : messages.length === 0 ? (
        <View style={[a.px_lg, a.py_xl]}>
          <Text style={[a.text_sm, t.atoms.text_contrast_medium]}>
            <Trans>No messages yet.</Trans>
          </Text>
        </View>
      ) : (
        <View style={[a.px_lg, a.pb_2xl, a.gap_sm]}>
          {messages.map((m, i) => (
            <MessageRow key={m.id ?? String(i)} m={m} />
          ))}
        </View>
      )}
    </View>
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
        <Text style={[a.text_2xs, t.atoms.text_contrast_low, a.flex_1, {textAlign: 'right'}]}>
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
          <Text key={idx} style={[a.text_xs, t.atoms.text_contrast_medium, a.mt_2xs]}>
            📎 {md.content_type ?? 'attachment'}
            {md.filename ? ` · ${md.filename}` : ''}
          </Text>
        ),
      )}
    </View>
  )
}
