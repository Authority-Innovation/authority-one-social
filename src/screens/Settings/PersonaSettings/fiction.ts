import {type Persona, type PersonaFiction} from '#/lib/agent-runtime'

/**
 * Pure helpers for the persona "fictional life" editor — building the update payload,
 * seeding the form from a persona, and the editable haunts list. No React/I-O, so the
 * logic is unit-testable independent of the dialog.
 */

/** Editor form state (strings + the editable haunts list). */
export interface PersonaFictionDraft {
  enabled: boolean
  backstory: string
  homeBase: string
  haunts: string[]
  weeklyRhythm: string
}

export function emptyFictionDraft(): PersonaFictionDraft {
  return {
    enabled: false,
    backstory: '',
    homeBase: '',
    haunts: [],
    weeklyRhythm: '',
  }
}

/** Seed the editor from a PersonaFiction (or empty when none). */
export function fictionDraftFrom(
  f: PersonaFiction | undefined,
): PersonaFictionDraft {
  if (!f) return emptyFictionDraft()
  return {
    enabled: f.enabled === true,
    backstory: f.backstory ?? '',
    homeBase: f.homeBase ?? '',
    haunts: Array.isArray(f.haunts) ? [...f.haunts] : [],
    weeklyRhythm: f.weeklyRhythm ?? '',
  }
}

/** Seed the editor from a persona's existing fiction (or empty when none). */
export function fictionDraftFromPersona(
  persona: Persona | null,
): PersonaFictionDraft {
  return fictionDraftFrom(persona?.fiction)
}

/** Append a haunt (trimmed, non-empty, de-duped case-insensitively). */
export function addHaunt(haunts: string[], value: string): string[] {
  const v = value.trim()
  if (!v) return haunts
  const exists = haunts.some(h => h.toLowerCase() === v.toLowerCase())
  return exists ? haunts : [...haunts, v]
}

/** Remove the haunt at `index`. */
export function removeHaunt(haunts: string[], index: number): string[] {
  return haunts.filter((_, i) => i !== index)
}

/**
 * Fold a still-in-the-input haunt (typed but not yet committed via the "+" / Add button)
 * into the draft's haunts list. THIS IS THE "saved places don't save" FIX: every other
 * fiction field commits to the draft on each keystroke (onChangeText), but a haunt only
 * reaches the list on an explicit Add — so a user who types a place and hits Save loses it
 * while backstory/home base/etc. persist. Called from onSave so the pending text is
 * committed just like Add would. Blank/whitespace pending ⇒ draft returned unchanged
 * (referentially identical). PURE — reuses addHaunt (trim + case-insensitive de-dupe).
 */
export function foldPendingHaunt(
  draft: PersonaFictionDraft,
  pending: string,
): PersonaFictionDraft {
  if (!pending.trim()) return draft
  return {...draft, haunts: addHaunt(draft.haunts, pending)}
}

function trimToUndef(v: string): string | undefined {
  const t = v.trim()
  return t.length > 0 ? t : undefined
}

/** Clean the haunts list for the wire: trim, drop empties, de-dupe. */
export function cleanHaunts(haunts: string[]): string[] {
  const out: string[] = []
  for (const raw of haunts) {
    const v = raw.trim()
    if (!v) continue
    if (out.some(h => h.toLowerCase() === v.toLowerCase())) continue
    out.push(v)
  }
  return out
}

/**
 * Whether the draft has anything worth sending. We include `fiction` in the update only
 * when the user has enabled it or authored any field — so a persona that never had a
 * fictional life keeps its exact prior update payload.
 */
export function fictionHasContent(draft: PersonaFictionDraft): boolean {
  return (
    draft.enabled ||
    draft.backstory.trim().length > 0 ||
    draft.homeBase.trim().length > 0 ||
    draft.weeklyRhythm.trim().length > 0 ||
    cleanHaunts(draft.haunts).length > 0
  )
}

/** Build the normalized PersonaFiction payload from the editor draft. */
export function buildFictionPayload(
  draft: PersonaFictionDraft,
): PersonaFiction {
  return {
    enabled: draft.enabled,
    backstory: trimToUndef(draft.backstory),
    homeBase: trimToUndef(draft.homeBase),
    haunts: cleanHaunts(draft.haunts),
    weeklyRhythm: trimToUndef(draft.weeklyRhythm),
  }
}

/**
 * The `fiction` value to pass to updatePersona: the built payload when there's content,
 * else undefined (omit the field entirely).
 */
export function fictionForUpdate(
  draft: PersonaFictionDraft,
): PersonaFiction | undefined {
  return fictionHasContent(draft) ? buildFictionPayload(draft) : undefined
}
