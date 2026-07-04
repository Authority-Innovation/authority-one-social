import {useEffect, useState} from 'react'
import {ActivityIndicator, Pressable, View} from 'react-native'
import {Image} from 'expo-image'
import {Trans, useLingui} from '@lingui/react/macro'

import {
  defaultVoiceSelection,
  fetchPersonaDetail,
  isValidElevenLabsVoiceId,
  type KnowledgeBaseEntry,
  normalizeKeywords,
  type Persona,
  type PersonaVoice,
  type ReferenceImage,
  resolveVoiceSelection,
  uploadChatImage,
  type VoicePickOption,
  voicePickOptions,
} from '#/lib/agent-runtime'
import {openPicker} from '#/lib/media/picker'
import {
  PersonaWriteError,
  useCreatePersonaMutation,
  useUpdatePersonaMutation,
} from '#/state/queries/personas'
import {
  useAddVoiceMutation,
  useDeleteVoiceMutation,
  useVoiceRegistryQuery,
  VoiceWriteError,
} from '#/state/queries/voices'
import {atoms as a, useTheme} from '#/alf'
import {Button, ButtonIcon, ButtonText} from '#/components/Button'
import * as Dialog from '#/components/Dialog'
import * as TextField from '#/components/forms/TextField'
import {Check_Stroke2_Corner0_Rounded as CheckIcon} from '#/components/icons/Check'
import {PlusLarge_Stroke2_Corner0_Rounded as PlusIcon} from '#/components/icons/Plus'
import {TimesLarge_Stroke2_Corner0_Rounded as CloseIcon} from '#/components/icons/Times'
import {Trash_Stroke2_Corner0_Rounded as TrashIcon} from '#/components/icons/Trash'
import * as Toast from '#/components/Toast'
import {Text} from '#/components/Typography'
import {
  addHaunt,
  fictionDraftFrom,
  fictionForUpdate,
  foldPendingHaunt,
  type PersonaFictionDraft,
  removeHaunt,
} from './fiction'

// Soft UI limits with a 90% warning band. The runtime enforces the real hard caps and
// returns 400 codes; these counters just warn before the user hits them. The decoupled
// CharacterCount takes the limit per field, so these are easy to retune in one place.
const IDENTITY_PERSONALITY_LIMIT = 2000 // runtime hard-caps identity.personality at 2000
const KB_SUMMARY_LIMIT = 600
const KB_ENTRY_BODY_LIMIT = 8000
const WARN_RATIO = 0.9
// The runtime caps + dedupes reference images at 8; mirror it so extras aren't silently
// dropped server-side. The runtime keys self-likeness off a reference NAMED "avatar".
const REF_IMAGE_MAX = 8
const PRIMARY_REF_NAME = 'avatar'

/**
 * A live character counter with a soft warning band. Field-agnostic: pass the current
 * length + the field's limit. Reused across identity, summary, and knowledge-base entries.
 */
function CharacterCount({count, limit}: {count: number; limit: number}) {
  const t = useTheme()
  const warnAt = Math.round(limit * WARN_RATIO)
  const over = count > limit
  const near = !over && count >= warnAt
  const color = over
    ? t.palette.negative_500
    : near
      ? t.palette.negative_400
      : t.atoms.text_contrast_medium.color
  return (
    <View style={[a.flex_row, a.align_center, a.gap_sm]}>
      <View style={[a.flex_1]}>
        {over ? (
          <Text style={[a.text_xs, {color}]}>
            <Trans>Over the recommended limit — please shorten it.</Trans>
          </Text>
        ) : near ? (
          <Text style={[a.text_xs, {color}]}>
            <Trans>Getting long — approaching the limit.</Trans>
          </Text>
        ) : null}
      </View>
      <Text style={[a.text_xs, {color}]}>
        {count}/{limit}
      </Text>
    </View>
  )
}

/** Editable knowledge-base entry (keywords held as a comma string while editing). */
interface KbEntryDraft {
  key: string
  id?: string
  title: string
  keywords: string
  body: string
}

let draftSeq = 0
function newDraftKey(): string {
  return `kb_${Date.now().toString(36)}_${draftSeq++}`
}

function toDraft(e: KnowledgeBaseEntry): KbEntryDraft {
  return {
    key: e.id ?? newDraftKey(),
    id: e.id,
    title: e.title,
    keywords: e.keywords.join(', '),
    body: e.body,
  }
}

/** Editable reference image (a NAMED photo the AI can draw on for image generation). */
interface RefImageDraft {
  key: string
  id?: string
  name: string
  /** Hosted R2 url once uploaded; empty while the upload is in flight. */
  url: string
  /** Local picker uri shown as the thumbnail until `url` arrives. */
  previewUri?: string
  uploading?: boolean
}

function toRefDraft(r: ReferenceImage): RefImageDraft {
  return {key: r.id ?? newDraftKey(), id: r.id, name: r.name, url: r.url}
}

/**
 * Drafts for the editor, with the "avatar"-named reference moved to the front so the
 * primary (index 0) IS the likeness reference the runtime keys on.
 */
function loadRefDrafts(refs: ReferenceImage[]): RefImageDraft[] {
  const drafts = refs.map(toRefDraft)
  const idx = drafts.findIndex(
    r => r.name.trim().toLowerCase() === PRIMARY_REF_NAME,
  )
  if (idx > 0) drafts.unshift(drafts.splice(idx, 1)[0])
  return drafts
}

/**
 * Create / edit a persona on the SPLIT schema: IDENTITY (name + voice + compact always-on
 * personality) and a KNOWLEDGE BASE (summary + retrievable entries). On open (edit) the
 * full detail is loaded from /app/personas/get; on save we send the nested shape.
 * Optionally scoped to one of the owner's agents via `agent` (full handle).
 */
export function PersonaEditorDialog({
  control,
  persona,
  voices,
  agent,
}: {
  control: Dialog.DialogControlProps
  persona: Persona | null
  voices: PersonaVoice[]
  agent?: string
}) {
  return (
    <Dialog.Outer control={control}>
      <Dialog.Handle />
      {/* key remounts the form per target so create vs edit starts clean. */}
      <EditorInner
        key={persona?.id ?? 'new'}
        persona={persona}
        voices={voices}
        control={control}
        agent={agent}
      />
    </Dialog.Outer>
  )
}

/** Map the voice-library 400/409/422 codes to actionable copy. */
function friendlyVoiceError(err: unknown): string {
  const code = err instanceof VoiceWriteError ? err.code : undefined
  switch (code) {
    case 'label-required':
      return 'Give the voice a label.'
    case 'label-too-long':
      return 'That label is too long.'
    case 'voice-id-required':
    case 'bad-voice-id':
      return 'Enter a valid ElevenLabs voice id (8–64 letters and numbers).'
    case 'voice-exists':
      return 'That voice is already in your library.'
    case 'library-full':
      return 'Your voice library is full (50 voices). Remove one first.'
    case 'voice-not-found':
      return 'ElevenLabs doesn’t recognize that voice id.'
    default:
      return err instanceof Error ? err.message : 'Could not add the voice.'
  }
}

/**
 * The Voice section: registry-backed picker (builtins + the owner's custom
 * library) with inline management — paste an ElevenLabs voice id to add, two-tap
 * remove on custom voices. Management appears only when the registry is live
 * (`manageable`); the legacy fallback list renders exactly like before.
 */
function VoicePicker({
  options,
  selectedKey,
  onSelect,
  manageable,
  onDeleted,
}: {
  options: VoicePickOption[]
  selectedKey: string | undefined
  onSelect: (key: string) => void
  manageable: boolean
  onDeleted: (key: string) => void
}) {
  const t = useTheme()
  const {t: l} = useLingui()
  const addVoice = useAddVoiceMutation()
  const delVoice = useDeleteVoiceMutation()
  const [adding, setAdding] = useState(false)
  const [newLabel, setNewLabel] = useState('')
  const [newVoiceId, setNewVoiceId] = useState('')
  const [addError, setAddError] = useState<string | null>(null)
  const [armedDeleteId, setArmedDeleteId] = useState<string | null>(null)

  const onAdd = () => {
    const label = newLabel.trim()
    const elId = newVoiceId.trim()
    if (!label) {
      setAddError(l`Give the voice a label.`)
      return
    }
    if (!isValidElevenLabsVoiceId(elId)) {
      setAddError(
        l`Enter a valid ElevenLabs voice id (8–64 letters and numbers).`,
      )
      return
    }
    setAddError(null)
    addVoice.mutate(
      {label, elevenLabsVoiceId: elId},
      {
        onSuccess: res => {
          setAdding(false)
          setNewLabel('')
          setNewVoiceId('')
          if (res.entry) onSelect(`voice:${res.entry.id}`)
          Toast.show(l`Voice added.`, {type: 'success'})
        },
        onError: err => setAddError(friendlyVoiceError(err)),
      },
    )
  }

  const onDelete = (opt: VoicePickOption) => {
    if (!opt.customId) return
    // Two-tap confirm: first tap arms the row, second removes.
    if (armedDeleteId !== opt.customId) {
      setArmedDeleteId(opt.customId)
      return
    }
    setArmedDeleteId(null)
    delVoice.mutate(
      {id: opt.customId},
      {
        onSuccess: () => {
          onDeleted(opt.key)
          Toast.show(
            l`Voice removed. Personas that used it fall back to the default voice.`,
            {type: 'success'},
          )
        },
        onError: err =>
          Toast.show(
            err instanceof Error ? err.message : l`Could not remove the voice.`,
            {type: 'error'},
          ),
      },
    )
  }

  return (
    <View style={[a.gap_xs]}>
      <TextField.LabelText>
        <Trans>Voice</Trans>
      </TextField.LabelText>
      {options.length === 0 ? (
        <Text style={[a.text_sm, t.atoms.text_contrast_medium]}>
          <Trans>No voices available yet.</Trans>
        </Text>
      ) : (
        <View style={[a.gap_2xs]}>
          {options.map(opt => {
            const selected = opt.key === selectedKey
            const armed = !!opt.customId && armedDeleteId === opt.customId
            return (
              <View
                key={opt.key}
                style={[
                  a.flex_row,
                  a.align_center,
                  a.rounded_sm,
                  a.border,
                  selected
                    ? {borderColor: t.palette.primary_500}
                    : t.atoms.border_contrast_low,
                ]}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Use voice ${opt.label}`}
                  accessibilityHint="Selects this voice for the persona"
                  accessibilityState={{selected}}
                  onPress={() => onSelect(opt.key)}
                  style={[
                    a.flex_1,
                    a.flex_row,
                    a.align_center,
                    a.justify_between,
                    a.px_md,
                    a.py_sm,
                  ]}>
                  <View style={[a.flex_row, a.align_center, a.gap_sm]}>
                    <Text style={[a.text_md, t.atoms.text]}>
                      {opt.label}
                      {opt.default ? ' ·' : ''}
                    </Text>
                    {opt.kind === 'custom' ? (
                      <Text style={[a.text_xs, t.atoms.text_contrast_low]}>
                        <Trans>Custom</Trans>
                      </Text>
                    ) : null}
                  </View>
                  {selected ? (
                    <CheckIcon size="sm" fill={t.palette.primary_500} />
                  ) : null}
                </Pressable>
                {manageable && opt.customId ? (
                  <Button
                    label={
                      armed
                        ? l`Confirm removing voice ${opt.label}`
                        : l`Remove voice ${opt.label}`
                    }
                    size="tiny"
                    variant="ghost"
                    color="negative"
                    disabled={delVoice.isPending}
                    onPress={() => onDelete(opt)}
                    style={[a.mx_xs]}>
                    {armed ? (
                      <ButtonText>
                        <Trans>Remove?</Trans>
                      </ButtonText>
                    ) : (
                      <ButtonIcon icon={TrashIcon} />
                    )}
                  </Button>
                ) : null}
              </View>
            )
          })}
        </View>
      )}

      {manageable ? (
        adding ? (
          <View style={[a.gap_xs, a.pt_xs]}>
            <TextField.Root>
              <TextField.Input
                label={l`Voice label`}
                placeholder={l`Label (e.g. “Narrator”)`}
                defaultValue={newLabel}
                onChangeText={setNewLabel}
              />
            </TextField.Root>
            <TextField.Root>
              <TextField.Input
                label={l`ElevenLabs voice id`}
                placeholder={l`ElevenLabs voice id`}
                defaultValue={newVoiceId}
                onChangeText={setNewVoiceId}
                autoCapitalize="none"
                autoCorrect={false}
              />
            </TextField.Root>
            {addError ? (
              <Text style={[a.text_xs, {color: t.palette.negative_500}]}>
                {addError}
              </Text>
            ) : null}
            <View style={[a.flex_row, a.gap_sm]}>
              <Button
                label={l`Add this voice`}
                size="small"
                variant="solid"
                color="primary"
                disabled={addVoice.isPending}
                onPress={onAdd}>
                <ButtonText>
                  <Trans>Add voice</Trans>
                </ButtonText>
              </Button>
              <Button
                label={l`Cancel adding a voice`}
                size="small"
                variant="ghost"
                color="secondary"
                onPress={() => {
                  setAdding(false)
                  setAddError(null)
                }}>
                <ButtonText>
                  <Trans>Cancel</Trans>
                </ButtonText>
              </Button>
            </View>
          </View>
        ) : (
          <Button
            label={l`Add a voice from ElevenLabs`}
            size="small"
            variant="ghost"
            color="secondary"
            onPress={() => setAdding(true)}
            style={[a.self_start]}>
            <ButtonIcon icon={PlusIcon} />
            <ButtonText>
              <Trans>Add voice</Trans>
            </ButtonText>
          </Button>
        )
      ) : null}
    </View>
  )
}

/** Legacy flat voices (from GET /app/personas) as picker options — the fallback
 *  when the registry isn't reachable. Keyed by INDEX because several named slots
 *  can share one voiceId. Writes the raw ElevenLabs id, exactly as before. */
function legacyPickOptions(voices: PersonaVoice[]): VoicePickOption[] {
  return voices.map((v, i) => ({
    value: v.voiceId,
    key: `legacy:${i}`,
    label: v.name,
    voiceId: v.voiceId,
    kind: 'legacy' as const,
    ...(v.default ? {default: true} : {}),
  }))
}

function EditorInner({
  persona,
  voices,
  control,
  agent,
}: {
  persona: Persona | null
  voices: PersonaVoice[]
  control: Dialog.DialogControlProps
  agent?: string
}) {
  const t = useTheme()
  const {t: l} = useLingui()
  const create = useCreatePersonaMutation(agent)
  const update = useUpdatePersonaMutation(agent)
  const isEdit = !!persona

  // Edit mode loads full detail; create starts empty + ready.
  const [loading, setLoading] = useState(isEdit)
  const [loadError, setLoadError] = useState<string | null>(null)

  const [name, setName] = useState(persona?.name ?? '')
  // VOICE REGISTRY (builtins + custom library). Falls back to the legacy flat list
  // when the registry isn't available, preserving the old picker exactly.
  const registry = useVoiceRegistryQuery()
  const registryOptions = registry.data ? voicePickOptions(registry.data) : []
  const registryLive = registryOptions.length > 0
  const voiceOptions = registryLive
    ? registryOptions
    : legacyPickOptions(voices)
  // Selection: an explicit user pick wins; otherwise resolve the persona's STORED
  // voiceId (raw ElevenLabs id, builtin:<key>, or voice:<id>) against the options;
  // otherwise the default. Derived (not effect-synced) so registry/detail load
  // order can't clobber a selection.
  const [pickedVoiceKey, setPickedVoiceKey] = useState<string | null>(null)
  const [loadedVoiceId, setLoadedVoiceId] = useState<string | undefined>(
    persona?.voiceId,
  )
  const [personality, setPersonality] = useState('')
  const [kbSummary, setKbSummary] = useState('')
  const [entries, setEntries] = useState<KbEntryDraft[]>([])
  const [refImages, setRefImages] = useState<RefImageDraft[]>([])
  const [fiction, setFiction] = useState<PersonaFictionDraft>(() =>
    fictionDraftFrom(undefined),
  )
  const [haunt, setHaunt] = useState('')

  // Load full detail on open (edit only). Runs once per target (keyed remount).
  useEffect(() => {
    if (!isEdit || !persona) return
    let cancelled = false
    void (async () => {
      const res = await fetchPersonaDetail(persona.id, agent)
      if (cancelled) return
      if (res.detail) {
        const d = res.detail
        setName(d.name)
        setPersonality(d.identity.personality ?? '')
        setKbSummary(d.knowledgeBase.summary ?? '')
        setEntries(d.knowledgeBase.entries.map(toDraft))
        setRefImages(loadRefDrafts(d.referenceImages))
        setFiction(fictionDraftFrom(d.fiction))
        setLoadedVoiceId(d.voiceId)
      } else if (res.signedOut) {
        setLoadError('Sign in to edit this persona.')
      } else {
        setLoadError(res.error ?? 'Could not load this persona.')
      }
      setLoading(false)
    })()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load once per persona; voices read via closure
  }, [persona?.id])

  const selectedVoiceKey =
    pickedVoiceKey ??
    resolveVoiceSelection(voiceOptions, loadedVoiceId) ??
    defaultVoiceSelection(voiceOptions)
  const selectedVoiceOption = voiceOptions.find(o => o.key === selectedVoiceKey)
  // Save value: the matched option's write-form (builtin:/voice:/raw). A stored id
  // the registry doesn't know keeps its raw value untouched on save.
  const voiceId = selectedVoiceOption?.value ?? loadedVoiceId
  const trimmedName = name.trim()
  const canSave =
    trimmedName.length > 0 && !loading && !create.isPending && !update.isPending

  // Map the runtime's 400 codes to clear, actionable messages.
  const writeError = isEdit ? update.error : create.error
  const writeCode =
    writeError instanceof PersonaWriteError ? writeError.code : undefined
  const saveError = writeError
    ? writeCode === 'identity-too-long'
      ? l`Your personality is too long for the always-on identity. Move the long backstory into the knowledge base below.`
      : writeCode === 'persona-too-large'
        ? l`This persona is too large overall. Trim the identity or shorten knowledge-base entries.`
        : writeError.message
    : undefined

  const addEntry = () => {
    setEntries(prev => [
      ...prev,
      {key: newDraftKey(), title: '', keywords: '', body: ''},
    ])
  }
  const updateEntry = (key: string, patch: Partial<KbEntryDraft>) => {
    setEntries(prev => prev.map(e => (e.key === key ? {...e, ...patch} : e)))
  }
  const removeEntry = (key: string) => {
    setEntries(prev => prev.filter(e => e.key !== key))
  }

  const updateRefImage = (key: string, patch: Partial<RefImageDraft>) => {
    setRefImages(prev => prev.map(r => (r.key === key ? {...r, ...patch} : r)))
  }
  const removeRefImage = (key: string) => {
    setRefImages(prev => prev.filter(r => r.key !== key))
  }
  // Pick a photo, upload it via the raw-bytes media path (same as chat photos), and add
  // it as a NAMED reference. The first one defaults to "avatar" (the primary image).
  const addReferenceImage = async () => {
    if (refImages.length >= REF_IMAGE_MAX) {
      Toast.show(l`You can add up to ${REF_IMAGE_MAX} reference images.`, {
        type: 'warning',
      })
      return
    }
    let picked
    try {
      picked = await openPicker({selectionLimit: 1})
    } catch {
      Toast.show(l`Could not open the photo picker.`, {type: 'warning'})
      return
    }
    const img = picked?.[0]
    if (!img) return
    const key = newDraftKey()
    setRefImages(prev => [
      ...prev,
      {
        key,
        name: prev.length === 0 ? 'avatar' : '',
        url: '',
        previewUri: img.path,
        uploading: true,
      },
    ])
    const url = await uploadChatImage({uri: img.path, mime: img.mime})
    if (url) {
      updateRefImage(key, {url, uploading: false, previewUri: undefined})
    } else {
      removeRefImage(key)
      Toast.show(l`Could not upload the image. Please try again.`, {
        type: 'error',
      })
    }
  }

  const onSave = () => {
    if (!canSave) return
    const done = () => control.close()
    const identity = {personality: personality.trim()}
    const knowledgeBase = {
      summary: kbSummary.trim() || undefined,
      entries: entries
        .map(e => ({
          ...(e.id ? {id: e.id} : {}),
          title: e.title.trim(),
          keywords: normalizeKeywords(e.keywords),
          body: e.body.trim(),
        }))
        .filter(e => e.title.length > 0 || e.body.length > 0),
    }
    // Only fully-uploaded references (have a url), capped at the runtime's max. The PRIMARY
    // (index 0) is ALWAYS named "avatar" — the runtime keys self-likeness off that name, so
    // the primary is forced to it (the UI also locks its name). Others use their typed name.
    const referenceImages = refImages
      .filter(r => !!r.url)
      .slice(0, REF_IMAGE_MAX)
      .map((r, i) => ({
        ...(r.id ? {id: r.id} : {}),
        name: i === 0 ? PRIMARY_REF_NAME : r.name.trim() || 'reference',
        url: r.url,
      }))
    if (isEdit && persona) {
      update.mutate(
        {
          id: persona.id,
          name: trimmedName,
          voiceId,
          identity,
          knowledgeBase,
          referenceImages,
          // Commit a haunt typed into the input but not yet "Added" (the "+"/enter step)
          // so it saves instead of being silently dropped — every other field commits on
          // keystroke; haunts otherwise only reach the list on an explicit Add.
          fiction: fictionForUpdate(foldPendingHaunt(fiction, haunt)),
        },
        {
          onSuccess: res => {
            // Renaming the ACTIVE persona also republishes the agent's public
            // profile; the save can land while that republish fails. Warn softly.
            if (res.profile && !res.profile.published) {
              Toast.show(
                l`Saved, but the agent's public profile name couldn't be updated right now.`,
                {type: 'warning'},
              )
            }
            done()
          },
        },
      )
    } else {
      create.mutate(
        {name: trimmedName, voiceId, identity, knowledgeBase, referenceImages},
        {onSuccess: done},
      )
    }
  }

  const onAddHaunt = () => {
    const next = addHaunt(fiction.haunts, haunt)
    setFiction(f => ({...f, haunts: next}))
    setHaunt('')
  }

  return (
    <Dialog.ScrollableInner label={isEdit ? 'Edit persona' : 'Create persona'}>
      <Dialog.Header>
        <Dialog.HeaderText>
          {isEdit ? <Trans>Edit persona</Trans> : <Trans>Create persona</Trans>}
        </Dialog.HeaderText>
      </Dialog.Header>

      {loading ? (
        <View style={[a.py_2xl, a.align_center]}>
          <ActivityIndicator />
        </View>
      ) : loadError ? (
        <Text style={[a.text_sm, a.py_lg, {color: t.palette.negative_500}]}>
          {loadError}
        </Text>
      ) : (
        <View style={[a.gap_lg]}>
          {/* ── IDENTITY — the compact, always-on "soul" ── */}
          <View style={[a.gap_2xs]}>
            <Text style={[a.text_md, a.font_bold, t.atoms.text]}>
              <Trans>Identity</Trans>
            </Text>
            <Text style={[a.text_xs, t.atoms.text_contrast_medium]}>
              <Trans>
                Who they are — always with the agent, every message. Keep it
                tight; long backstory belongs in the knowledge base below.
              </Trans>
            </Text>
          </View>

          <View style={[a.gap_xs]}>
            <TextField.LabelText>
              <Trans>Name</Trans>
            </TextField.LabelText>
            <TextField.Root>
              <TextField.Input
                label="Persona name"
                defaultValue={name}
                onChangeText={setName}
                autoCapitalize="words"
              />
            </TextField.Root>
          </View>

          <VoicePicker
            options={voiceOptions}
            selectedKey={selectedVoiceKey}
            onSelect={setPickedVoiceKey}
            manageable={registryLive}
            onDeleted={deletedKey => {
              // The removed voice can no longer be the selection; personas still
              // pointing at it fall back to the default voice server-side.
              if (selectedVoiceKey === deletedKey) setPickedVoiceKey(null)
            }}
          />

          <View style={[a.gap_xs]}>
            <TextField.LabelText>
              <Trans>Personality</Trans>
            </TextField.LabelText>
            <TextField.Root>
              <TextField.Input
                label="Persona personality"
                defaultValue={personality}
                onChangeText={setPersonality}
                multiline
                numberOfLines={4}
                style={{minHeight: 96}}
              />
            </TextField.Root>
            <CharacterCount
              count={personality.length}
              limit={IDENTITY_PERSONALITY_LIMIT}
            />
            <Text style={[a.text_xs, t.atoms.text_contrast_medium]}>
              <Trans>
                How the agent should sound and behave. This is the always-on
                soul — keep it short.
              </Trans>
            </Text>
          </View>

          {/* ── KNOWLEDGE BASE — deep lore pulled in when relevant ── */}
          <View
            style={[
              a.gap_lg,
              a.pt_lg,
              a.border_t,
              t.atoms.border_contrast_low,
            ]}>
            <View style={[a.gap_2xs]}>
              <Text style={[a.text_md, a.font_bold, t.atoms.text]}>
                <Trans>Knowledge base</Trans>
              </Text>
              <Text style={[a.text_xs, t.atoms.text_contrast_medium]}>
                <Trans>
                  Deep lore the agent pulls in only when relevant. The summary
                  is always included; entries are retrieved as needed — so this
                  can be long without bloating every message.
                </Trans>
              </Text>
            </View>

            <View style={[a.gap_xs]}>
              <TextField.LabelText>
                <Trans>Summary</Trans>
              </TextField.LabelText>
              <TextField.Root>
                <TextField.Input
                  label="Knowledge base summary"
                  placeholder="e.g. A backcountry guide who knows the Kaimai ranges"
                  defaultValue={kbSummary}
                  onChangeText={setKbSummary}
                  multiline
                  numberOfLines={3}
                  style={{minHeight: 72}}
                />
              </TextField.Root>
              <CharacterCount
                count={kbSummary.length}
                limit={KB_SUMMARY_LIMIT}
              />
            </View>

            <View style={[a.gap_sm]}>
              <TextField.LabelText>
                <Trans>Entries</Trans>
              </TextField.LabelText>
              {entries.length === 0 ? (
                <Text style={[a.text_xs, t.atoms.text_contrast_low]}>
                  <Trans>
                    No entries yet. Add detailed lore the agent can reference.
                  </Trans>
                </Text>
              ) : (
                entries.map(entry => (
                  <View
                    key={entry.key}
                    style={[
                      a.gap_xs,
                      a.rounded_sm,
                      a.p_md,
                      a.border,
                      t.atoms.border_contrast_low,
                    ]}>
                    <View style={[a.flex_row, a.align_center, a.gap_sm]}>
                      <View style={[a.flex_1]}>
                        <TextField.Root>
                          <TextField.Input
                            label="Entry title"
                            placeholder={l`Title`}
                            defaultValue={entry.title}
                            onChangeText={text =>
                              updateEntry(entry.key, {title: text})
                            }
                          />
                        </TextField.Root>
                      </View>
                      <Button
                        label={`${l`Remove entry`} ${entry.title}`}
                        size="small"
                        variant="ghost"
                        color="negative"
                        shape="round"
                        onPress={() => removeEntry(entry.key)}>
                        <ButtonIcon icon={TrashIcon} />
                      </Button>
                    </View>
                    <TextField.Root>
                      <TextField.Input
                        label="Entry keywords"
                        placeholder={l`Keywords (comma-separated)`}
                        defaultValue={entry.keywords}
                        onChangeText={text =>
                          updateEntry(entry.key, {keywords: text})
                        }
                        autoCapitalize="none"
                      />
                    </TextField.Root>
                    <TextField.Root>
                      <TextField.Input
                        label="Entry body"
                        placeholder={l`Details the agent can reference`}
                        defaultValue={entry.body}
                        onChangeText={text =>
                          updateEntry(entry.key, {body: text})
                        }
                        multiline
                        numberOfLines={4}
                        style={{minHeight: 96}}
                      />
                    </TextField.Root>
                    <CharacterCount
                      count={entry.body.length}
                      limit={KB_ENTRY_BODY_LIMIT}
                    />
                  </View>
                ))
              )}
              <Button
                label="Add knowledge base entry"
                size="small"
                variant="solid"
                color="secondary"
                onPress={addEntry}>
                <ButtonIcon icon={PlusIcon} />
                <ButtonText>
                  <Trans>Add entry</Trans>
                </ButtonText>
              </Button>
            </View>
          </View>

          {/* ── REFERENCE IMAGES — named photos the AI draws on for image generation ── */}
          <View
            style={[
              a.gap_lg,
              a.pt_lg,
              a.border_t,
              t.atoms.border_contrast_low,
            ]}>
            <View style={[a.gap_2xs]}>
              <View style={[a.flex_row, a.align_center, a.justify_between]}>
                <Text style={[a.text_md, a.font_bold, t.atoms.text]}>
                  <Trans>Reference images</Trans>
                </Text>
                <Text style={[a.text_xs, t.atoms.text_contrast_medium]}>
                  {refImages.length}/{REF_IMAGE_MAX}
                </Text>
              </View>
              <Text style={[a.text_xs, t.atoms.text_contrast_medium]}>
                <Trans>
                  Named photos the agent can reference when it generates images
                  — car, pet, home… The first is the primary “avatar”, used as
                  the agent’s own likeness. Up to {REF_IMAGE_MAX}.
                </Trans>
              </Text>
            </View>

            {refImages.length === 0 ? (
              <Text style={[a.text_xs, t.atoms.text_contrast_low]}>
                <Trans>No reference images yet.</Trans>
              </Text>
            ) : (
              <View style={[a.gap_sm]}>
                {refImages.map((r, i) => (
                  <View
                    key={r.key}
                    style={[
                      a.flex_row,
                      a.align_center,
                      a.gap_sm,
                      a.rounded_sm,
                      a.p_sm,
                      a.border,
                      t.atoms.border_contrast_low,
                    ]}>
                    <View
                      style={[
                        a.rounded_sm,
                        a.align_center,
                        a.justify_center,
                        t.atoms.bg_contrast_25,
                        {width: 48, height: 48},
                      ]}>
                      {r.uploading ? (
                        <ActivityIndicator size="small" />
                      ) : (
                        <Image
                          source={{uri: r.url || r.previewUri}}
                          style={[a.rounded_sm, {width: 48, height: 48}]}
                          contentFit="cover"
                          accessibilityIgnoresInvertColors
                          alt={r.name || 'Reference image'}
                        />
                      )}
                    </View>
                    <View style={[a.flex_1, a.gap_2xs]}>
                      {i === 0 ? (
                        // PRIMARY: name is locked to "avatar" (the runtime's self-likeness
                        // key) so the user can't rename it away.
                        <>
                          <Text style={[a.text_md, a.font_bold, t.atoms.text]}>
                            {PRIMARY_REF_NAME}
                          </Text>
                          <Text style={[a.text_xs, t.atoms.text_contrast_low]}>
                            <Trans>
                              Primary — used as the agent’s likeness.
                            </Trans>
                          </Text>
                        </>
                      ) : (
                        <TextField.Root>
                          <TextField.Input
                            label="Reference image name"
                            placeholder={l`e.g. car, pet, home`}
                            defaultValue={r.name}
                            onChangeText={text =>
                              updateRefImage(r.key, {name: text})
                            }
                            autoCapitalize="none"
                          />
                        </TextField.Root>
                      )}
                    </View>
                    <Button
                      label={`${l`Remove`} ${r.name || 'reference image'}`}
                      size="small"
                      variant="ghost"
                      color="negative"
                      shape="round"
                      disabled={r.uploading}
                      onPress={() => removeRefImage(r.key)}>
                      <ButtonIcon icon={TrashIcon} />
                    </Button>
                  </View>
                ))}
              </View>
            )}

            {refImages.length < REF_IMAGE_MAX ? (
              <Button
                label="Add reference image"
                size="small"
                variant="solid"
                color="secondary"
                onPress={() => {
                  void addReferenceImage()
                }}>
                <ButtonIcon icon={PlusIcon} />
                <ButtonText>
                  <Trans>Add reference image</Trans>
                </ButtonText>
              </Button>
            ) : (
              <Text style={[a.text_xs, t.atoms.text_contrast_low]}>
                <Trans>
                  Maximum of {REF_IMAGE_MAX} reference images reached.
                </Trans>
              </Text>
            )}
          </View>

          {/* ── FICTIONAL LIFE — authored on an existing persona ── */}
          {isEdit ? (
            <View
              style={[
                a.gap_lg,
                a.pt_lg,
                a.border_t,
                t.atoms.border_contrast_low,
              ]}>
              <View style={[a.gap_2xs]}>
                <Text style={[a.text_md, a.font_bold, t.atoms.text]}>
                  <Trans>Fictional life</Trans>
                </Text>
                <Text style={[a.text_xs, t.atoms.text_contrast_medium]}>
                  <Trans>
                    An optional authored backstory and routine. The agent draws
                    on it when “bring to life” is on.
                  </Trans>
                </Text>
              </View>

              <Pressable
                accessibilityRole="switch"
                accessibilityLabel="Bring this persona to life"
                accessibilityHint="Toggles whether the agent uses this fictional backstory"
                accessibilityState={{checked: fiction.enabled}}
                onPress={() => setFiction(f => ({...f, enabled: !f.enabled}))}
                style={[
                  a.flex_row,
                  a.align_center,
                  a.justify_between,
                  a.rounded_sm,
                  a.px_md,
                  a.py_sm,
                  a.border,
                  fiction.enabled
                    ? {borderColor: t.palette.primary_500}
                    : t.atoms.border_contrast_low,
                ]}>
                <Text style={[a.text_md, t.atoms.text]}>
                  <Trans>Bring this persona to life</Trans>
                </Text>
                <View
                  style={[
                    a.rounded_full,
                    a.px_sm,
                    {
                      paddingVertical: 2,
                      backgroundColor: fiction.enabled
                        ? t.palette.primary_500
                        : t.palette.contrast_100,
                    },
                  ]}>
                  <Text
                    style={[
                      a.text_xs,
                      a.font_bold,
                      {
                        color: fiction.enabled
                          ? t.palette.white
                          : t.palette.contrast_600,
                      },
                    ]}>
                    {fiction.enabled ? 'On' : 'Off'}
                  </Text>
                </View>
              </Pressable>

              <View style={[a.gap_xs]}>
                <TextField.LabelText>
                  <Trans>Backstory</Trans>
                </TextField.LabelText>
                <TextField.Root>
                  <TextField.Input
                    label="Persona backstory"
                    defaultValue={fiction.backstory}
                    onChangeText={text =>
                      setFiction(f => ({...f, backstory: text}))
                    }
                    multiline
                    numberOfLines={4}
                    style={{minHeight: 96}}
                  />
                </TextField.Root>
              </View>

              <View style={[a.gap_xs]}>
                <TextField.LabelText>
                  <Trans>Home base</Trans>
                </TextField.LabelText>
                <TextField.Root>
                  <TextField.Input
                    label="Persona home base"
                    placeholder="e.g. Raleigh, NC"
                    defaultValue={fiction.homeBase}
                    onChangeText={text =>
                      setFiction(f => ({...f, homeBase: text}))
                    }
                  />
                </TextField.Root>
              </View>

              <View style={[a.gap_xs]}>
                <TextField.LabelText>
                  <Trans>Haunts</Trans>
                </TextField.LabelText>
                <View style={[a.flex_row, a.gap_sm]}>
                  <View style={[a.flex_1]}>
                    <TextField.Root>
                      <TextField.Input
                        label="Add a haunt"
                        placeholder="e.g. the corner coffee shop"
                        value={haunt}
                        onChangeText={setHaunt}
                        onSubmitEditing={onAddHaunt}
                      />
                    </TextField.Root>
                  </View>
                  <Button
                    label="Add haunt"
                    size="small"
                    variant="solid"
                    color="secondary"
                    shape="square"
                    disabled={!haunt.trim()}
                    onPress={onAddHaunt}>
                    <ButtonIcon icon={PlusIcon} />
                  </Button>
                </View>
                {fiction.haunts.length > 0 ? (
                  <View style={[a.gap_2xs, a.pt_2xs]}>
                    {fiction.haunts.map((h, i) => (
                      <View
                        key={`${h}_${i}`}
                        style={[
                          a.flex_row,
                          a.align_center,
                          a.justify_between,
                          a.rounded_sm,
                          a.px_md,
                          a.py_xs,
                          t.atoms.bg_contrast_25,
                        ]}>
                        <Text
                          style={[a.flex_1, a.text_sm, t.atoms.text]}
                          numberOfLines={1}>
                          {h}
                        </Text>
                        <Pressable
                          accessibilityRole="button"
                          accessibilityLabel={`Remove ${h}`}
                          accessibilityHint=""
                          onPress={() =>
                            setFiction(f => ({
                              ...f,
                              haunts: removeHaunt(f.haunts, i),
                            }))
                          }
                          style={[a.p_xs]}>
                          <CloseIcon
                            size="xs"
                            fill={t.atoms.text_contrast_medium.color}
                          />
                        </Pressable>
                      </View>
                    ))}
                  </View>
                ) : null}
              </View>

              <View style={[a.gap_xs]}>
                <TextField.LabelText>
                  <Trans>Weekly rhythm</Trans>
                </TextField.LabelText>
                <TextField.Root>
                  <TextField.Input
                    label="Persona weekly rhythm"
                    placeholder="e.g. Mondays at the gym, Fridays out with friends"
                    defaultValue={fiction.weeklyRhythm}
                    onChangeText={text =>
                      setFiction(f => ({...f, weeklyRhythm: text}))
                    }
                    multiline
                    numberOfLines={3}
                    style={{minHeight: 72}}
                  />
                </TextField.Root>
              </View>
            </View>
          ) : null}

          {saveError ? (
            <Text style={[a.text_sm, {color: t.palette.negative_500}]}>
              {saveError}
            </Text>
          ) : null}

          <Button
            label={isEdit ? 'Save changes' : 'Create persona'}
            size="large"
            variant="solid"
            color="primary"
            disabled={!canSave}
            onPress={onSave}>
            <ButtonText>
              {isEdit ? (
                <Trans>Save changes</Trans>
              ) : (
                <Trans>Create persona</Trans>
              )}
            </ButtonText>
          </Button>
        </View>
      )}

      <Dialog.Close />
    </Dialog.ScrollableInner>
  )
}
