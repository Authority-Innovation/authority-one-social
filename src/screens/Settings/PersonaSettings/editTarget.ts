import {type Persona} from '#/lib/agent-runtime'

/**
 * The single persona the collapsed (one-identity) settings UI edits in place.
 *
 * MUST resolve to the ACTIVE persona when one is marked active: the live fleet
 * has agents whose active persona is not the first/default record (verified
 * 2026-07-21 - ada, brian-agent, opie-orange, dorothy all present as a
 * non-default persona), and editing any other record would silently change who
 * the agent presents as. Extra hidden personas stay untouched in storage; this
 * is a UI collapse, not a data migration.
 *
 * Falls back to the first persona only when no record matches the active id;
 * null means nothing exists yet (the editor opens in create mode).
 */
export function personaEditTarget(
  personas: Persona[],
  activeId: string | undefined,
): Persona | null {
  if (personas.length === 0) return null
  return personas.find(p => p.id === activeId) ?? personas[0]
}
