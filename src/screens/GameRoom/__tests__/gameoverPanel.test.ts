import {gameoverPanelMode} from '../gameoverPanel'

const base = {
  live: true,
  storyMode: false,
  hasState: true,
  gameover: true,
  seated: true,
}

describe('gameoverPanelMode', () => {
  it('offers the Play again rematch to a seated player of a finished live match', () => {
    expect(gameoverPanelMode(base)).toBe('rematch')
  })

  it('offers the rematch to guests too — their token survives a reset-in-place', () => {
    // Guests hold seats like anyone else; only seatedness matters.
    expect(gameoverPanelMode({...base, seated: true})).toBe('rematch')
  })

  it('shows nothing to spectators — a watcher must not wipe the players’ board', () => {
    expect(gameoverPanelMode({...base, seated: false})).toBe('none')
  })

  it('shows nothing while the match is still running', () => {
    expect(gameoverPanelMode({...base, gameover: false})).toBe('none')
  })

  it('shows nothing before the first authoritative state frame', () => {
    expect(gameoverPanelMode({...base, hasState: false})).toBe('none')
  })

  it('shows nothing in mock rooms — those have a real local reset already', () => {
    expect(gameoverPanelMode({...base, live: false})).toBe('none')
  })

  it('shows nothing in story mode — the scene pane owns its endgame flow', () => {
    expect(gameoverPanelMode({...base, storyMode: true})).toBe('none')
  })
})
