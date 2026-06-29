import {useEffect, useState} from 'react'
import {ActivityIndicator, Pressable, View} from 'react-native'
import {Image} from 'expo-image'
import {Trans, useLingui} from '@lingui/react/macro'

import {
  fetchPersonaDetail,
  type KnowledgeBaseEntry,
  normalizeKeywords,
  type Persona,
  type PersonaVoice,
  type ReferenceImage,
  uploadChatImage,
} from '#/lib/agent-runtime'
import {openPicker} from '#/lib/media/picker'
import {
  PersonaWriteError,
  useCreatePersonaMutation,
  useUpdatePersonaMutation,
} from '#/state/queries/personas'
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
 * Create / edit a persona on the SPLIT schema: IDENTITY (name + voice + compact always-on
 * personality) and a KNOWLEDGE BASE (summary + retrievable entries). On open (edit) the
 * full detail is loaded from /app/personas/get; on save we send the nested shape.
 */
export function PersonaEditorDialog({
  control,
  persona,
  voices,
}: {
  control: Dialog.DialogControlProps
  persona: Persona | null
  voices: PersonaVoice[]
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
      />
    </Dialog.Outer>
  )
}

function defaultVoiceIndex(voices: PersonaVoice[]): number {
  const def = voices.findIndex(v => v.default)
  return def >= 0 ? def : voices.length > 0 ? 0 : -1
}

function EditorInner({
  persona,
  voices,
  control,
}: {
  persona: Persona | null
  voices: PersonaVoice[]
  control: Dialog.DialogControlProps
}) {
  const t = useTheme()
  const {t: l} = useLingui()
  const create = useCreatePersonaMutation()
  const update = useUpdatePersonaMutation()
  const isEdit = !!persona

  // Edit mode loads full detail; create starts empty + ready.
  const [loading, setLoading] = useState(isEdit)
  const [loadError, setLoadError] = useState<string | null>(null)

  const [name, setName] = useState(persona?.name ?? '')
  const [voiceIndex, setVoiceIndex] = useState<number>(
    defaultVoiceIndex(voices),
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
      const res = await fetchPersonaDetail(persona.id)
      if (cancelled) return
      if (res.detail) {
        const d = res.detail
        setName(d.name)
        setPersonality(d.identity.personality ?? '')
        setKbSummary(d.knowledgeBase.summary ?? '')
        setEntries(d.knowledgeBase.entries.map(toDraft))
        setRefImages(d.referenceImages.map(toRefDraft))
        setFiction(fictionDraftFrom(d.fiction))
        const vi = voices.findIndex(v => v.voiceId === d.voiceId)
        if (vi >= 0) setVoiceIndex(vi)
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

  const voiceId = voiceIndex >= 0 ? voices[voiceIndex]?.voiceId : undefined
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
    // Only fully-uploaded references (have a url); a blank name defaults so none is empty.
    const referenceImages = refImages
      .filter(r => !!r.url)
      .map((r, i) => ({
        ...(r.id ? {id: r.id} : {}),
        name: r.name.trim() || (i === 0 ? 'avatar' : 'reference'),
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
          fiction: fictionForUpdate(fiction),
        },
        {onSuccess: done},
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

          <View style={[a.gap_xs]}>
            <TextField.LabelText>
              <Trans>Voice</Trans>
            </TextField.LabelText>
            {voices.length === 0 ? (
              <Text style={[a.text_sm, t.atoms.text_contrast_medium]}>
                <Trans>No voices available yet.</Trans>
              </Text>
            ) : (
              <View style={[a.gap_2xs]}>
                {voices.map((v, index) => {
                  // Select by slot INDEX, not voiceId: several named slots can share one
                  // voiceId; keying on voiceId would highlight all + collide React keys.
                  const selected = index === voiceIndex
                  return (
                    <Pressable
                      key={`${index}:${v.voiceId}`}
                      accessibilityRole="button"
                      accessibilityLabel={`Use voice ${v.name}`}
                      accessibilityHint="Selects this voice for the persona"
                      accessibilityState={{selected}}
                      onPress={() => setVoiceIndex(index)}
                      style={[
                        a.flex_row,
                        a.align_center,
                        a.justify_between,
                        a.rounded_sm,
                        a.px_md,
                        a.py_sm,
                        a.border,
                        selected
                          ? {borderColor: t.palette.primary_500}
                          : t.atoms.border_contrast_low,
                      ]}>
                      <Text style={[a.text_md, t.atoms.text]}>
                        {v.name}
                        {v.default ? ' ·' : ''}
                      </Text>
                      {selected ? (
                        <CheckIcon size="sm" fill={t.palette.primary_500} />
                      ) : null}
                    </Pressable>
                  )
                })}
              </View>
            )}
          </View>

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
              <Text style={[a.text_md, a.font_bold, t.atoms.text]}>
                <Trans>Reference images</Trans>
              </Text>
              <Text style={[a.text_xs, t.atoms.text_contrast_medium]}>
                <Trans>
                  Named photos the agent can reference when it generates images
                  — your avatar, car, pet, home… The first one is the primary
                  profile image.
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
                      <TextField.Root>
                        <TextField.Input
                          label="Reference image name"
                          placeholder={
                            i === 0 ? l`avatar` : l`e.g. car, pet, home`
                          }
                          defaultValue={r.name}
                          onChangeText={text =>
                            updateRefImage(r.key, {name: text})
                          }
                          autoCapitalize="none"
                        />
                      </TextField.Root>
                      {i === 0 ? (
                        <Text style={[a.text_xs, t.atoms.text_contrast_low]}>
                          <Trans>Primary profile image</Trans>
                        </Text>
                      ) : null}
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
