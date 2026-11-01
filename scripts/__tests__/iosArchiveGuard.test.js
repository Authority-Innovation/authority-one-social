// @ts-check
/**
 * scripts/ios-archive-guard.sh `pre`: the Agent Live check. An archive with
 * the flag off must not ship an ios/ prebuilt with it on (the 'audio'
 * background mode, LiveKit pods, no autolinking exclude), and an archive with
 * the flag on needs AO_ARCHIVE_ALLOW_AGENT_LIVE=1.
 */
const {spawnSync} = require('node:child_process')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const SCRIPT = path.join(__dirname, '..', 'ios-archive-guard.sh')
const ENV = 'EXPO_PUBLIC_DISABLE_AGE_ASSURANCE=1\nEXPO_PUBLIC_ENV=testflight\n'
const EXCLUDE =
  "  use_expo_modules!(exclude: ['@livekit/react-native', '@livekit/react-native-webrtc', '@livekit/react-native-expo-plugin'])\n"

/** @param {string[]} modes */
function plist(modes) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<plist version="1.0">
<dict>
  <key>UIBackgroundModes</key>
  <array>
${modes.map(m => `    <string>${m}</string>`).join('\n')}
  </array>
  <key>NSMicrophoneUsageDescription</key>
  <string>audio</string>
</dict>
</plist>
`
}

/**
 * @param {{env?: string, modes?: string[] | null, podfile?: string | null, lock?: string | null}} o
 */
function project({
  env = ENV,
  modes = ['remote-notification', 'location', 'fetch'],
  podfile = `target 'One' do\n${EXCLUDE}end\n`,
  lock = 'PODS:\n  - ExpoModulesCore (3.0.0)\n',
} = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ao-archive-guard-'))
  fs.writeFileSync(path.join(dir, '.env'), env)
  if (modes !== null || podfile !== null) {
    fs.mkdirSync(path.join(dir, 'ios', 'One'), {recursive: true})
    if (modes)
      fs.writeFileSync(path.join(dir, 'ios', 'One', 'Info.plist'), plist(modes))
    if (podfile) fs.writeFileSync(path.join(dir, 'ios', 'Podfile'), podfile)
    if (lock) fs.writeFileSync(path.join(dir, 'ios', 'Podfile.lock'), lock)
  }
  return dir
}

/** @param {string} dir @param {Record<string, string>} [extra] */
function pre(dir, extra = {}) {
  const env = {...process.env, ...extra}
  delete env.EXPO_PUBLIC_AGENT_LIVE_ENABLED
  delete env.AO_ARCHIVE_ALLOW_AGENT_LIVE
  Object.assign(env, extra)
  const r = spawnSync('bash', [SCRIPT, 'pre', dir], {env, encoding: 'utf8'})
  return {code: r.status, out: `${r.stdout}${r.stderr}`}
}

describe('ios-archive-guard pre: Agent Live', () => {
  it('passes a flag-off archive whose ios/ is flag-off', () => {
    const r = pre(project())
    expect(r.out).toContain('pre OK')
    expect(r.code).toBe(0)
  })

  it('passes when there is no ios/ yet', () => {
    expect(pre(project({modes: null, podfile: null})).code).toBe(0)
  })

  it('refuses a flag-off archive with the audio background mode', () => {
    const r = pre(
      project({modes: ['remote-notification', 'location', 'audio']}),
    )
    expect(r.code).toBe(1)
    expect(r.out).toMatch(/'audio' background mode/)
  })

  it('the word audio elsewhere in Info.plist is not the background mode', () => {
    expect(pre(project()).code).toBe(0)
  })

  it('refuses a Podfile without the LiveKit exclude', () => {
    const r = pre(
      project({podfile: "target 'One' do\n  use_expo_modules!\nend\n"}),
    )
    expect(r.code).toBe(1)
    expect(r.out).toMatch(/no LiveKit autolinking exclude/)
  })

  it('refuses a Podfile.lock that links LiveKit', () => {
    const r = pre(project({lock: 'PODS:\n  - LiveKitWebRTC (137.0.0)\n'}))
    expect(r.code).toBe(1)
    expect(r.out).toMatch(/Podfile.lock links LiveKit/)
  })

  it('refuses a flag-on archive unless it is meant to be a Live build', () => {
    const on = project({env: `${ENV}EXPO_PUBLIC_AGENT_LIVE_ENABLED=true\n`})
    expect(pre(on).code).toBe(1)
    expect(pre(on, {AO_ARCHIVE_ALLOW_AGENT_LIVE: '1'}).code).toBe(0)
    // The environment wins over .env, as it does for prebuild and Metro.
    expect(pre(project(), {EXPO_PUBLIC_AGENT_LIVE_ENABLED: 'true'}).code).toBe(
      1,
    )
  })

  it('never prints a value from .env', () => {
    const dir = project({
      env: `${ENV}EXPO_PUBLIC_AGENT_LIVE_ENABLED=true\nSECRET_X=hunter2\n`,
    })
    expect(pre(dir).out).not.toContain('hunter2')
  })
})
