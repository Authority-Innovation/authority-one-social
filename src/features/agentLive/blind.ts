/**
 * The owner-only blind message (ruling 2; design r2 §12.9.8, addendum
 * a760fdb1):
 *
 *   {"t":"blind","on":true|false,"src":"*"|"<sourceId>"}
 *
 * Only the owner's app sends it, from the blind control on the session
 * screen. The agent worker honours it and the stage drops it from any other
 * sender (piece 5's job, not this app's). The message carries no identity:
 * the owner is the LiveKit sender, whose token the runtime minted from the
 * owner's bearer.
 *
 * Topic: `stage.reply`, the owner's stage topic in the §1.3 grants table.
 * The addendum did not name a topic (its report says so), and `stage` itself
 * is dropped from anyone but the agent, so `stage.reply` is the only stage
 * topic the owner can send on. Recorded as an assumption in the task report.
 */
export const BLIND_TOPIC = 'stage.reply'

/** Every source the agent can see. */
export const ALL_SOURCES = '*'

export type BlindMessage = {t: 'blind'; on: boolean; src: string}

// A source id as the edge routes name one (/sources/:name): no spaces, no
// wildcard of its own.
const SOURCE_ID_RE = /^[A-Za-z0-9._:-]{1,128}$/

/** The message, or null for a source id that isn't one. */
export function blindMessage(
  on: boolean,
  src: string = ALL_SOURCES,
): BlindMessage | null {
  if (typeof on !== 'boolean') return null
  if (src !== ALL_SOURCES && !SOURCE_ID_RE.test(src)) return null
  // Key order is fixed (t, on, src) so the bytes match the contract text.
  return {t: 'blind', on, src}
}

export function encodeBlindMessage(
  msg: BlindMessage,
): Uint8Array<ArrayBuffer> {
  return new TextEncoder().encode(
    JSON.stringify({t: msg.t, on: msg.on, src: msg.src}),
  )
}
