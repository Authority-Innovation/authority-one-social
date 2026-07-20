import {useState} from 'react'
import {ActivityIndicator, View} from 'react-native'
import {Trans, useLingui} from '@lingui/react/macro'

import {
  type KnowledgeFile,
  type KnowledgeFileToUpload,
  knowledgeRemovalMessage,
} from '#/lib/agent-runtime'
import {
  type CommonNavigatorParams,
  type NativeStackScreenProps,
} from '#/lib/routes/types'
import {sanitizeHandle} from '#/lib/strings/handles'
import {useOwnerAgentsQuery} from '#/state/queries/agents'
import {
  KnowledgeError,
  useDeleteKnowledgeFileMutation,
  useKnowledgeFilesQuery,
  useSetKnowledgeEnabledMutation,
  useUploadKnowledgeFileMutation,
} from '#/state/queries/knowledgeBase'
import * as SettingsList from '#/screens/Settings/components/SettingsList'
import {atoms as a, useTheme} from '#/alf'
import {Button, ButtonIcon, ButtonText} from '#/components/Button'
import * as Toggle from '#/components/forms/Toggle'
import {CircleCheck_Stroke2_Corner0_Rounded as CircleCheckIcon} from '#/components/icons/CircleCheck'
import {CircleInfo_Stroke2_Corner0_Rounded as CircleInfoIcon} from '#/components/icons/CircleInfo'
import {type Props as IconProps} from '#/components/icons/common'
import {PageText_Stroke2_Corner0_Rounded as PageTextIcon} from '#/components/icons/PageText'
import {PlusLarge_Stroke2_Corner0_Rounded as PlusIcon} from '#/components/icons/Plus'
import {Trash_Stroke2_Corner0_Rounded as TrashIcon} from '#/components/icons/Trash'
import {Warning_Stroke2_Corner0_Rounded as WarningIcon} from '#/components/icons/Warning'
import * as Layout from '#/components/Layout'
import * as Prompt from '#/components/Prompt'
import * as Toast from '#/components/Toast'
import {Text} from '#/components/Typography'
import {KNOWLEDGE_PICKER_SUPPORTED, pickTextFile} from './pickTextFile'

type Props = NativeStackScreenProps<
  CommonNavigatorParams,
  'KnowledgeBaseSettings'
>

/**
 * The agent's KNOWLEDGE BASE ("file slots"): upload documents (.txt/.md/.csv/.pdf)
 * into the agent's long-term Mnemonic memory, alongside the chat/event ingestion the
 * agent already does. Reached from the per-agent editor (PersonaSettings). Scoped like
 * PersonaSettings via route param `agent` (the FULL handle from My Agents); without it,
 * this manages the owner's token-mapped agent.
 *
 * Everything uploaded lands as PROVISIONAL memory pending review (per the Mnemonic
 * contract) — labeled clearly throughout. The runtime refuses documents honestly: a
 * file containing a real email/phone/secret is BLOCKED by the PII guard and shown as a
 * blocked slot with the real reason (never a fake save); docx is "not supported yet".
 * PDFs upload as raw binary and route to Mnemonic's document-extraction pipeline.
 *
 * Removing a slot (trash button + confirm, same pattern as PersonaSettings) is
 * optimistic with a visible revert on failure. The success copy is keyed off the
 * runtime's `upstream` outcome: only 'purged' claims deletion; otherwise the item
 * is honestly described as removed-from-the-agent (no more recall) with no claim
 * the raw data was destroyed. FOLLOW-UP: native picker.
 */
export function KnowledgeBaseSettingsScreen({route}: Props) {
  const {t: l} = useLingui()
  const agent = route.params?.agent
  const {data, isLoading, error} = useKnowledgeFilesQuery(agent)
  const upload = useUploadKnowledgeFileMutation(agent)
  const del = useDeleteKnowledgeFileMutation(agent)
  const setEnabled = useSetKnowledgeEnabledMutation(agent)
  const deletePrompt = Prompt.usePromptControl()
  const [pendingDelete, setPendingDelete] = useState<KnowledgeFile | null>(null)
  const ownerAgents = useOwnerAgentsQuery()

  const agentRow = agent
    ? ownerAgents.data?.agents.find(
        a2 => a2.handle.toLowerCase() === agent.toLowerCase(),
      )
    : undefined
  const agentLabel =
    agentRow?.displayName ??
    (agent ? sanitizeHandle(agent, '@') : l`your agent`)
  const notYourAgent =
    error instanceof KnowledgeError && error.code === 'not-your-agent'
  const files = data ?? []

  const onPick = async () => {
    if (!KNOWLEDGE_PICKER_SUPPORTED) return
    let picked: KnowledgeFileToUpload | null
    try {
      picked = await pickTextFile()
    } catch {
      picked = null
    }
    if (!picked) return
    upload.mutate(picked, {
      onSuccess: res => {
        // An honest PII-guard/format BLOCK comes back as ok:false with a slot that
        // carries the real reason — surface it, don't pretend it saved.
        if (!res.ok) {
          Toast.show(
            res.file?.reason ?? res.error ?? l`That file couldn’t be saved.`,
            {type: 'error'},
          )
          return
        }
        // Plain template literal, not l`` — the catalog was never re-extracted for
        // these interpolated strings, and uncompiled messages render the literal
        // "{agentLabel}" placeholder (same bug/fix as the composer {pct} label).
        Toast.show(
          `Added to ${agentLabel}’s knowledge base — pending review.`,
          {
            type: 'success',
          },
        )
      },
      onError: err => {
        Toast.show(
          err instanceof KnowledgeError && err.code === 'not-your-agent'
            ? l`That agent isn’t linked to your account.`
            : err instanceof Error && err.message
              ? err.message
              : l`Could not upload the file.`,
          {type: 'error'},
        )
      },
    })
  }

  // No confirmation for toggling — it's reversible. The flip is optimistic
  // (reverted by the mutation on failure) and never a silent no-op: success
  // shows the runtime's own message, failure an honest error toast.
  const onToggle = (file: KnowledgeFile, enabled: boolean) => {
    setEnabled.mutate(
      {id: file.id, enabled},
      {
        onSuccess: res => {
          // The runtime's `message` is written to be shown VERBATIM — it is
          // deliberately honest about what disabling does and doesn't do
          // (including partial cases), so we never compose our own success
          // copy over it. Idempotent `changed:false` responses land here too:
          // already-in-that-state is a success, not an error.
          Toast.show(
            res.message ??
              (enabled
                ? `“${file.name}” is on — ${agentLabel} can use it again.`
                : `“${file.name}” is off — ${agentLabel} won’t use it.`),
            {type: 'success'},
          )
        },
        onError: err => {
          // The optimistic flip has already been reverted; say why it failed.
          const code = err instanceof KnowledgeError ? err.code : undefined
          Toast.show(
            code === 'deleted'
              ? `“${file.name}” was deleted from the knowledge base, so it can’t be switched on or off.`
              : code === 'not-found'
                ? l`That file is no longer in the knowledge base.`
                : code === 'not-your-agent'
                  ? l`That agent isn’t linked to your account.`
                  : err instanceof Error && err.message
                    ? err.message
                    : l`Could not update the file.`,
            {type: 'error'},
          )
        },
      },
    )
  }

  const confirmDelete = (file: KnowledgeFile) => {
    setPendingDelete(file)
    deletePrompt.open()
  }

  const onConfirmDelete = () => {
    const file = pendingDelete
    if (!file) return
    del.mutate(
      {id: file.id},
      {
        onSuccess: res => {
          // Honest outcome: only upstream 'purged' claims deletion; otherwise the
          // copy says removed-from-the-agent (no recall) without claiming the raw
          // data was destroyed. Plain template strings, not l`` — see the upload
          // toast note above about uncompiled interpolated messages.
          Toast.show(
            knowledgeRemovalMessage({
              upstream: res.upstream,
              fileName: file.name,
              agentLabel,
              runtimeMessage: res.message,
            }),
            {type: 'success'},
          )
        },
        onError: err => {
          // The optimistic removal has already been reverted; say why it failed.
          const code = err instanceof KnowledgeError ? err.code : undefined
          Toast.show(
            code === 'not-your-agent'
              ? l`That agent isn’t linked to your account.`
              : code === 'not-found'
                ? l`That file is no longer in the knowledge base.`
                : err instanceof Error && err.message
                  ? err.message
                  : l`Could not remove the file.`,
            {type: 'error'},
          )
        },
      },
    )
  }

  return (
    <Layout.Screen testID="knowledgeBaseSettingsScreen">
      <Layout.Header.Outer>
        <Layout.Header.BackButton />
        <Layout.Header.Content>
          <Layout.Header.TitleText>
            <Trans>Knowledge base</Trans>
          </Layout.Header.TitleText>
        </Layout.Header.Content>
        <Layout.Header.Slot />
      </Layout.Header.Outer>

      <Layout.Content>
        <SettingsList.Container>
          <Intro agentLabel={agentLabel} />

          {notYourAgent ? (
            <Notice
              title={l`Not your agent`}
              body={l`This agent isn’t linked to your account, so its knowledge base can’t be managed from here. Pick one of your own agents from My Agents.`}
            />
          ) : data === undefined && !isLoading ? (
            <Notice
              title={l`Knowledge base unavailable`}
              body={l`Make sure you’re signed in and the agent runtime is reachable. Your agent keeps its existing memory in the meantime.`}
            />
          ) : (
            <>
              <UploadRow
                supported={KNOWLEDGE_PICKER_SUPPORTED}
                busy={upload.isPending}
                agentLabel={agentLabel}
                onPick={() => void onPick()}
              />
              <SettingsList.Divider />
              {isLoading ? (
                <View style={[a.py_2xl, a.align_center]}>
                  <ActivityIndicator />
                </View>
              ) : files.length === 0 ? (
                <Notice
                  title={l`No files yet`}
                  body={`Upload a .txt, .md, .csv, or .pdf file to add it to ${agentLabel}’s long-term memory.`}
                />
              ) : (
                files.map(file => (
                  <FileRow
                    key={file.id || file.name}
                    file={file}
                    onToggle={
                      file.id ? enabled => onToggle(file, enabled) : undefined
                    }
                    onDelete={file.id ? () => confirmDelete(file) : undefined}
                  />
                ))
              )}
            </>
          )}
        </SettingsList.Container>
      </Layout.Content>

      <Prompt.Basic
        control={deletePrompt}
        title="Remove this file?"
        description={
          pendingDelete
            ? `“${pendingDelete.name}” will be removed from ${agentLabel}’s knowledge base — ${agentLabel} will no longer be able to read or recall it.`
            : ''
        }
        confirmButtonCta="Remove"
        confirmButtonColor="negative"
        onConfirm={onConfirmDelete}
      />
    </Layout.Screen>
  )
}

/** What this screen does + the provisional-memory + supported-format caveats. */
function Intro({agentLabel}: {agentLabel: string}) {
  const t = useTheme()
  return (
    <View style={[a.px_lg, a.py_md, a.gap_xs]}>
      <Text style={[a.text_sm, t.atoms.text_contrast_medium, a.leading_snug]}>
        {`Add files to ${agentLabel}’s long-term memory, alongside what it learns from your chats. Supported formats: .txt, .md, .csv, and .pdf.`}
      </Text>
      <Text style={[a.text_xs, t.atoms.text_contrast_low, a.leading_snug]}>
        <Trans>
          Uploads land as provisional memory pending review before they surface
          in recall. Files with a real email address, phone number, or secret
          are declined automatically.
        </Trans>
      </Text>
    </View>
  )
}

/** The file picker + upload button (or a web-only notice on native). */
function UploadRow({
  supported,
  busy,
  agentLabel,
  onPick,
}: {
  supported: boolean
  busy: boolean
  agentLabel: string
  onPick: () => void
}) {
  const t = useTheme()
  if (!supported) {
    return (
      <View style={[a.px_lg, a.py_md, a.gap_xs]}>
        <Text style={[a.text_sm, t.atoms.text_contrast_medium]}>
          {`Uploading files is available on the web app for now. Open One in a browser to add files to ${agentLabel}’s knowledge base.`}
        </Text>
      </View>
    )
  }
  return (
    <View style={[a.px_lg, a.py_sm]}>
      <Button
        label={`Add a file to ${agentLabel}’s knowledge base`}
        size="large"
        variant="solid"
        color="primary"
        disabled={busy}
        onPress={onPick}>
        {busy ? (
          <ActivityIndicator color="white" />
        ) : (
          <>
            <ButtonIcon icon={PlusIcon} />
            <ButtonText>
              <Trans>Add a file</Trans>
            </ButtonText>
          </>
        )}
      </Button>
    </View>
  )
}

/**
 * One uploaded file slot: name, size + timestamp, an honest status badge, an
 * on/off switch (no confirmation — toggling is reversible), and a trash button
 * (both platforms — same inline affordance as PersonaSettings rows). A switched-
 * off item reads as clearly inactive: dimmed content plus an "Off" badge in
 * place of the status pill.
 */
function FileRow({
  file,
  onToggle,
  onDelete,
}: {
  file: KnowledgeFile
  onToggle?: (enabled: boolean) => void
  onDelete?: () => void
}) {
  const t = useTheme()
  const {i18n, t: l} = useLingui()
  const when = file.uploadedAt ? new Date(file.uploadedAt) : null
  const meta = [
    humanBytes(file.size),
    when && !isNaN(when.getTime())
      ? i18n.date(when, {dateStyle: 'medium', timeStyle: 'short'})
      : null,
  ]
    .filter(Boolean)
    .join(' · ')
  const inactive = !file.enabled
  return (
    <SettingsList.Item>
      <View
        style={[
          a.flex_row,
          a.flex_1,
          a.align_center,
          a.gap_sm,
          inactive && {opacity: 0.5},
        ]}>
        <SettingsList.ItemIcon icon={PageTextIcon} />
        <View style={[a.flex_1, a.gap_2xs]}>
          <Text
            style={[a.text_md, a.font_bold, t.atoms.text]}
            numberOfLines={1}
            emoji>
            {file.name}
          </Text>
          {meta ? (
            <Text
              style={[a.text_xs, t.atoms.text_contrast_medium]}
              numberOfLines={1}>
              {meta}
            </Text>
          ) : null}
          {file.status !== 'saved' && file.reason ? (
            <Text
              style={[a.text_xs, t.atoms.text_contrast_medium]}
              numberOfLines={2}>
              {file.reason}
            </Text>
          ) : null}
        </View>
        {inactive ? (
          <Badge
            icon={CircleInfoIcon}
            label={l`Off`}
            bg={t.palette.contrast_100}
            fg={t.palette.contrast_600}
          />
        ) : (
          <StatusBadge file={file} />
        )}
      </View>
      {onToggle ? (
        <Toggle.Item
          name={`knowledge-enabled-${file.id}`}
          label={
            file.enabled
              ? `Turn off ${file.name} in the knowledge base`
              : `Turn on ${file.name} in the knowledge base`
          }
          value={file.enabled}
          onChange={onToggle}>
          <Toggle.Switch />
        </Toggle.Item>
      ) : null}
      {onDelete ? (
        <Button
          label={`Remove ${file.name} from the knowledge base`}
          size="small"
          variant="ghost"
          color="negative"
          shape="round"
          onPress={onDelete}>
          <ButtonIcon icon={TrashIcon} />
        </Button>
      ) : null}
    </SettingsList.Item>
  )
}

/** Saved (pending review) / Blocked / Failed pill, from the runtime's real outcome. */
function StatusBadge({file}: {file: KnowledgeFile}) {
  const t = useTheme()
  const {t: l} = useLingui()
  if (file.status === 'saved') {
    return (
      <Badge
        icon={CircleCheckIcon}
        label={l`Pending review`}
        bg={t.palette.positive_50}
        fg={t.palette.positive_700}
      />
    )
  }
  if (file.status === 'blocked') {
    return (
      <Badge
        icon={WarningIcon}
        label={l`Declined`}
        bg={t.palette.negative_50}
        fg={t.palette.negative_500}
      />
    )
  }
  return (
    <Badge
      icon={CircleInfoIcon}
      label={l`Failed`}
      bg={t.palette.contrast_100}
      fg={t.palette.contrast_600}
    />
  )
}

function Badge({
  icon: Icon,
  label,
  bg,
  fg,
}: {
  icon: React.ComponentType<IconProps>
  label: string
  bg: string
  fg: string
}) {
  return (
    <View
      style={[
        a.flex_row,
        a.align_center,
        a.gap_xs,
        a.rounded_full,
        a.px_sm,
        {paddingVertical: 3, backgroundColor: bg},
      ]}>
      <Icon size="xs" fill={fg} />
      <Text style={[a.text_xs, a.font_bold, {color: fg}]}>{label}</Text>
    </View>
  )
}

function Notice({title, body}: {title: string; body: string}) {
  const t = useTheme()
  return (
    <View style={[a.px_lg, a.py_2xl, a.gap_sm]}>
      <Text style={[a.text_md, a.font_bold, t.atoms.text]}>{title}</Text>
      <Text style={[a.text_sm, t.atoms.text_contrast_medium]}>{body}</Text>
    </View>
  )
}

/** "46 KB" style size. */
function humanBytes(n: number): string {
  const b = Number(n)
  if (!Number.isFinite(b) || b <= 0) return '0 B'
  if (b < 1024) return `${b} B`
  if (b < 1024 * 1024) return `${Math.round(b / 1024)} KB`
  return `${(b / (1024 * 1024)).toFixed(1)} MB`
}
