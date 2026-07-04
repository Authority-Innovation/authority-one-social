import {
  defaultVoiceSelection,
  isValidElevenLabsVoiceId,
  normalizeVoiceRegistry,
  resolveVoiceSelection,
  voiceDisplayLabel,
  voicePickOptions,
} from '../voicesClient'

const REGISTRY = {
  builtins: [
    {key: 'bob', label: 'Bob', voiceId: 'ELBobVoice123', default: true},
    {key: 'stormy', label: 'Stormy', voiceId: 'ELStormy45678'},
  ],
  custom: [
    {id: 'v1', label: 'Narrator', voiceId: 'ELNarr9999999', createdAt: 'x'},
  ],
}

describe('normalizeVoiceRegistry', () => {
  it('returns null for the legacy flat shape (no builtins/custom)', () => {
    expect(normalizeVoiceRegistry({voices: [{voiceId: 'a', name: 'A'}]})).toBe(
      null,
    )
    expect(normalizeVoiceRegistry(undefined)).toBe(null)
  })

  it('parses builtins + custom, dropping malformed rows', () => {
    const reg = normalizeVoiceRegistry({
      builtins: [
        {key: 'bob', label: 'Bob', voiceId: 'id1', default: true},
        {label: 'no key', voiceId: 'id2'},
      ],
      custom: [{id: 'c1', label: 'X', voiceId: 'id3'}, {label: 'no id'}],
    })
    expect(reg?.builtins).toHaveLength(1)
    expect(reg?.builtins[0]).toEqual({
      key: 'bob',
      label: 'Bob',
      voiceId: 'id1',
      default: true,
    })
    expect(reg?.custom).toHaveLength(1)
    expect(reg?.custom[0].id).toBe('c1')
  })
})

describe('voicePickOptions / selection', () => {
  const options = voicePickOptions(REGISTRY)

  it('projects builtins first with prefixed write values', () => {
    expect(options.map(o => o.value)).toEqual([
      'builtin:bob',
      'builtin:stormy',
      'voice:v1',
    ])
    expect(options[2].customId).toBe('v1')
  })

  it('resolves all three stored voiceId forms', () => {
    expect(resolveVoiceSelection(options, 'builtin:stormy')).toBe(
      'builtin:stormy',
    )
    expect(resolveVoiceSelection(options, 'voice:v1')).toBe('voice:v1')
    // Legacy raw ElevenLabs id matches by the underlying voice id.
    expect(resolveVoiceSelection(options, 'ELStormy45678')).toBe(
      'builtin:stormy',
    )
    expect(resolveVoiceSelection(options, 'ELNarr9999999')).toBe('voice:v1')
    expect(resolveVoiceSelection(options, 'ELUnknown0000')).toBeUndefined()
    expect(resolveVoiceSelection(options, undefined)).toBeUndefined()
  })

  it('defaults to the flagged builtin, else the first option', () => {
    expect(defaultVoiceSelection(options)).toBe('builtin:bob')
    expect(
      defaultVoiceSelection(
        voicePickOptions({builtins: [], custom: REGISTRY.custom}),
      ),
    ).toBe('voice:v1')
    expect(defaultVoiceSelection([])).toBeUndefined()
  })

  it('labels any known stored form; undefined for unknown ids', () => {
    expect(voiceDisplayLabel(options, 'builtin:bob')).toBe('Bob')
    expect(voiceDisplayLabel(options, 'ELNarr9999999')).toBe('Narrator')
    expect(voiceDisplayLabel(options, 'ELUnknown0000')).toBeUndefined()
  })
})

describe('isValidElevenLabsVoiceId', () => {
  it('accepts 8-64 alphanumerics and rejects everything else', () => {
    expect(isValidElevenLabsVoiceId('AbCd1234')).toBe(true)
    expect(isValidElevenLabsVoiceId('a'.repeat(64))).toBe(true)
    expect(isValidElevenLabsVoiceId('short')).toBe(false)
    expect(isValidElevenLabsVoiceId('has-dash-123')).toBe(false)
    expect(isValidElevenLabsVoiceId('a'.repeat(65))).toBe(false)
  })
})
