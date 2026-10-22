import {getCurrentState, onAppStateChange} from '#/lib/appState'

/**
 * Run `fn` once, but only while the app is in the FOREGROUND ('active'). If JS was
 * launched in the background (e.g. iOS relaunching the app to deliver a location
 * update), nothing runs until the user actually opens the app. Returns a cleanup that
 * cancels a pending run.
 */
export function runOnceWhenForeground(fn: () => unknown): () => void {
  if (getCurrentState() === 'active') {
    void fn()
    return () => {}
  }
  let done = false
  const sub = onAppStateChange(next => {
    if (done || next !== 'active') return
    done = true
    sub.remove()
    void fn()
  })
  return () => {
    if (done) return
    done = true
    sub.remove()
  }
}
