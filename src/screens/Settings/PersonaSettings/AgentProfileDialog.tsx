import {useState} from 'react'
import {View} from 'react-native'
import {Image} from 'expo-image'
import {Trans, useLingui} from '@lingui/react/macro'

import {
  AGENT_BIO_MAX_GRAPHEMES,
  AGENT_DISPLAY_NAME_MAX_GRAPHEMES,
  generateHostedImage,
  uploadChatImage,
} from '#/lib/agent-runtime'
import {IMAGE_SIZE_CONFIG_2K_1MB} from '#/lib/constants'
import {compressIfNeeded} from '#/lib/media/manip'
import {openPicker} from '#/lib/media/picker'
import {isOverMaxGraphemeCount} from '#/lib/strings/helpers'
import {
  AgentProfileWriteError,
  useUpdateAgentProfileMutation,
} from '#/state/queries/agent-profile'
import {useProfileQuery} from '#/state/queries/profile'
import {atoms as a, useTheme} from '#/alf'
import {Button, ButtonText} from '#/components/Button'
import * as Dialog from '#/components/Dialog'
import * as TextField from '#/components/forms/TextField'
import {Loader} from '#/components/Loader'
import * as Toast from '#/components/Toast'
import {Text} from '#/components/Typography'

/**
 * Edit an agent's PDS profile: display name, bio, avatar, banner. Image slots are
 * staged as HOSTED urls (upload compresses under the 1MB PDS blob cap first;
 * generate asks the runtime to create + host one) and NOTHING commits to the PDS
 * until Save posts /app/agents/profile with only the changed fields.
 */
export function AgentProfileDialog({
  control,
  agent,
}: {
  control: Dialog.DialogControlProps
  /** The agent's full handle (or DID) from a GET /app/agents row. */
  agent: string
}) {
  return (
    <Dialog.Outer control={control}>
      <Dialog.Handle />
      <ProfileEditorInner agent={agent} control={control} />
    </Dialog.Outer>
  )
}

type ImageSlot = 'avatar' | 'banner'

/** Per-slot staged state: undefined = keep current; a url = replace on save. */
type ImageDraft = {
  url?: string
  busy?: boolean
  error?: string
}

function ProfileEditorInner({
  agent,
  control,
}: {
  agent: string
  control: Dialog.DialogControlProps
}) {
  const t = useTheme()
  const {t: l} = useLingui()
  // Current PDS profile (AppView view) — previews + initial field values.
  const profile = useProfileQuery({did: agent})
  const save = useUpdateAgentProfileMutation()

  // Text drafts: null = untouched (keep server value); string = user-edited.
  const [nameDraft, setNameDraft] = useState<string | null>(null)
  const [bioDraft, setBioDraft] = useState<string | null>(null)
  const [avatar, setAvatar] = useState<ImageDraft>({})
  const [banner, setBanner] = useState<ImageDraft>({})
  const [genPromptFor, setGenPromptFor] = useState<ImageSlot | null>(null)
  const [genPrompt, setGenPrompt] = useState('')

  const currentName = profile.data?.displayName ?? ''
  const currentBio = profile.data?.description ?? ''
  const name = nameDraft ?? currentName
  const bio = bioDraft ?? currentBio

  const nameTooLong = isOverMaxGraphemeCount({
    text: name,
    maxCount: AGENT_DISPLAY_NAME_MAX_GRAPHEMES,
  })
  const bioTooLong = isOverMaxGraphemeCount({
    text: bio,
    maxCount: AGENT_BIO_MAX_GRAPHEMES,
  })

  const nameChanged = nameDraft !== null && nameDraft !== currentName
  const bioChanged = bioDraft !== null && bioDraft !== currentBio
  const hasChanges = nameChanged || bioChanged || !!avatar.url || !!banner.url
  const busy = avatar.busy || banner.busy || save.isPending
  const canSave = hasChanges && !busy && !nameTooLong && !bioTooLong

  const setSlot = (slot: ImageSlot, next: ImageDraft) =>
    slot === 'avatar' ? setAvatar(next) : setBanner(next)
  const getSlot = (slot: ImageSlot) => (slot === 'avatar' ? avatar : banner)

  // UPLOAD: pick -> compress under the 1MB PDS blob cap -> host -> stage the url.
  const onUpload = async (slot: ImageSlot) => {
    try {
      const picked = await openPicker({selectionLimit: 1})
      const img = picked?.[0]
      if (!img) return
      setSlot(slot, {busy: true})
      const compressed = await compressIfNeeded(img, IMAGE_SIZE_CONFIG_2K_1MB)
      const url = await uploadChatImage({
        uri: compressed.path,
        mime: compressed.mime,
      })
      setSlot(slot, url ? {url} : {error: l`Upload failed. Please try again.`})
    } catch {
      // Picker cancelled or compression failed — reset quietly.
      setSlot(slot, {})
    }
  }

  // GENERATE: runtime creates + hosts an image; the url is staged for preview and
  // commits only on Save. Re-generate freely; only the accepted url is saved.
  const onGenerate = async (slot: ImageSlot) => {
    const prompt = genPrompt.trim()
    if (!prompt) return
    setSlot(slot, {busy: true})
    const res = await generateHostedImage({prompt})
    if (res.ok && res.url) {
      setSlot(slot, {url: res.url})
    } else {
      setSlot(slot, {
        error: res.error ?? l`Could not generate an image.`,
      })
    }
  }

  const onSave = () => {
    save.mutate(
      {
        agent,
        ...(nameChanged ? {displayName: nameDraft ?? ''} : {}),
        ...(bioChanged ? {description: bioDraft ?? ''} : {}),
        ...(avatar.url ? {avatarUrl: avatar.url} : {}),
        ...(banner.url ? {bannerUrl: banner.url} : {}),
      },
      {
        onSuccess: () => {
          control.close(() => {
            Toast.show(l`Profile updated.`, {type: 'success'})
          })
        },
      },
    )
  }

  const saveError = save.error
    ? save.error instanceof AgentProfileWriteError
      ? friendlyProfileError(save.error)
      : save.error.message
    : undefined

  return (
    <Dialog.ScrollableInner label={l`Edit agent profile`}>
      <View style={[a.gap_lg]}>
        <Text style={[a.text_xl, a.font_bold, t.atoms.text]}>
          <Trans>Profile</Trans>
        </Text>

        <View style={[a.gap_xs]}>
          <TextField.LabelText>
            <Trans>Display name</Trans>
          </TextField.LabelText>
          <TextField.Root>
            <TextField.Input
              label={l`Display name`}
              defaultValue={currentName}
              onChangeText={v => setNameDraft(v)}
              autoCapitalize="words"
            />
          </TextField.Root>
          {nameTooLong ? (
            <Text style={[a.text_xs, {color: t.palette.negative_500}]}>
              <Trans>
                Display names can be at most {AGENT_DISPLAY_NAME_MAX_GRAPHEMES}{' '}
                characters.
              </Trans>
            </Text>
          ) : null}
        </View>

        <View style={[a.gap_xs]}>
          <TextField.LabelText>
            <Trans>Bio</Trans>
          </TextField.LabelText>
          <TextField.Root>
            <TextField.Input
              label={l`Bio`}
              defaultValue={currentBio}
              onChangeText={v => setBioDraft(v)}
              multiline
              numberOfLines={3}
              style={{minHeight: 80}}
            />
          </TextField.Root>
          {bioTooLong ? (
            <Text style={[a.text_xs, {color: t.palette.negative_500}]}>
              <Trans>
                Bios can be at most {AGENT_BIO_MAX_GRAPHEMES} characters.
              </Trans>
            </Text>
          ) : null}
        </View>

        <ImageSlotEditor
          label={l`Headshot`}
          shape="avatar"
          currentUrl={profile.data?.avatar}
          draft={avatar}
          generating={genPromptFor === 'avatar'}
          onUpload={() => void onUpload('avatar')}
          onToggleGenerate={() => {
            setGenPromptFor(cur => (cur === 'avatar' ? null : 'avatar'))
          }}
        />
        <ImageSlotEditor
          label={l`Banner`}
          shape="banner"
          currentUrl={profile.data?.banner}
          draft={banner}
          generating={genPromptFor === 'banner'}
          onUpload={() => void onUpload('banner')}
          onToggleGenerate={() => {
            setGenPromptFor(cur => (cur === 'banner' ? null : 'banner'))
          }}
        />

        {genPromptFor ? (
          <View style={[a.gap_xs]}>
            <TextField.LabelText>
              {genPromptFor === 'avatar' ? (
                <Trans>Describe the headshot to generate</Trans>
              ) : (
                <Trans>Describe the banner to generate</Trans>
              )}
            </TextField.LabelText>
            <TextField.Root>
              <TextField.Input
                label={l`Image description`}
                defaultValue={genPrompt}
                onChangeText={setGenPrompt}
                multiline
                numberOfLines={2}
              />
            </TextField.Root>
            <Button
              label={l`Generate image`}
              size="small"
              variant="solid"
              color="secondary"
              disabled={!genPrompt.trim() || getSlot(genPromptFor).busy}
              onPress={() => void onGenerate(genPromptFor)}>
              <ButtonText>
                {getSlot(genPromptFor).url ? (
                  <Trans>Generate again</Trans>
                ) : (
                  <Trans>Generate</Trans>
                )}
              </ButtonText>
            </Button>
          </View>
        ) : null}

        {saveError ? (
          <Text style={[a.text_sm, {color: t.palette.negative_500}]}>
            {saveError}
          </Text>
        ) : null}

        <View style={[a.flex_row, a.gap_sm, a.pt_sm]}>
          <Button
            label={l`Cancel`}
            size="large"
            variant="solid"
            color="secondary"
            style={[a.flex_1]}
            onPress={() => control.close()}>
            <ButtonText>
              <Trans>Cancel</Trans>
            </ButtonText>
          </Button>
          <Button
            label={l`Save profile`}
            size="large"
            variant="solid"
            color="primary"
            style={[a.flex_1]}
            disabled={!canSave}
            onPress={onSave}>
            {save.isPending ? (
              <Loader size="sm" />
            ) : (
              <ButtonText>
                <Trans>Save</Trans>
              </ButtonText>
            )}
          </Button>
        </View>
      </View>
      <Dialog.Close />
    </Dialog.ScrollableInner>
  )
}

/** One image slot: current/staged preview + Upload and Generate affordances. */
function ImageSlotEditor({
  label,
  shape,
  currentUrl,
  draft,
  generating,
  onUpload,
  onToggleGenerate,
}: {
  label: string
  shape: ImageSlot
  currentUrl?: string
  draft: ImageDraft
  generating: boolean
  onUpload: () => void
  onToggleGenerate: () => void
}) {
  const t = useTheme()
  const {t: l} = useLingui()
  const previewUrl = draft.url ?? currentUrl
  const isAvatar = shape === 'avatar'
  return (
    <View style={[a.gap_xs]}>
      <TextField.LabelText>{label}</TextField.LabelText>
      <View style={[a.flex_row, a.align_center, a.gap_md]}>
        {previewUrl ? (
          <Image
            source={{uri: previewUrl}}
            style={[
              isAvatar
                ? {width: 64, height: 64, borderRadius: 32}
                : [a.rounded_sm, {width: 144, height: 48}],
              t.atoms.bg_contrast_25,
            ]}
            contentFit="cover"
            accessibilityIgnoresInvertColors
            alt={l`${label} preview`}
          />
        ) : (
          <View
            style={[
              isAvatar
                ? {width: 64, height: 64, borderRadius: 32}
                : [a.rounded_sm, {width: 144, height: 48}],
              t.atoms.bg_contrast_25,
              a.align_center,
              a.justify_center,
            ]}>
            {draft.busy ? (
              <Loader size="sm" />
            ) : (
              <Text style={[a.text_xs, t.atoms.text_contrast_low]}>
                <Trans>None</Trans>
              </Text>
            )}
          </View>
        )}
        <View style={[a.flex_row, a.gap_sm, a.flex_wrap]}>
          <Button
            label={l`Upload ${label}`}
            size="small"
            variant="solid"
            color="secondary"
            disabled={draft.busy}
            onPress={onUpload}>
            <ButtonText>
              <Trans>Upload</Trans>
            </ButtonText>
          </Button>
          <Button
            label={l`Generate ${label} with AI`}
            size="small"
            variant="solid"
            color={generating ? 'primary_subtle' : 'secondary'}
            disabled={draft.busy}
            onPress={onToggleGenerate}>
            <ButtonText>
              <Trans>Generate</Trans>
            </ButtonText>
          </Button>
        </View>
      </View>
      {draft.busy && previewUrl ? (
        <Text style={[a.text_xs, t.atoms.text_contrast_medium]}>
          <Trans>Working…</Trans>
        </Text>
      ) : null}
      {draft.url ? (
        <Text style={[a.text_xs, t.atoms.text_contrast_medium]}>
          <Trans>New image staged — Save to apply it.</Trans>
        </Text>
      ) : null}
      {draft.error ? (
        <Text style={[a.text_xs, {color: t.palette.negative_500}]}>
          {draft.error}
        </Text>
      ) : null}
    </View>
  )
}

/** Map the runtime's 400/403/409/502 codes to actionable copy. */
function friendlyProfileError(e: AgentProfileWriteError): string {
  switch (e.code) {
    case 'empty-edit':
      return 'Nothing to save yet — change a field first.'
    case 'display-name-too-long':
      return `Display names can be at most ${AGENT_DISPLAY_NAME_MAX_GRAPHEMES} characters.`
    case 'description-too-long':
      return `Bios can be at most ${AGENT_BIO_MAX_GRAPHEMES} characters.`
    case 'bad-image-type':
      return `That ${e.field === 'bannerUrl' ? 'banner' : 'image'} isn't a supported format (PNG, JPEG, or WebP).`
    case 'image-too-large':
      return 'That image is too large for a profile (1MB max). Try a smaller one.'
    case 'image-empty':
    case 'image-fetch-failed':
      return 'The image could not be read from its url. Re-upload and try again.'
    case 'not-your-agent':
      return 'This agent isn’t linked to your account.'
    case 'not-provisioned':
      return 'This agent isn’t provisioned yet.'
    default:
      return e.message
  }
}
