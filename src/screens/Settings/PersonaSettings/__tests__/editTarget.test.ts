import {type Persona} from '#/lib/agent-runtime'
import {personaEditTarget} from '../editTarget'

const persona = (id: string, name: string): Persona => ({id, name})

describe('personaEditTarget', () => {
  it('returns null when no personas exist (create mode)', () => {
    expect(personaEditTarget([], undefined)).toBeNull()
    expect(personaEditTarget([], 'p_x')).toBeNull()
  })

  it('picks the ACTIVE persona, never the first/default record', () => {
    // Mirrors the live fleet shape: default record first, active is a later one
    // (ada presents as Stormy, brian-agent as a non-default record, etc.).
    const personas = [
      persona('default', 'Bob'),
      persona('p_257d0e06-dda', 'Stormy'),
    ]
    expect(personaEditTarget(personas, 'p_257d0e06-dda')?.name).toBe('Stormy')
  })

  it('picks the active persona regardless of position', () => {
    const personas = [
      persona('default', 'Brian'),
      persona('p_a', 'Dorothy'),
      persona('p_b', 'Boogie'),
    ]
    expect(personaEditTarget(personas, 'default')?.name).toBe('Brian')
    expect(personaEditTarget(personas, 'p_b')?.name).toBe('Boogie')
  })

  it('falls back to the first persona when the active id matches nothing', () => {
    const personas = [persona('default', 'Bob'), persona('p_a', 'Stormy')]
    expect(personaEditTarget(personas, 'p_gone')?.name).toBe('Bob')
    expect(personaEditTarget(personas, undefined)?.name).toBe('Bob')
  })

  it('returns the sole persona for single-identity agents', () => {
    const personas = [persona('default', 'Hecate')]
    expect(personaEditTarget(personas, 'default')?.name).toBe('Hecate')
  })
})
