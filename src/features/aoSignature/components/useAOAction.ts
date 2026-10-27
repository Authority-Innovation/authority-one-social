import {useCallback, useState} from 'react'
import {type MessageDescriptor} from '@lingui/core'

import {aoSignatureErrorWords} from '../errors'

/** Run one Signature action at a time, with honest words on failure. */
export function useAOAction(
  words: (e: unknown) => MessageDescriptor = aoSignatureErrorWords,
) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<MessageDescriptor | null>(null)
  const run = useCallback(
    async (fn: () => Promise<void>) => {
      if (busy) return
      setBusy(true)
      setError(null)
      try {
        await fn()
      } catch (e) {
        setError(words(e))
      } finally {
        setBusy(false)
      }
    },
    [busy, words],
  )
  return {run, busy, error, setError}
}
