// @ts-check
/**
 * Loads `brands/<name>/brand.json`. Shared by app.config.js (build time) and
 * scripts/lint-brand-config.js. Plain node: app.config.js cannot import TS.
 * See brands/README.md for the fields.
 */
const fs = require('fs')
const path = require('path')

const DEFAULT_BRAND = 'authority-one'
const BRANDS_DIR = path.join(__dirname, '..', '..', 'brands')

/**
 * @typedef {{
 *   displayName: string,
 *   appStoreName: string,
 *   slug: string,
 *   scheme: string,
 *   bundleId: string,
 *   androidPackage: string,
 *   easOwner: string,
 *   easProjectId: string,
 *   skinId: string,
 *   lockedCommunity: string,
 *   associatedDomains: string[],
 *   icons: {app: string, ios: string, android: string},
 *   splash: {backgroundColor: string, darkBackgroundColor: string},
 *   legal: {termsOfService: string, privacyPolicy: string, support: string},
 *   signature: {
 *     schemes: string[],
 *     clientIdIos: string,
 *     clientIdAndroid: string,
 *     clientIdWeb: string,
 *   },
 * }} Brand
 */

const REQUIRED_STRINGS = [
  'displayName',
  'appStoreName',
  'slug',
  'scheme',
  'bundleId',
  'androidPackage',
  'easOwner',
  'easProjectId',
  'icons.app',
  'icons.ios',
  'icons.android',
  'splash.backgroundColor',
  'splash.darkBackgroundColor',
]

/**
 * The brand to build. `BRAND` picks it; unset means the default brand. If
 * `EXPO_PUBLIC_BRAND` (what the JS bundle sees) is also set it must agree, so
 * a build can't ship one brand's native config with another brand's runtime.
 * @param {Record<string, string | undefined>} env
 * @returns {string}
 */
function resolveBrandName(env) {
  const name = (env.BRAND || '').trim() || DEFAULT_BRAND
  const runtime = (env.EXPO_PUBLIC_BRAND || '').trim()
  if (runtime && runtime !== name) {
    throw new Error(
      `BRAND (${name}) and EXPO_PUBLIC_BRAND (${runtime}) disagree; set both to the same brand`,
    )
  }
  return name
}

/**
 * @param {unknown} obj
 * @param {string} dotted
 * @returns {unknown}
 */
function get(obj, dotted) {
  return dotted
    .split('.')
    .reduce(
      (/** @type {unknown} */ o, k) =>
        o && typeof o === 'object'
          ? /** @type {Record<string, unknown>} */ (o)[k]
          : undefined,
      obj,
    )
}

/**
 * @param {string} name
 * @param {string} [brandsDir]
 * @returns {Brand}
 */
function loadBrand(name, brandsDir = BRANDS_DIR) {
  if (!/^[a-z0-9][a-z0-9-]*$/.test(name)) {
    throw new Error(`Invalid brand name "${name}"`)
  }
  const file = path.join(brandsDir, name, 'brand.json')
  if (!fs.existsSync(file)) {
    throw new Error(`Unknown brand "${name}": ${file} does not exist`)
  }
  /** @type {Brand} */
  const brand = JSON.parse(fs.readFileSync(file, 'utf8'))
  const missing = REQUIRED_STRINGS.filter(k => {
    const v = get(brand, k)
    return typeof v !== 'string' || v === ''
  })
  if (!Array.isArray(brand.associatedDomains)) {
    missing.push('associatedDomains')
  }
  if (missing.length) {
    throw new Error(`Brand "${name}" is missing: ${missing.join(', ')}`)
  }
  return brand
}

/**
 * @param {string} [brandsDir]
 * @returns {string[]} brand names (directories holding a brand.json)
 */
function listBrands(brandsDir = BRANDS_DIR) {
  return fs
    .readdirSync(brandsDir, {withFileTypes: true})
    .filter(
      d =>
        d.isDirectory() &&
        fs.existsSync(path.join(brandsDir, d.name, 'brand.json')),
    )
    .map(d => d.name)
    .sort()
}

module.exports = {
  DEFAULT_BRAND,
  BRANDS_DIR,
  resolveBrandName,
  loadBrand,
  listBrands,
}
