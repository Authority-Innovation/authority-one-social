// @ts-check
const crypto = require('node:crypto')
const fs = require('fs')
const path = require('path')

const appConfig = require('../../app.config.js')
const golden = require('../brand-config/base-config.golden.json')
const {
  hashMatrix,
  maskReleaseCounters,
  resolveConfigJson,
} = require('../brand-config/matrix')
const {
  DEFAULT_BRAND,
  listBrands,
  loadBrand,
  resolveBrandName,
} = require('../brand-config/loadBrand')

const ROOT = path.join(__dirname, '..', '..')
const FIXTURE_BRANDS = path.join(
  __dirname,
  '..',
  '__fixtures__',
  'brand-lint',
  'brands',
)

/** @param {Record<string, string>} hashes */
function diffAgainstGolden(hashes) {
  return Object.keys(golden.hashes).filter(k => golden.hashes[k] !== hashes[k])
}

describe('default brand resolves to the base config', () => {
  it('covers the whole golden matrix', () => {
    expect(Object.keys(golden.hashes)).toHaveLength(golden.cases)
    expect(golden.cases).toBeGreaterThanOrEqual(72)
  })

  it('is byte-identical to base with BRAND unset', () => {
    expect(diffAgainstGolden(hashMatrix(appConfig))).toEqual([])
  })

  it('is byte-identical to base with BRAND=authority-one', () => {
    expect(
      diffAgainstGolden(
        hashMatrix(appConfig, {
          BRAND: 'authority-one',
          EXPO_PUBLIC_BRAND: 'authority-one',
        }),
      ),
    ).toEqual([])
  })

  it('matches the stored base default config field for field', () => {
    const json = JSON.stringify(
      maskReleaseCounters(JSON.parse(resolveConfigJson(appConfig, {}))),
      null,
      2,
    )
    expect(json).toBe(JSON.stringify(golden.defaultConfig, null, 2))
  })
})

describe('BRAND selection', () => {
  it('falls back to authority-one when BRAND is missing', () => {
    expect(resolveBrandName({})).toBe(DEFAULT_BRAND)
    expect(resolveBrandName({BRAND: ''})).toBe('authority-one')
    expect(resolveConfigJson(appConfig, {})).toBe(
      resolveConfigJson(appConfig, {BRAND: 'authority-one'}),
    )
  })

  it('refuses an unknown brand', () => {
    expect(() =>
      resolveConfigJson(appConfig, {BRAND: 'no-such-brand'}),
    ).toThrow(/Unknown brand "no-such-brand"/)
    expect(() => loadBrand('../authority-one')).toThrow(/Invalid brand name/)
  })

  it('refuses a BRAND that disagrees with EXPO_PUBLIC_BRAND', () => {
    expect(() =>
      resolveConfigJson(appConfig, {
        BRAND: 'authority-one',
        EXPO_PUBLIC_BRAND: 'someone-else',
      }),
    ).toThrow(/disagree/)
  })

  it('takes identity values from the brand file', () => {
    const brand = loadBrand('fixture-valid', FIXTURE_BRANDS)
    const {expo} = appConfig.appConfigForBrand(brand)
    expect(expo.name).toBe('fixture-valid')
    expect(expo.slug).toBe('fixture-valid')
    expect(expo.scheme).toBe('fixture-valid')
    expect(expo.owner).toBe('example-owner')
    expect(expo.ios?.bundleIdentifier).toBe('com.example.fixturevalid')
    expect(expo.ios?.infoPlist?.CFBundleDisplayName).toBe('fixture-valid')
    expect(expo.android?.package).toBe('com.example.fixturevalid')
    const eas = /** @type {{projectId?: string}} */ (expo.extra?.eas)
    expect(eas.projectId).toBe(brand.easProjectId)
  })
})

describe('a brand build changes no file under src/', () => {
  /** @returns {string[]} "relative/path sha256" for every file under src/ */
  function snapshotSrc() {
    /** @type {string[]} */
    const out = []
    /** @param {string} dir */
    const walk = dir => {
      for (const e of fs.readdirSync(dir, {withFileTypes: true})) {
        const p = path.join(dir, e.name)
        if (e.isDirectory()) walk(p)
        else {
          const sha = crypto
            .createHash('sha256')
            .update(fs.readFileSync(p))
            .digest('hex')
          out.push(`${path.relative(ROOT, p)} ${sha}`)
        }
      }
    }
    walk(path.join(ROOT, 'src'))
    return out.sort()
  }

  it('resolving every brand config leaves src/ byte-identical', () => {
    const before = snapshotSrc()
    const configs = [
      ...listBrands().map(name => appConfig.appConfigForBrand(loadBrand(name))),
      ...listBrands(FIXTURE_BRANDS).map(name =>
        appConfig.appConfigForBrand(loadBrand(name, FIXTURE_BRANDS)),
      ),
    ]
    expect(snapshotSrc()).toEqual(before)

    // A brand build is config only: nothing it resolves points into src/.
    for (const c of configs) {
      expect(JSON.stringify(c)).not.toMatch(/(^|[^a-z])src\//)
    }
  })
})
