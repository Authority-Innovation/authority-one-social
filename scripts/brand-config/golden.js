// @ts-check
/**
 * Writes `base-config.golden.json`: the resolved Expo config of the pre-brand
 * app.config.js over the env matrix in `matrix.js`. It was generated once, from
 * the base commit, before app.config.js read brands/. Do not regenerate it to
 * make a failing compare pass - a failing compare means the default brand no
 * longer resolves to the base config.
 *
 *   node scripts/brand-config/golden.js [path/to/app.config.js]
 */
const fs = require('fs')
const path = require('path')

const {
  ROOT,
  envMatrix,
  hashMatrix,
  maskReleaseCounters,
  resolveConfigJson,
} = require('./matrix')

const GOLDEN = path.join(__dirname, 'base-config.golden.json')

function main() {
  const configPath = path.resolve(
    process.argv[2] || path.join(ROOT, 'app.config.js'),
  )
  const appConfig = require(configPath)
  const golden = {
    note: 'Resolved Expo config of the pre-brand app.config.js. version and ios.buildNumber are masked in the hashes.',
    cases: envMatrix().length,
    hashes: hashMatrix(appConfig),
    defaultConfig: maskReleaseCounters(
      JSON.parse(resolveConfigJson(appConfig, {})),
    ),
  }
  fs.writeFileSync(GOLDEN, JSON.stringify(golden, null, 2) + '\n')
  console.log(`wrote ${path.relative(ROOT, GOLDEN)} (${golden.cases} cases)`)
}

if (require.main === module) main()

module.exports = {GOLDEN}
