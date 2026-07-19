import {afterEach, beforeEach, describe, expect, it, jest} from '@jest/globals'

import {createMockStoryClient, STORY_AGENT_ID} from '../mockStoryClient'
import {
  type GameCallbacks,
  type GameChatMsg,
  type GameClient,
  type SceneFrame,
} from '../types'

function harness() {
  const scenes: SceneFrame[] = []
  const chats: GameChatMsg[] = []
  const callbacks: GameCallbacks = {
    onState: () => {},
    onChat: m => chats.push(m),
    onPlayers: () => {},
    onGameover: () => {},
    onScene: s => scenes.push(s),
  }
  return {callbacks, scenes, chats}
}

describe('createMockStoryClient', () => {
  let client: GameClient | null = null

  beforeEach(() => {
    jest.useFakeTimers()
  })
  afterEach(() => {
    client?.disconnect()
    client = null
    jest.useRealTimers()
  })

  function connect(h = harness()) {
    client = createMockStoryClient({
      matchID: 's1',
      playerID: '0',
      name: 'Elliott',
      callbacks: h.callbacks,
    })
    client.connect()
    return h
  }

  it('opens with a scene that has an image, title, text, and choices', () => {
    const h = connect()
    jest.runAllTimers()
    expect(h.scenes).toHaveLength(1)
    const scene = h.scenes[0]
    expect(scene.image).toMatch(/^https:/)
    expect(scene.title).toBeTruthy()
    expect(scene.text).toBeTruthy()
    expect(scene.choices!.length).toBeGreaterThan(0)
    // The narrator opens in the chat lane.
    expect(h.chats.some(c => c.from === STORY_AGENT_ID)).toBe(true)
  })

  it('advances to a new scene on a valid choice and ignores unknown ids', () => {
    const h = connect()
    jest.runAllTimers()
    client!.sendChoice('nonsense')
    jest.runAllTimers()
    expect(h.scenes).toHaveLength(1)
    client!.sendChoice(h.scenes[0].choices![0].id)
    jest.runAllTimers()
    expect(h.scenes).toHaveLength(2)
    expect(h.scenes[1].title).not.toBe(h.scenes[0].title)
  })

  it('echoes chat and answers in character', () => {
    const h = connect()
    jest.runAllTimers()
    client!.sendChat('I suspect the chef')
    jest.runAllTimers()
    expect(h.chats.some(c => c.from === '0')).toBe(true)
    const narratorLines = h.chats.filter(c => c.from === STORY_AGENT_ID)
    expect(narratorLines.length).toBeGreaterThan(1)
  })
})
