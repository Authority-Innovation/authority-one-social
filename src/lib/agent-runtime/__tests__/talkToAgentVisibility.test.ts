// jest-only SOURCE-GUARD test: reads the component file to pin its render gate.
// Node builtins are fine here (never bundled into the app).
// eslint-disable-next-line import-x/no-nodejs-modules
import {readFileSync} from 'node:fs'
// eslint-disable-next-line import-x/no-nodejs-modules
import {join} from 'node:path'

import {describe, expect, it} from '@jest/globals'

/**
 * BUTTON VISIBILITY (§3.6 demo-friendly): the "Talk to <Agent>" button must show
 * on ANY agent profile — regardless of follow state AND ownership (owners demo
 * their own agents; the runtime lifts their budget server-side). The ONLY gates
 * are the build flag and the handle being an agent. Pinned at the source level
 * (the gate is a render condition, not an exported function).
 */
describe('TalkToAgentButton visibility gate', () => {
  const src = readFileSync(
    join(__dirname, '../../../components/TalkToAgent/TalkToAgentButton.tsx'),
    'utf8',
  )

  it('gates ONLY on the feature flag + agent handle', () => {
    expect(src).toContain('if (!PUBLIC_CHAT_ENABLED || !isAgent) return null')
  })

  it('has NO ownership gating (owners see the button on their own agents)', () => {
    expect(src).not.toMatch(/isMe/)
    expect(src).not.toMatch(/currentAccount\?\.did === profile\.did/)
  })

  it('has NO follow-state gating (following only feeds the conversion card)', () => {
    // `following` may be READ (passed to the dialog's Follow card) but must never
    // appear in the render gate.
    const gate = src.slice(
      src.indexOf('if (!PUBLIC_CHAT_ENABLED'),
      src.indexOf('return null') + 12,
    )
    expect(gate).not.toMatch(/following/)
  })

  it('never claims ownership client-side (no owner flag sent anywhere)', () => {
    expect(src).not.toMatch(/unlimited|isOwner/)
  })
})
