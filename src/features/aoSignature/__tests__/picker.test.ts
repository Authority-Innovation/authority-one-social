import {describe, expect, it} from '@jest/globals'

import {type AOClient} from '../client'
import {AOSignatureError} from '../errors'
import {
  handleLabel,
  initialPickerState,
  isNotProvisioned,
  pickerEffect,
  pickerReducer,
  type PickerState,
} from '../picker'

const agents = [
  {handle: 'steve.pds.test', displayName: 'Steve', did: null},
  {handle: 'bob.pds.test', displayName: null, did: null},
]
const choosing: PickerState = {phase: {name: 'choosing'}, agents, note: null}

describe('picker state machine', () => {
  it('loading → choosing with no primary; any primary ends it', () => {
    let s = pickerReducer(initialPickerState, {
      type: 'loaded',
      list: {agents, primary: null, needsAgent: true},
    })
    expect(s.phase).toEqual({name: 'choosing'})
    s = pickerReducer(initialPickerState, {
      type: 'loaded',
      list: {agents, primary: 'bob.pds.test', needsAgent: false},
    })
    expect(s.phase).toEqual({name: 'done', primary: 'bob.pds.test'})
  })

  it('create → creating(label) → a null primary is NEVER adopted: re-read, with a note', () => {
    let s = pickerReducer(choosing, {type: 'create', name: 'Ron Pickles'})
    expect(s.phase).toEqual({
      name: 'creating',
      label: 'ron-pickles',
      title: 'Ron Pickles',
    })
    s = pickerReducer(s, {type: 'created', primary: null})
    expect(s.phase).toEqual({name: 'loading'})
    s = pickerReducer(s, {
      type: 'loaded',
      list: {agents, primary: null, needsAgent: true},
    })
    expect(s.phase).toEqual({name: 'choosing'})
    expect(s.note).toBeInstanceOf(AOSignatureError)
    const ok = pickerReducer(
      pickerReducer(choosing, {type: 'create', name: 'Ron'}),
      {
        type: 'created',
        primary: 'ron.pds.test',
      },
    )
    expect(ok.phase).toEqual({name: 'done', primary: 'ron.pds.test'})
  })

  it('an unusable name is refused locally', () => {
    const s = pickerReducer(choosing, {type: 'create', name: '!!!'})
    expect(s.phase).toEqual({name: 'choosing'})
    expect((s.note as AOSignatureError).code).toBe('invalid-handle')
  })

  it('select is limited to the listed set', () => {
    const bad = pickerReducer(choosing, {
      type: 'select',
      handle: 'mallory.pds.test',
    })
    expect(bad.phase).toEqual({name: 'choosing'})
    expect((bad.note as AOSignatureError).code).toBe('not-your-agent')
    const s = pickerReducer(choosing, {
      type: 'select',
      handle: 'STEVE.pds.test',
    })
    expect(s.phase).toEqual({name: 'selecting', handle: 'steve.pds.test'})
    expect(
      pickerReducer(s, {type: 'selected', primary: 'steve.pds.test'}).phase,
    ).toEqual({
      name: 'done',
      primary: 'steve.pds.test',
    })
  })

  it('refusals go back to the choices with the error; busy phases ignore new taps', () => {
    const creating = pickerReducer(choosing, {type: 'create', name: 'Ron'})
    expect(
      pickerReducer(creating, {type: 'select', handle: 'bob.pds.test'}),
    ).toBe(creating)
    const err = new AOSignatureError('refused', 402, '')
    const back = pickerReducer(creating, {type: 'create-failed', error: err})
    expect(back.phase).toEqual({name: 'choosing'})
    expect(back.note).toBe(err)
    expect(
      pickerReducer(initialPickerState, {type: 'load-failed', error: err}).phase
        .name,
    ).toBe('failed')
    expect(
      pickerReducer(
        {...back, phase: {name: 'failed', error: err}},
        {type: 'retry'},
      ).phase,
    ).toEqual({
      name: 'loading',
    })
  })

  it('effects call the right route for the phase', async () => {
    const calls: string[] = []
    const client = {
      listAgents: () => {
        calls.push('list')
        return Promise.resolve({agents, primary: null, needsAgent: true})
      },
      createAgent: (_t: string, i: {handle: string; name: string}) => {
        calls.push(`create:${i.handle}:${i.name}`)
        return Promise.resolve({handle: `${i.handle}.pds.test`, primary: null})
      },
      choosePrimary: (_t: string, h: string) => {
        calls.push(`choose:${h}`)
        return Promise.reject(
          new AOSignatureError('refused', 403, 'not-your-agent'),
        )
      },
    } as unknown as AOClient
    expect(
      await pickerEffect(initialPickerState.phase, client, 'aos1.t.x'),
    ).toMatchObject({type: 'loaded'})
    const creating = pickerReducer(choosing, {type: 'create', name: 'Ron'})
    expect(await pickerEffect(creating.phase, client, 'aos1.t.x')).toEqual({
      type: 'created',
      primary: null,
    })
    const selecting = pickerReducer(choosing, {
      type: 'select',
      handle: 'bob.pds.test',
    })
    expect(
      await pickerEffect(selecting.phase, client, 'aos1.t.x'),
    ).toMatchObject({
      type: 'select-failed',
    })
    expect(await pickerEffect(choosing.phase, client, 'aos1.t.x')).toBeNull()
    expect(calls).toEqual(['list', 'create:ron:Ron', 'choose:bob.pds.test'])
  })

  it('a late load answer never overrides a later phase', () => {
    const creating = pickerReducer(choosing, {type: 'create', name: 'Ron'})
    expect(
      pickerReducer(creating, {
        type: 'loaded',
        list: {agents, primary: 'bob.pds.test', needsAgent: false},
      }),
    ).toBe(creating)
    expect(
      pickerReducer(creating, {type: 'load-failed', error: new Error('x')}),
    ).toBe(creating)
  })

  it('helpers', () => {
    expect(handleLabel('Ron Pickles')).toBe('ron-pickles')
    expect(handleLabel('  ')).toBe('')
    expect(isNotProvisioned(403, 'not-provisioned')).toBe(true)
    expect(isNotProvisioned(403, 'not-your-agent')).toBe(false)
  })
})
