// First-run agent picker: a PURE state machine (tested) plus the runner that
// drives it against the runtime. Shown when the AO session has no primary
// agent (`needsAgent`), and again whenever the runtime answers 403
// `not-provisioned` (every /app/* route but the three picker routes refuses
// until a primary exists).
import {type AOClient} from './client'
import {AOSignatureError} from './errors'
import {type AOPickerAgent, type AOPickerList} from './wire'

export type PickerPhase =
  | {name: 'loading'}
  | {name: 'choosing'}
  | {name: 'creating'; label: string; title: string}
  | {name: 'selecting'; handle: string}
  | {name: 'done'; primary: string}
  | {name: 'failed'; error: unknown}

export interface PickerState {
  phase: PickerPhase
  agents: AOPickerAgent[]
  /** A non-fatal note shown on the choices (the last refusal). */
  note: unknown
}

export type PickerEvent =
  | {type: 'loaded'; list: AOPickerList}
  | {type: 'load-failed'; error: unknown}
  | {type: 'create'; name: string}
  | {type: 'created'; primary: string | null}
  | {type: 'create-failed'; error: unknown}
  | {type: 'select'; handle: string}
  | {type: 'selected'; primary: string}
  | {type: 'select-failed'; error: unknown}
  | {type: 'retry'}

export const initialPickerState: PickerState = {
  phase: {name: 'loading'},
  agents: [],
  note: null,
}

/** "Ron Pickles" → "ron-pickles" (the runtime appends its PDS domain and
 *  re-slugifies as the backstop). PURE. */
export function handleLabel(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 18)
    .replace(/-+$/g, '')
}

const busy = (p: PickerPhase) => p.name === 'creating' || p.name === 'selecting'

export function pickerReducer(s: PickerState, e: PickerEvent): PickerState {
  switch (e.type) {
    case 'loaded':
      // Any primary ends the picker — including one that was already there.
      if (e.list.primary) {
        return {
          ...s,
          agents: e.list.agents,
          phase: {name: 'done', primary: e.list.primary},
        }
      }
      return {...s, agents: e.list.agents, phase: {name: 'choosing'}}
    case 'load-failed':
      return {...s, phase: {name: 'failed', error: e.error}}
    case 'create': {
      if (busy(s.phase) || s.phase.name === 'done') return s
      const label = handleLabel(e.name)
      if (!label) {
        return {
          ...s,
          phase: {name: 'choosing'},
          note: new AOSignatureError('refused', 400, 'invalid-handle'),
        }
      }
      return {
        ...s,
        phase: {name: 'creating', label, title: e.name.trim()},
        note: null,
      }
    }
    case 'created':
      if (s.phase.name !== 'creating') return s
      // A null/absent primary is NEVER taken as the primary: re-read the list.
      if (e.primary) return {...s, phase: {name: 'done', primary: e.primary}}
      // …and if the re-read has no primary either, the choices say why.
      return {
        ...s,
        phase: {name: 'loading'},
        note: new AOSignatureError('refused', 403, 'not-provisioned'),
      }
    case 'create-failed':
      if (s.phase.name !== 'creating') return s
      return {...s, phase: {name: 'choosing'}, note: e.error}
    case 'select': {
      if (busy(s.phase) || s.phase.name === 'done') return s
      // Only an agent from the listed set — the runtime enforces the same.
      const hit = s.agents.find(
        a => a.handle.toLowerCase() === e.handle.toLowerCase(),
      )
      if (!hit) {
        return {
          ...s,
          note: new AOSignatureError('refused', 403, 'not-your-agent'),
        }
      }
      return {...s, phase: {name: 'selecting', handle: hit.handle}, note: null}
    }
    case 'selected':
      if (s.phase.name !== 'selecting') return s
      return {...s, phase: {name: 'done', primary: e.primary}}
    case 'select-failed':
      if (s.phase.name !== 'selecting') return s
      return {...s, phase: {name: 'choosing'}, note: e.error}
    case 'retry':
      return {...s, phase: {name: 'loading'}, note: null}
  }
}

/** Is this a runtime refusal that means "pick an agent first"? */
export function isNotProvisioned(status: number, code: string): boolean {
  return status === 403 && code === 'not-provisioned'
}

/**
 * Run one side effect for the current phase and return the follow-up event
 * (or null when the phase needs no I/O). The React screen loops this.
 */
export async function pickerEffect(
  s: PickerState,
  client: AOClient,
  token: string,
): Promise<PickerEvent | null> {
  const p = s.phase
  try {
    if (p.name === 'loading') {
      return {type: 'loaded', list: await client.listAgents(token)}
    }
    if (p.name === 'creating') {
      const out = await client.createAgent(token, {
        handle: p.label,
        name: p.title,
      })
      return {type: 'created', primary: out.primary}
    }
    if (p.name === 'selecting') {
      return {
        type: 'selected',
        primary: await client.choosePrimary(token, p.handle),
      }
    }
  } catch (error) {
    if (p.name === 'loading') return {type: 'load-failed', error}
    if (p.name === 'creating') return {type: 'create-failed', error}
    return {type: 'select-failed', error}
  }
  return null
}
