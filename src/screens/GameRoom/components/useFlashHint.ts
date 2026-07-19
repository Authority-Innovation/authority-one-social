import {useEffect, useRef, useState} from 'react'

/** How long a tap hint stays on screen. */
const FLASH_HINT_MS = 2400

/**
 * A transient one-line hint for the game boards: the answer to "why did my
 * tap do nothing?". A tap that cannot act must always say something — silence
 * reads as a frozen board (the exact live-game bug this exists for). The
 * latest flash replaces any current one; unmount clears the timer.
 */
export function useFlashHint(): {
  hint: string | null
  flashHint: (text: string) => void
} {
  const [hint, setHint] = useState<string | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current)
    }
  }, [])

  const flashHint = (text: string) => {
    setHint(text)
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => setHint(null), FLASH_HINT_MS)
  }

  return {hint, flashHint}
}
