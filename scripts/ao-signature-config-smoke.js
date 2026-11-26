// Smoke check (plain node, no deps): resolves app.config.js for the Signature
// native lanes and prints what a build would carry. No secrets: every value
// here is a public placeholder. Usage: node scripts/ao-signature-config-smoke.js
const appConfig = require('../app.config.js')

const base = {
  EXPO_PUBLIC_AO_SIGNATURE_ISSUER: 'https://janus.test/auth/v1',
  EXPO_PUBLIC_AO_SIGNATURE_RUNTIME_URL:
    'https://authority-one-agent-runtime.e-479.workers.dev',
  EXPO_PUBLIC_AO_SIGNATURE_CLIENT_ID_IOS: 'community-ios-dev',
}
const cases = {
  dark: {},
  https: {
    ...base,
    EXPO_PUBLIC_AO_SIGNATURE_APP_REDIRECT_URI:
      'https://app-dev.authority-one.com/auth/janus/community/app-callback',
  },
  bounce: {
    ...base,
    EXPO_PUBLIC_AO_SIGNATURE_SCHEME: 'community-dev',
    EXPO_PUBLIC_AO_SIGNATURE_APP_REDIRECT_URI:
      'https://app-dev.authority-one.com/auth/janus/app-callback',
  },
}

const KEYS = [
  ...new Set(Object.values(cases).flatMap(c => Object.keys(c))),
  'PAID_SIGNING',
  'EAS_BUILD_PLATFORM',
]
for (const [name, env] of Object.entries(cases)) {
  const saved = {}
  for (const k of KEYS) {
    saved[k] = process.env[k]
    delete process.env[k]
  }
  Object.assign(process.env, env, {PAID_SIGNING: '1', EAS_BUILD_PLATFORM: 'ios'})
  try {
    const {expo} = appConfig({})
    const props = expo.plugins.find(
      p => Array.isArray(p) && p[0] === 'expo-build-properties',
    )
    console.log(
      JSON.stringify({
        case: name,
        scheme: expo.scheme,
        associatedDomains: expo.ios.associatedDomains,
        deploymentTarget: props[1].ios.deploymentTarget,
      }),
    )
  } finally {
    for (const k of KEYS) {
      if (saved[k] === undefined) delete process.env[k]
      else process.env[k] = saved[k]
    }
  }
}
