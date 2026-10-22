import {getCurrentState, onAppStateChange} from '#/lib/appState'
import {logger} from '#/logger'

/**
 * Run `fn` once, but only while the app is in the FOREGROUND ('active'). If JS was
 * launched in the background (e.g. iOS relaunching the app to deliver a location
 * update), nothing runs until the user actually opens the app. Returns a cleanup that
 * cancels a pending run.
 */
export function runOnceWhenForeground(fn: () => unknown): () => void {
  const run = () => {
    try {
      void Promise.resolve(fn()).catch(e =>
        logger.warn('runOnceWhenForeground: fn failed', {
          safeMessage: String(e),
        }),
      )
    } catch (e) {
      logger.warn('runOnceWhenForeground: fn threw', {safeMessage: String(e)})
    }
  }
  if (getCurrentState() === 'active') {
    run()
    return () => {}
  }
  let done = false
  const sub = onAppStateChange(next => {
    if (done || next !== 'active') return
    done = true
    sub.remove()
    run()
  })
  return () => {
    if (done) return
    done = true
    sub.remove()
  }
}
