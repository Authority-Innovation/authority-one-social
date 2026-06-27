/**
 * Pure pager/recycling logic for the vertical snap feed — separated from the React
 * component so the windowing + autoplay rules are unit-testable without rendering.
 */

export interface PreloadWindowArgs {
  /** Index of the currently focused (on-screen) item. */
  focusIndex: number
  /** Total number of items. */
  total: number
  /** How many items to keep mounted ahead of focus (preload next 1-2). */
  ahead?: number
  /** How many items to keep mounted behind focus. */
  behind?: number
}

/** Clamp an index into [0, total). Returns 0 for an empty list. */
export function clampIndex(index: number, total: number): number {
  if (total <= 0) return 0
  if (index < 0) return 0
  if (index > total - 1) return total - 1
  return index
}

/**
 * The set of indices that should be mounted/preloaded around the focused item.
 * Everything outside this window is recycled (unmounted) so memory stays bounded.
 * Default preloads the next 2 and the previous 1.
 */
export function preloadWindow({
  focusIndex,
  total,
  ahead = 2,
  behind = 1,
}: PreloadWindowArgs): number[] {
  if (total <= 0) return []
  const focus = clampIndex(focusIndex, total)
  const start = Math.max(0, focus - behind)
  const end = Math.min(total - 1, focus + ahead)
  const out: number[] = []
  for (let i = start; i <= end; i++) out.push(i)
  return out
}

/** Only the focused item autoplays; everything else pauses/mutes. */
export function shouldAutoplay(index: number, focusIndex: number): boolean {
  return index === focusIndex
}

/** True when `index` is within the mounted preload window. */
export function isWithinWindow(index: number, args: PreloadWindowArgs): boolean {
  return preloadWindow(args).includes(index)
}
