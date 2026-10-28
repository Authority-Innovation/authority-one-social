import {StrictMode} from 'react'
import {describe, expect, it, jest} from '@jest/globals'
import {act, renderHook} from '@testing-library/react-native'

import {type AOClient} from '../client'
import {usePickerMachine} from '../components/usePickerMachine'

const list = {
  agents: [{handle: 'steve.pds.test', displayName: 'Steve', did: null}],
  primary: null,
  needsAgent: true,
}

type Props = {token: string; sid: string}

/** Rendered under a real <StrictMode> (double-invoked effects in dev). */
function renderMachine(client: AOClient, initialProps: Props) {
  return renderHook(
    ({token, sid}: Props) => usePickerMachine(token, sid, client),
    {initialProps, wrapper: StrictMode},
  )
}

function gate<T>() {
  let open!: (v: T) => void
  const promise = new Promise<T>(r => {
    open = r
  })
  return {promise, open}
}

describe('picker machine hook (StrictMode)', () => {
  it('StrictMode loads once; a token rotation while creating never re-POSTs', async () => {
    const created = gate<{handle: string; primary: string | null}>()
    const listAgents = jest.fn(() => Promise.resolve(list))
    const createAgent = jest.fn(() => created.promise)
    const client = {
      listAgents,
      createAgent,
      choosePrimary: jest.fn(),
    } as unknown as AOClient

    const {result, rerender} = renderMachine(client, {
      token: 'aos1.one.x',
      sid: 's1',
    })
    await act(async () => {})
    expect(listAgents).toHaveBeenCalledTimes(1)
    expect(result.current[0].phase.name).toBe('choosing')

    act(() => {
      result.current[1]({type: 'create', name: 'Ron'})
    })
    expect(createAgent).toHaveBeenCalledTimes(1)
    expect(createAgent.mock.calls[0]).toEqual([
      'aos1.one.x',
      {handle: 'ron', name: 'Ron'},
    ])

    rerender({token: 'aos1.two.x', sid: 's1'})
    rerender({token: 'aos1.three.x', sid: 's1'})
    expect(createAgent).toHaveBeenCalledTimes(1)

    await act(() => {
      created.open({handle: 'ron.pds.test', primary: 'ron.pds.test'})
      return Promise.resolve()
    })
    expect(result.current[0].phase).toEqual({
      name: 'done',
      primary: 'ron.pds.test',
    })
    expect(createAgent).toHaveBeenCalledTimes(1)
  })

  it('the next phase uses the CURRENT token', async () => {
    const choosePrimary = jest.fn(() => Promise.resolve('steve.pds.test'))
    const client = {
      listAgents: jest.fn(() => Promise.resolve(list)),
      createAgent: jest.fn(),
      choosePrimary,
    } as unknown as AOClient
    const {result, rerender} = renderMachine(client, {
      token: 'aos1.one.x',
      sid: 's1',
    })
    await act(async () => {})
    rerender({token: 'aos1.two.x', sid: 's1'})
    await act(() => {
      result.current[1]({type: 'select', handle: 'steve.pds.test'})
      return Promise.resolve()
    })
    expect(choosePrimary).toHaveBeenCalledTimes(1)
    expect(choosePrimary).toHaveBeenCalledWith('aos1.two.x', 'steve.pds.test')
  })

  it("an answer for session A that lands after a swap to B is dropped (A's primary never reaches B)", async () => {
    const chosen = gate<string>()
    const client = {
      listAgents: jest.fn(() => Promise.resolve(list)),
      createAgent: jest.fn(),
      choosePrimary: jest.fn(() => chosen.promise),
    } as unknown as AOClient
    const {result, rerender} = renderMachine(client, {
      token: 'aos1.a.x',
      sid: 'sid-a',
    })
    await act(async () => {})
    act(() => {
      result.current[1]({type: 'select', handle: 'steve.pds.test'})
    })
    rerender({token: 'aos1.b.x', sid: 'sid-b'})
    await act(() => {
      chosen.open('steve.pds.test')
      return Promise.resolve()
    })
    expect(result.current[0].phase.name).toBe('selecting')
  })
})
