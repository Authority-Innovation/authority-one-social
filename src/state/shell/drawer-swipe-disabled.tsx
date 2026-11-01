import {createContext, useCallback, useContext, useState} from 'react'

type StateContext = boolean
type SetContext = (v: boolean) => void
/** Takes a lock; the returned function releases it. */
type LockContext = () => () => void

const stateContext = createContext<StateContext>(false)
stateContext.displayName = 'DrawerSwipeDisabledStateContext'
const setContext = createContext<SetContext>((_: boolean) => {})
setContext.displayName = 'DrawerSwipeDisabledSetContext'
const lockContext = createContext<LockContext>(() => () => {})
lockContext.displayName = 'DrawerSwipeLockContext'

export function Provider({children}: React.PropsWithChildren<{}>) {
  const [state, setState] = useState(false)
  // Counted locks, beside the plain flag: a screen that must keep the drawer
  // swipe off (Agent Live) can't be undone by another screen's cleanup that
  // resets the flag (Pager's, on blur).
  const [locks, setLocks] = useState(0)
  const lock = useCallback(() => {
    setLocks(n => n + 1)
    let released = false
    return () => {
      if (released) return
      released = true
      setLocks(n => Math.max(0, n - 1))
    }
  }, [])
  return (
    <stateContext.Provider value={state || locks > 0}>
      <setContext.Provider value={setState}>
        <lockContext.Provider value={lock}>{children}</lockContext.Provider>
      </setContext.Provider>
    </stateContext.Provider>
  )
}

export function useIsDrawerSwipeDisabled() {
  return useContext(stateContext)
}

export function useSetDrawerSwipeDisabled() {
  return useContext(setContext)
}

/** Keep the drawer swipe off until the returned release runs. */
export function useLockDrawerSwipe() {
  return useContext(lockContext)
}
