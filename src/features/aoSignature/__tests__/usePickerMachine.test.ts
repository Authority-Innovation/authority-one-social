import {describe, expect, it, jest} from '@jest/globals'
import {act, renderHook} from '@testing-library/react-native'

import {type AOClient} from '../client'
import {usePickerMachine} from '../components/usePickerMachine'

const list = {
  agents: [{handle: 'steve.pds.test', displayName: 'Steve', did: null}],
  primary: null,
  needsAgent: true,
}

describe('picker machine hook', () => {
  it('a token rotation while creating never re-POSTs /app/agents', async () => {
    let finishCreate!: (v: {handle: string; primary: string | null}) => void
    const createAgent = jest.fn(
      () =>
        new Promise<{handle: string; primary: string | null}>(r => {
          finishCreate = r
        }),
    )
    const client = {
      listAgents: jest.fn(() => Promise.resolve(list)),
      createAgent,
      choosePrimary: jest.fn(),
    } as unknown as AOClient

    const {result, rerender} = renderHook(
      ({token}: {token: string}) => usePickerMachine(token, client),
      {initialProps: {token: 'aos1.one.x'}},
    )
    await act(async () => {})
    expect(result.current[0].phase.name).toBe('choosing')

    act(() => {
      result.current[1]({type: 'create', name: 'Ron'})
    })
    expect(createAgent).toHaveBeenCalledTimes(1)
    expect(createAgent.mock.calls[0]).toEqual([
      'aos1.one.x',
      {handle: 'ron', name: 'Ron'},
    ])

    // The session slides (refresh) while the POST is in flight.
    rerender({token: 'aos1.two.x'})
    rerender({token: 'aos1.three.x'})
    expect(createAgent).toHaveBeenCalledTimes(1)

    await act(() => {
      finishCreate({handle: 'ron.pds.test', primary: 'ron.pds.test'})
      return Promise.resolve()
    })
    expect(result.current[0].phase).toEqual({
      name: 'done',
      primary: 'ron.pds.test',
    })
    expect(createAgent).toHaveBeenCalledTimes(1)
  })

  it('the next phase uses the CURRENT token', async () => {
    const listAgents = jest.fn(() => Promise.resolve(list))
    const choosePrimary = jest.fn(() => Promise.resolve('steve.pds.test'))
    const client = {
      listAgents,
      createAgent: jest.fn(),
      choosePrimary,
    } as unknown as AOClient
    const {result, rerender} = renderHook(
      ({token}: {token: string}) => usePickerMachine(token, client),
      {initialProps: {token: 'aos1.one.x'}},
    )
    await act(async () => {})
    rerender({token: 'aos1.two.x'})
    await act(() => {
      result.current[1]({type: 'select', handle: 'steve.pds.test'})
      return Promise.resolve()
    })
    expect(choosePrimary).toHaveBeenCalledWith('aos1.two.x', 'steve.pds.test')
    expect(listAgents).toHaveBeenCalledTimes(1)
  })
})
