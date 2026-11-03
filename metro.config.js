// Learn more https://docs.expo.io/guides/customizing-metro
const {getSentryExpoConfig} = require('@sentry/react-native/metro')
const {isAgentLiveEnabled, LIVE_JS_MODULE_RE} = require('./plugins/agentLive')
const cfg = getSentryExpoConfig(__dirname)

// inject `.e2e.ts` and `.e2e.tsx` into the sourceExts when running tests
cfg.resolver.sourceExts = process.env.RN_SRC_EXT
  ? process.env.RN_SRC_EXT.split(',').concat(cfg.resolver.sourceExts)
  : cfg.resolver.sourceExts

if (cfg.resolver.resolveRequest) {
  throw Error('Update this override because it is conflicting now.')
}

if (process.env.BSKY_PROFILE) {
  cfg.cacheVersion += ':PROFILE'
}

cfg.resolver.assetExts = [...cfg.resolver.assetExts, 'woff2']

// Agent Live (task 69138168): with EXPO_PUBLIC_AGENT_LIVE_ENABLED off, every
// LiveKit import resolves to an empty module, so no SDK code is bundled.
const AGENT_LIVE_ENABLED = isAgentLiveEnabled()
if (AGENT_LIVE_ENABLED) {
  cfg.cacheVersion += ':AGENT_LIVE'
}

cfg.resolver.resolveRequest = (context, moduleName, platform) => {
  if (!AGENT_LIVE_ENABLED && LIVE_JS_MODULE_RE.test(moduleName)) {
    return {type: 'empty'}
  }
  if (process.env.BSKY_PROFILE) {
    if (moduleName.endsWith('ReactNativeRenderer-prod')) {
      return context.resolveRequest(
        context,
        moduleName.replace('-prod', '-profiling'),
        platform,
      )
    }
  }
  return context.resolveRequest(context, moduleName, platform)
}

cfg.transformer.getTransformOptions = async () => ({
  transform: {
    experimentalImportSupport: true,
    inlineRequires: true,
  },
})

module.exports = cfg
