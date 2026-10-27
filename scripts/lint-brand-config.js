#!/usr/bin/env node
// @ts-check
/**
 * Lints every brand under brands/ against eas.json and the Signature
 * allow-list. Exits 1 on any error.
 *
 *   node scripts/lint-brand-config.js
 *
 * Rules:
 *   owner         only the default brand may use the `blueskysocial` EAS owner
 *   bundle-id     iOS bundle ids and Android packages are unique across brands
 *   legal         terms of service and privacy policy are https URLs
 *   age-assurance every eas build profile sets EXPO_PUBLIC_DISABLE_AGE_ASSURANCE
 *                 explicitly (directly or through `extends`). Profiles that only
 *                 exist as an `extends` parent are templates and are skipped.
 *   scheme        every Signature scheme a brand lists is in AO_SIGNATURE_SCHEMES
 *                 (src/features/aoSignature/config.ts)
 */
const fs = require('fs')
const path = require('path')

const {
  DEFAULT_BRAND,
  BRANDS_DIR,
  listBrands,
  loadBrand,
} = require('./brand-config/loadBrand')

const ROOT = path.join(__dirname, '..')
const EAS_JSON = path.join(ROOT, 'eas.json')
const SIGNATURE_CONFIG = path.join(ROOT, 'src/features/aoSignature/config.ts')
const BLUESKY_OWNER = 'blueskysocial'
const AGE_ASSURANCE_KEY = 'EXPO_PUBLIC_DISABLE_AGE_ASSURANCE'

/**
 * @typedef {import('./brand-config/loadBrand').Brand} Brand
 * @typedef {{brand: string, rule: string, message: string}} LintError
 * @typedef {{extends?: string, env?: Record<string, string>}} EasProfile
 */

/**
 * Reads AO_SIGNATURE_SCHEMES out of the TS source so the list has one home.
 * @param {string} [file]
 * @returns {string[]}
 */
function readSignatureSchemes(file = SIGNATURE_CONFIG) {
  const src = fs.readFileSync(file, 'utf8')
  const m = src.match(/AO_SIGNATURE_SCHEMES\s*=\s*\[([^\]]*)\]/)
  if (!m) throw new Error(`AO_SIGNATURE_SCHEMES not found in ${file}`)
  return [...m[1].matchAll(/['"]([^'"]+)['"]/g)].map(x => x[1])
}

/** @param {unknown} v */
function isHttpsUrl(v) {
  if (typeof v !== 'string' || !v) return false
  try {
    return new URL(v).protocol === 'https:'
  } catch {
    return false
  }
}

/**
 * @param {Record<string, EasProfile>} profiles
 * @param {string} name
 * @returns {Record<string, string>}
 */
function resolvedEnv(profiles, name) {
  /** @type {Record<string, string>} */
  let env = {}
  const seen = new Set()
  /** @type {string | undefined} */
  let cur = name
  const chain = []
  while (cur && profiles[cur] && !seen.has(cur)) {
    seen.add(cur)
    chain.unshift(profiles[cur])
    cur = profiles[cur].extends
  }
  for (const p of chain) env = {...env, ...(p.env || {})}
  return env
}

/**
 * @param {Array<{name: string, brand: Brand}>} brands
 * @param {{eas: {build?: Record<string, EasProfile>}, signatureSchemes: string[]}} ctx
 * @returns {LintError[]}
 */
function lintBrands(brands, {eas, signatureSchemes}) {
  /** @type {LintError[]} */
  const errors = []
  /** @param {string} brand @param {string} rule @param {string} message */
  const fail = (brand, rule, message) => errors.push({brand, rule, message})

  /** @type {Map<string, string>} */
  const ids = new Map()
  for (const {name, brand} of brands) {
    if (brand.easOwner === BLUESKY_OWNER && name !== DEFAULT_BRAND) {
      fail(
        name,
        'owner',
        `EAS owner "${BLUESKY_OWNER}" is reserved for the default brand`,
      )
    }

    for (const [kind, id] of [
      ['iOS bundle id', brand.bundleId],
      ['Android package', brand.androidPackage],
    ]) {
      const key = `${kind}:${id}`
      const other = ids.get(key)
      if (other) {
        fail(name, 'bundle-id', `${kind} "${id}" is also used by ${other}`)
      } else {
        ids.set(key, name)
      }
    }

    const legal = brand.legal || {}
    for (const k of /** @type {const} */ ([
      'termsOfService',
      'privacyPolicy',
    ])) {
      if (!isHttpsUrl(legal[k])) {
        fail(name, 'legal', `legal.${k} must be an https URL`)
      }
    }

    const schemes = brand.signature?.schemes ?? []
    for (const s of schemes) {
      if (!signatureSchemes.includes(s)) {
        fail(
          name,
          'scheme',
          `Signature scheme "${s}" is not in AO_SIGNATURE_SCHEMES (${signatureSchemes.join(', ')})`,
        )
      }
    }
    const sig = brand.signature
    if (
      sig &&
      (sig.clientIdIos || sig.clientIdAndroid || sig.clientIdWeb) &&
      schemes.length === 0
    ) {
      fail(name, 'scheme', 'Signature client ids are set but no scheme is')
    }
  }

  const profiles = eas.build || {}
  const parents = new Set(
    Object.values(profiles)
      .map(p => p.extends)
      .filter(Boolean),
  )
  for (const name of Object.keys(profiles)) {
    if (parents.has(name)) continue
    if (!(AGE_ASSURANCE_KEY in resolvedEnv(profiles, name))) {
      fail(
        '*',
        'age-assurance',
        `eas profile "${name}" does not set ${AGE_ASSURANCE_KEY} explicitly`,
      )
    }
  }

  return errors
}

/**
 * @param {string[]} [brandsDirs]
 * @returns {Array<{name: string, brand: Brand}>}
 */
function collectBrands(brandsDirs = [BRANDS_DIR]) {
  return brandsDirs.flatMap(dir =>
    listBrands(dir).map(name => ({name, brand: loadBrand(name, dir)})),
  )
}

function main() {
  const brands = collectBrands()
  const errors = lintBrands(brands, {
    eas: JSON.parse(fs.readFileSync(EAS_JSON, 'utf8')),
    signatureSchemes: readSignatureSchemes(),
  })
  for (const e of errors) {
    console.error(`[${e.rule}] ${e.brand}: ${e.message}`)
  }
  if (errors.length) {
    console.error(`brand config lint: ${errors.length} error(s)`)
    process.exit(1)
  }
  console.log(`brand config lint: ok (${brands.map(b => b.name).join(', ')})`)
}

if (require.main === module) main()

module.exports = {
  lintBrands,
  collectBrands,
  readSignatureSchemes,
  EAS_JSON,
}
