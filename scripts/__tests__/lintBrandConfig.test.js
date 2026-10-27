// @ts-check
const fs = require('fs')
const path = require('path')

const {
  EAS_JSON,
  collectBrands,
  lintBrands,
  readSignatureSchemes,
} = require('../lint-brand-config')
const {BRANDS_DIR, loadBrand} = require('../brand-config/loadBrand')

const FIXTURES = path.join(__dirname, '..', '__fixtures__', 'brand-lint')
const FIXTURE_BRANDS = path.join(FIXTURES, 'brands')

const eas = JSON.parse(fs.readFileSync(EAS_JSON, 'utf8'))
const signatureSchemes = readSignatureSchemes()

/**
 * Lints the real brands plus one fixture brand.
 * @param {string} [fixture]
 * @param {any} [easConfig]
 */
function lintWith(fixture, easConfig = eas) {
  const brands = collectBrands([BRANDS_DIR])
  if (fixture) {
    brands.push({name: fixture, brand: loadBrand(fixture, FIXTURE_BRANDS)})
  }
  return lintBrands(brands, {eas: easConfig, signatureSchemes})
}

/** @param {Array<{rule: string}>} errors */
const rules = errors => [...new Set(errors.map(e => e.rule))]

describe('lint-brand-config', () => {
  it('reads the Signature allow-list from the P2b config', () => {
    expect(signatureSchemes).toEqual(['authorityone', 'authorityone-dev'])
  })

  it('passes on the default brand and the repo eas.json', () => {
    expect(lintWith()).toEqual([])
  })

  it('passes on a valid fixture brand', () => {
    expect(lintWith('fixture-valid')).toEqual([])
  })

  it('fails a non-default brand with the blueskysocial owner', () => {
    const errors = lintWith('fixture-owner-blueskysocial')
    expect(rules(errors)).toEqual(['owner'])
    expect(errors[0].brand).toBe('fixture-owner-blueskysocial')
  })

  it('fails a duplicate bundle id', () => {
    const errors = lintWith('fixture-duplicate-bundle-id')
    expect(rules(errors)).toEqual(['bundle-id'])
    expect(errors[0].message).toMatch(/com\.authorityone\.app.*authority-one/)
  })

  it('fails a brand without legal links', () => {
    const errors = lintWith('fixture-missing-legal')
    expect(rules(errors)).toEqual(['legal'])
    expect(errors[0].message).toMatch(/privacyPolicy/)
  })

  it('fails an eas profile that does not set age assurance explicitly', () => {
    const fixtureEas = JSON.parse(
      fs.readFileSync(
        path.join(FIXTURES, 'eas-missing-age-assurance.json'),
        'utf8',
      ),
    )
    const errors = lintWith(undefined, fixtureEas)
    expect(rules(errors)).toEqual(['age-assurance'])
    // `base` is only an extends parent; `development` sets it; `preview` doesn't.
    expect(errors.map(e => e.message)).toEqual([
      expect.stringMatching(/"preview"/),
    ])
  })

  it('fails a Signature scheme outside the allow-list', () => {
    const errors = lintWith('fixture-scheme-not-allowed')
    expect(rules(errors)).toEqual(['scheme'])
    expect(errors[0].message).toMatch(/fixturebrand/)
  })
})
