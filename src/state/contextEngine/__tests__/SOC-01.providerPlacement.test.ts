/* eslint-disable import-x/no-nodejs-modules -- Node-side source-reading test */
import {readFileSync} from 'node:fs'
import path from 'node:path'

import {describe, expect, it} from '@jest/globals'

// SOC-01: the ContextEngineProvider must sit INSIDE the subtree keyed by the current
// account DID, so an account switch or sign-out unmounts it (dropping in-memory events,
// the capture loop and any open dwell) instead of carrying them into the next account.
const root = path.resolve(__dirname, '../../../..')
const read = (p: string) => readFileSync(path.join(root, p), 'utf8')

describe('SOC-01 ContextEngineProvider placement', () => {
  it.each(['src/App.native.tsx', 'src/App.web.tsx'])(
    '%s mounts it inside the per-DID keyed subtree',
    file => {
      const src = read(file)
      const keyAt = src.indexOf('key={currentAccount?.did}')
      const providerAt = src.indexOf('<ContextEngineProvider>')
      expect(keyAt).toBeGreaterThan(-1)
      expect(providerAt).toBeGreaterThan(keyAt)
    },
  )

  it('the shell provider (outside the keyed subtree) no longer mounts it', () => {
    expect(read('src/state/shell/index.tsx')).not.toContain(
      '<ContextEngineProvider>',
    )
  })
})
