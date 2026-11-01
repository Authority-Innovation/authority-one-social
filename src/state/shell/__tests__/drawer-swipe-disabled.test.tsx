import {act, render} from '@testing-library/react-native'

import {
  Provider,
  useIsDrawerSwipeDisabled,
  useLockDrawerSwipe,
  useSetDrawerSwipeDisabled,
} from '../drawer-swipe-disabled'

function setup() {
  const api: {
    disabled?: boolean
    set?: (v: boolean) => void
    lock?: () => () => void
  } = {}
  function Probe() {
    api.disabled = useIsDrawerSwipeDisabled()
    api.set = useSetDrawerSwipeDisabled()
    api.lock = useLockDrawerSwipe()
    return null
  }
  render(
    <Provider>
      <Probe />
    </Provider>,
  )
  return api
}

describe('drawer swipe lock (review d8f8f16e H3)', () => {
  it('a lock holds when another screen resets the flag (Pager’s blur cleanup)', () => {
    const api = setup()
    let release!: () => void
    act(() => {
      release = api.lock!()
    })
    act(() => api.set!(false))
    expect(api.disabled).toBe(true)
    act(() => release())
    expect(api.disabled).toBe(false)
  })

  it('locks are counted, and a release runs once', () => {
    const api = setup()
    let a!: () => void
    let b!: () => void
    act(() => {
      a = api.lock!()
      b = api.lock!()
    })
    act(() => {
      a()
      a()
    })
    expect(api.disabled).toBe(true)
    act(() => b())
    expect(api.disabled).toBe(false)
  })

  it('the plain flag still works on its own', () => {
    const api = setup()
    act(() => api.set!(true))
    expect(api.disabled).toBe(true)
    act(() => api.set!(false))
    expect(api.disabled).toBe(false)
  })
})
