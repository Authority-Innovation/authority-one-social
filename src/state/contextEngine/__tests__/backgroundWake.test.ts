import {beforeEach, describe, expect, it, jest} from '@jest/globals'

import type * as BgModule from '../backgroundLocation.native'
import type * as FgModule from '../whenForeground'

// Build 34 (TestFlight 33 background crash): a background wake must make NO
// expo-location calls while background location is not shipped; the launch stop runs
// only in the foreground, once, only if updates are registered, and swallows errors.

type TaskExecutor = (body: {
  data: unknown
  error: {message: string} | null
  executionInfo: {eventId: string; taskName: string}
}) => Promise<unknown>

const mockTasks = new Map<string, TaskExecutor>()
const mockLocation = {
  hasStartedLocationUpdatesAsync: jest.fn<(name: string) => Promise<boolean>>(),
  stopLocationUpdatesAsync: jest.fn<(name: string) => Promise<void>>(),
  startLocationUpdatesAsync: jest.fn(),
  reverseGeocodeAsync: jest.fn(),
  getBackgroundPermissionsAsync: jest.fn(),
  requestForegroundPermissionsAsync: jest.fn(),
  requestBackgroundPermissionsAsync: jest.fn(),
  Accuracy: {Balanced: 3},
  ActivityType: {Other: 1},
}
const mockStore = {
  appendEvent: jest.fn(),
  clearOpenDwell: jest.fn(),
  loadOpenDwell: jest.fn(),
  loadPrefs: jest.fn(),
  saveOpenDwell: jest.fn(),
}
const mockRuntime = {fetchNearbyPoi: jest.fn(), postContextEvents: jest.fn()}
const mockAppState = {
  state: 'background' as string,
  listeners: [] as Array<(s: string) => void>,
}

jest.mock('expo-location', () => mockLocation)
jest.mock('expo-task-manager', () => ({
  defineTask: (name: string, fn: TaskExecutor) => mockTasks.set(name, fn),
}))
jest.mock('../store', () => mockStore)
jest.mock('#/lib/agent-runtime', () => mockRuntime)
jest.mock('#/logger', () => ({
  logger: {warn: jest.fn(), error: jest.fn(), info: jest.fn()},
}))
jest.mock('#/lib/appState', () => ({
  getCurrentState: () => mockAppState.state,
  onAppStateChange: (cb: (s: string) => void) => {
    mockAppState.listeners.push(cb)
    return {
      remove: () => {
        mockAppState.listeners = mockAppState.listeners.filter(l => l !== cb)
      },
    }
  },
}))

function setAppState(next: string) {
  mockAppState.state = next
  for (const l of [...mockAppState.listeners]) l(next)
}

function load() {
  let mod!: typeof BgModule
  let fg!: typeof FgModule
  jest.isolateModules(() => {
    mod = require('../backgroundLocation.native')
    fg = require('../whenForeground')
  })
  return {mod, fg}
}

const flush = () => new Promise(r => setTimeout(r, 0))

beforeEach(() => {
  jest.clearAllMocks()
  mockTasks.clear()
  mockAppState.state = 'background'
  mockAppState.listeners = []
  mockLocation.hasStartedLocationUpdatesAsync.mockResolvedValue(true)
  mockLocation.stopLocationUpdatesAsync.mockResolvedValue(undefined)
})

describe('background task callback (not shipped)', () => {
  it('stays defined so a natively restored task has a handler', () => {
    const {mod} = load()
    expect(mockTasks.has(mod.BACKGROUND_LOCATION_TASK)).toBe(true)
  })

  it.each([
    [
      'a location batch',
      {locations: [{coords: {latitude: 1, longitude: 2}}]},
      null,
    ],
    ['an empty batch', {locations: []}, null],
    ['an error', undefined, {message: 'kCLErrorDomain 0'}],
  ])(
    'on %s makes NO expo-location, storage or network calls',
    async (_l, data, error) => {
      const {mod} = load()
      const task = mockTasks.get(mod.BACKGROUND_LOCATION_TASK)!
      const result = await task({
        data,
        error,
        executionInfo: {eventId: '1', taskName: mod.BACKGROUND_LOCATION_TASK},
      })
      expect(result).toBeUndefined()
      for (const fn of Object.values(mockLocation)) {
        if (typeof fn === 'function') expect(fn).not.toHaveBeenCalled()
      }
      for (const fn of [
        ...Object.values(mockStore),
        ...Object.values(mockRuntime),
      ]) {
        expect(fn).not.toHaveBeenCalled()
      }
    },
  )
})

describe('stopRestoredBackgroundUpdatesOnce (foreground launch migration)', () => {
  it('stops only when updates are registered', async () => {
    mockLocation.hasStartedLocationUpdatesAsync.mockResolvedValue(false)
    const {mod} = load()
    await mod.stopRestoredBackgroundUpdatesOnce()
    expect(mockLocation.hasStartedLocationUpdatesAsync).toHaveBeenCalledTimes(1)
    expect(mockLocation.stopLocationUpdatesAsync).not.toHaveBeenCalled()
  })

  it('stops registered updates exactly once per launch', async () => {
    const {mod} = load()
    await Promise.all([
      mod.stopRestoredBackgroundUpdatesOnce(),
      mod.stopRestoredBackgroundUpdatesOnce(),
    ])
    await mod.stopRestoredBackgroundUpdatesOnce()
    expect(mockLocation.stopLocationUpdatesAsync).toHaveBeenCalledTimes(1)
    expect(mockLocation.stopLocationUpdatesAsync).toHaveBeenCalledWith(
      mod.BACKGROUND_LOCATION_TASK,
    )
  })

  it('swallows errors from hasStarted and from stop', async () => {
    mockLocation.hasStartedLocationUpdatesAsync.mockRejectedValue(
      new Error('x'),
    )
    await expect(
      load().mod.stopRestoredBackgroundUpdatesOnce(),
    ).resolves.toBeUndefined()
    mockLocation.hasStartedLocationUpdatesAsync.mockResolvedValue(true)
    mockLocation.stopLocationUpdatesAsync.mockRejectedValue(
      new Error('E_TASK_NOT_FOUND'),
    )
    await expect(
      load().mod.stopRestoredBackgroundUpdatesOnce(),
    ).resolves.toBeUndefined()
  })
})

describe('runOnceWhenForeground (AppState gate)', () => {
  it('runs immediately when already active', async () => {
    mockAppState.state = 'active'
    const {mod, fg} = load()
    fg.runOnceWhenForeground(mod.stopRestoredBackgroundUpdatesOnce)
    await flush()
    expect(mockLocation.stopLocationUpdatesAsync).toHaveBeenCalledTimes(1)
  })

  it('does NOT stop during a background launch; stops once the user opens the app', async () => {
    const {mod, fg} = load()
    fg.runOnceWhenForeground(mod.stopRestoredBackgroundUpdatesOnce)
    setAppState('inactive')
    setAppState('background')
    await flush()
    expect(mockLocation.hasStartedLocationUpdatesAsync).not.toHaveBeenCalled()
    expect(mockLocation.stopLocationUpdatesAsync).not.toHaveBeenCalled()
    setAppState('active')
    setAppState('background')
    setAppState('active')
    await flush()
    expect(mockLocation.stopLocationUpdatesAsync).toHaveBeenCalledTimes(1)
    expect(mockAppState.listeners).toHaveLength(0)
  })

  it('cleanup cancels a pending run', async () => {
    const {mod, fg} = load()
    const cancel = fg.runOnceWhenForeground(
      mod.stopRestoredBackgroundUpdatesOnce,
    )
    cancel()
    setAppState('active')
    await flush()
    expect(mockLocation.stopLocationUpdatesAsync).not.toHaveBeenCalled()
  })
})
