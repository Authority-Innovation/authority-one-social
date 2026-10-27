// @ts-check
/**
 * Resolves app.config.js over a fixed env matrix. Used by the "default brand
 * is byte-identical to base" test and by `golden.js`, which wrote the golden
 * file from the pre-brand app.config.js.
 */
const crypto = require('crypto')
const path = require('path')

const ROOT = path.join(__dirname, '..', '..')

const AO_SIGNATURE_ON = {
  EXPO_PUBLIC_AO_SIGNATURE_ISSUER: 'https://janus.test/auth/v1',
  EXPO_PUBLIC_AO_SIGNATURE_RUNTIME_URL:
    'https://authority-one-agent-runtime.e-479.workers.dev/',
  EXPO_PUBLIC_AO_SIGNATURE_CLIENT_ID_IOS: 'ao-ios',
  EXPO_PUBLIC_AO_SIGNATURE_CLIENT_ID_ANDROID: 'ao-android',
  EXPO_PUBLIC_AO_SIGNATURE_SCHEME: 'authorityone-dev',
  EXPO_PUBLIC_AO_SIGNATURE_APP_REDIRECT_URI:
    'https://app-dev.test/auth/janus/app-callback',
}

/** Every env key app.config.js (or the brand loader) reads. */
const CONTROLLED_KEYS = [
  'BRAND',
  'EXPO_PUBLIC_BRAND',
  'EXPO_PUBLIC_ENV',
  'PAID_SIGNING',
  'EAS_BUILD_PLATFORM',
  'SENTRY_AUTH_TOKEN',
  'EXPO_PUBLIC_AGENT_RUNTIME_URL',
  'EXPO_PUBLIC_AO_SIGNATURE_AUTHORIZE_BASE',
  ...Object.keys(AO_SIGNATURE_ON),
]

/** @returns {Array<[string, Record<string, string>]>} */
function envMatrix() {
  /** @type {Array<[string, Record<string, string>]>} */
  const out = []
  for (const env of ['', 'testflight', 'production']) {
    for (const paid of ['', '1']) {
      for (const platform of ['', 'ios', 'android']) {
        for (const sig of [false, true]) {
          for (const sentry of [false, true]) {
            /** @type {Record<string, string>} */
            const e = {}
            if (env) e.EXPO_PUBLIC_ENV = env
            if (paid) e.PAID_SIGNING = paid
            if (platform) e.EAS_BUILD_PLATFORM = platform
            if (sig) Object.assign(e, AO_SIGNATURE_ON)
            if (sentry) e.SENTRY_AUTH_TOKEN = 'placeholder'
            const name = [
              `env=${env || 'dev'}`,
              `paid=${paid || '0'}`,
              `platform=${platform || 'none'}`,
              `signature=${sig ? 'on' : 'off'}`,
              `sentry=${sentry ? 'on' : 'off'}`,
            ].join(',')
            out.push([name, e])
          }
        }
      }
    }
  }
  return out
}

/**
 * Release counters change on every TestFlight bump; they are not brand
 * values, so the golden compare masks them (and only them).
 * @param {{expo: {version?: string, ios?: {buildNumber?: string}}}} config
 */
function maskReleaseCounters(config) {
  /** @type {typeof config} */
  const c = JSON.parse(JSON.stringify(config))
  c.expo.version = '<version>'
  if (c.expo.ios) c.expo.ios.buildNumber = '<buildNumber>'
  return c
}

/**
 * Calls the app config function with exactly `env` set for the keys it reads,
 * then restores process.env.
 * @param {(config: any) => any} appConfig
 * @param {Record<string, string>} env
 * @returns {string} the resolved config as JSON
 */
function resolveConfigJson(appConfig, env) {
  /** @type {Record<string, string | undefined>} */
  const saved = {}
  for (const k of CONTROLLED_KEYS) {
    saved[k] = process.env[k]
    delete process.env[k]
  }
  Object.assign(process.env, env)
  try {
    return JSON.stringify(appConfig({}), null, 2)
  } finally {
    for (const k of CONTROLLED_KEYS) {
      if (saved[k] === undefined) delete process.env[k]
      else process.env[k] = saved[k]
    }
  }
}

/** @param {string} s */
function sha256(s) {
  return crypto.createHash('sha256').update(s, 'utf8').digest('hex')
}

/**
 * @param {(config: any) => any} appConfig
 * @param {Record<string, string>} [extraEnv] added to every case (e.g. BRAND)
 * @returns {Record<string, string>} case name -> sha256 of the masked JSON
 */
function hashMatrix(appConfig, extraEnv = {}) {
  /** @type {Record<string, string>} */
  const out = {}
  for (const [name, env] of envMatrix()) {
    const json = resolveConfigJson(appConfig, {...env, ...extraEnv})
    out[name] = sha256(
      JSON.stringify(maskReleaseCounters(JSON.parse(json)), null, 2),
    )
  }
  return out
}

module.exports = {
  ROOT,
  CONTROLLED_KEYS,
  envMatrix,
  maskReleaseCounters,
  resolveConfigJson,
  hashMatrix,
  sha256,
}
