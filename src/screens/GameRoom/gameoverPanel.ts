/**
 * What the game-over panel under a LIVE board offers. The server supports a
 * REAL in-place rematch ({t:'rematch'} — same matchID, same guest token,
 * fresh state frame, first mover alternates), so the panel's job is one
 * obvious "Play again" button:
 *
 *   'rematch' — the viewer holds a seat in a finished live board match;
 *               show the prominent Play again button (guests included —
 *               their match-scoped token survives a reset-in-place)
 *   'none'    — nothing to show: match still running, no authoritative
 *               state yet, spectating (a watcher shouldn't wipe the
 *               players' finished board), a mock room (those have a real
 *               local reset via the boards' own New game button), or story
 *               mode (the scene pane owns its endgame flow)
 */
export function gameoverPanelMode({
  live,
  storyMode,
  hasState,
  gameover,
  seated,
}: {
  live: boolean
  storyMode: boolean
  hasState: boolean
  gameover: boolean
  seated: boolean
}): 'none' | 'rematch' {
  if (!live || storyMode || !hasState || !gameover || !seated) return 'none'
  return 'rematch'
}
