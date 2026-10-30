/**
 * Agent Live build gate (task 69138168, ruling 1).
 *
 * The LiveKit React Native SDK and its WebRTC dependency ship ONLY in a build
 * with EXPO_PUBLIC_AGENT_LIVE_ENABLED=true (the `development-live` EAS
 * profile). In every other build:
 *   - the LiveKit and WebRTC config plugins are not applied (no extra
 *     permissions, no LiveKit pod sources);
 *   - the three native packages are not autolinked (react-native.config.js for
 *     the two React Native modules, and `exclude` on use_expo_modules! and
 *     expoAutolinking for the Expo module), so their native code is not in the
 *     binary;
 *   - Metro resolves every LiveKit import to an empty module, so no SDK code
 *     is in the JS bundle either.
 *
 * Shared by app.config.js, react-native.config.js and metro.config.js so the
 * three can't disagree about what "off" means.
 */
const {withPodfile, withSettingsGradle} = require('expo/config-plugins')

const AGENT_LIVE_FLAG = 'EXPO_PUBLIC_AGENT_LIVE_ENABLED'

/** The packages that carry native code. */
const LIVE_NATIVE_PACKAGES = [
  '@livekit/react-native',
  '@livekit/react-native-webrtc',
  '@livekit/react-native-expo-plugin',
]

/** Every import Metro must stub out when the flag is off. */
const LIVE_JS_MODULE_RE =
  /^(@livekit\/(react-native|react-native-webrtc|components-react|components-core)|livekit-client)(\/|$)/

function isAgentLiveEnabled(env = process.env) {
  return env[AGENT_LIVE_FLAG] === 'true'
}

function excludeList() {
  return LIVE_NATIVE_PACKAGES.map(p => `'${p}'`).join(', ')
}

/** Adds the exclude to a bare `use_expo_modules!`. Throws without one. */
function addPodfileExclude(src) {
  if (src.includes('use_expo_modules!(exclude:')) return src
  if (!/^[ \t]*use_expo_modules![ \t]*$/m.test(src)) {
    throw new Error(
      'agentLive: Podfile has no bare `use_expo_modules!` line to add the LiveKit exclude to',
    )
  }
  return src.replace(
    /^([ \t]*)use_expo_modules![ \t]*$/m,
    `$1use_expo_modules!(exclude: [${excludeList()}])`,
  )
}

/** Sets expoAutolinking.exclude before useExpoModules(). Throws without it. */
function addSettingsGradleExclude(src) {
  if (src.includes('expoAutolinking.exclude')) return src
  if (!src.includes('expoAutolinking.useExpoModules()')) {
    throw new Error(
      'agentLive: settings.gradle has no `expoAutolinking.useExpoModules()` to add the LiveKit exclude before',
    )
  }
  return src.replace(
    'expoAutolinking.useExpoModules()',
    `expoAutolinking.exclude = [${excludeList()}]\nexpoAutolinking.useExpoModules()`,
  )
}

/**
 * Off-build only. Adds the LiveKit packages to the Expo autolinking exclude
 * list on both platforms. A missing template anchor throws, so a template
 * change fails the build instead of silently linking the SDK.
 */
function withAgentLiveExcluded(config) {
  config = withPodfile(config, cfg => {
    cfg.modResults.contents = addPodfileExclude(cfg.modResults.contents)
    return cfg
  })
  config = withSettingsGradle(config, cfg => {
    cfg.modResults.contents = addSettingsGradleExclude(cfg.modResults.contents)
    return cfg
  })
  return config
}

/** The app.config.js plugin entries for this build. */
function agentLivePlugins(env = process.env) {
  if (!isAgentLiveEnabled(env)) return [withAgentLiveExcluded]
  return [
    '@livekit/react-native-expo-plugin',
    // Permission strings come from ios.infoPlist in app.config.js (the plugin
    // keeps existing ones); Android gets CAMERA, RECORD_AUDIO and the rest.
    '@config-plugins/react-native-webrtc',
  ]
}

/** react-native.config.js `dependencies` overrides for this build. */
function agentLiveRNDependencies(env = process.env) {
  if (isAgentLiveEnabled(env)) return {}
  return Object.fromEntries(
    LIVE_NATIVE_PACKAGES.map(p => [p, {platforms: {ios: null, android: null}}]),
  )
}

module.exports = {
  AGENT_LIVE_FLAG,
  LIVE_NATIVE_PACKAGES,
  LIVE_JS_MODULE_RE,
  isAgentLiveEnabled,
  agentLivePlugins,
  agentLiveRNDependencies,
  withAgentLiveExcluded,
  addPodfileExclude,
  addSettingsGradleExclude,
}
