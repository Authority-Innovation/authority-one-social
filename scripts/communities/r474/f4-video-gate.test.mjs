/**
 * F4 (HIGH): a picked video must not leave the device before the target check.
 */
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {test} from 'node:test'

// A namespace import, so each case reports its own failure on the unfixed code.
const gate = await import('#/view/com/composer/state/writeGate')

const members = {
  ok: true,
  route: 'communities',
  target: {kind: 'community', id: 'garden', tier: 'members'},
}
const paid = {...members, target: {...members.target, tier: 'paid'}}
const profile = {ok: true, route: 'pds', target: {kind: 'profile'}}
const unresolved = {ok: false, error: {code: 'unknown-parent-target'}}

for (const [name, resolution] of [
  ['members', members],
  ['paid', paid],
  ['unresolved', unresolved],
]) {
  test(`F4: a ${name} target never starts the upload`, () => {
    let started = 0
    const refusals = []
    const out = gate.startAuthorityVideoGuarded({
      resolution,
      onRefused: r => refusals.push(r),
      start: () => started++,
    })
    assert.equal(out, false)
    assert.equal(started, 0)
    assert.equal(refusals.length, 1)
  })
}

test('F4: the profile target still uploads', () => {
  let started = 0
  const out = gate.startAuthorityVideoGuarded({
    resolution: profile,
    onRefused: () => assert.fail('refused'),
    start: () => started++,
  })
  assert.equal(out, true)
  assert.equal(started, 1)
})

test('F4: the Composer checks the gate before any upload or state change', () => {
  const src = readFileSync('src/view/com/composer/Composer.tsx', 'utf8')
  const start = src.indexOf('const onSelectAuthorityVideo = ')
  assert.notEqual(start, -1)
  const body = src.slice(start, src.indexOf('Track when a draft', start))
  assert.ok(body.includes('startAuthorityVideoGuarded('))
  assert.ok(body.includes('start: () => startAuthorityVideo(asset)'))
  assert.ok(!body.includes('uploadAuthorityVideo'))
  assert.ok(!body.includes('setAuthorityVideo'))
  // Both pickers go through the guarded callback; the raw one has one caller.
  assert.ok(!src.includes('={startAuthorityVideo}'))
  assert.ok(src.includes('onPickVideo={onSelectAuthorityVideo}'))
  assert.ok(
    src.includes(
      'videoBtnDisabled = !!media || hasAuthorityVideo || authorityVideoRefused',
    ),
  )
})
