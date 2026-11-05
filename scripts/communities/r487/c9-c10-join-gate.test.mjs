/**
 * C9 and C10: the join screen's consent gate. JSX can't load without
 * dependencies, so these lift the screen's real statements out of
 * JoinConsent.tsx and run them, rather than only matching text:
 *
 * - C9 runs the real `const gate = ...` line and the real `onAgreeAndJoin`.
 * - C10 runs the real conditions of the screen's branch chain, in order, and
 *   reads the test ids of the branch they pick.
 *
 * Neither replaces a render. The jest suite does that where it can run.
 */
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {test} from 'node:test'

const consent = await import('#/screens/Community/consent')

// A Windows checkout has CRLF endings.
const SOURCE = readFileSync(
  'src/screens/Community/JoinConsent.tsx',
  'utf8',
).replaceAll('\r\n', '\n')
const CONSENT_BOX = 'community_join_consent'
const AGREE = 'communityJoinAgreeButton'
const NEEDS_UPDATE = 'communityJoinNeedsUpdate'
const LOAD_ERROR = 'communityJoinLoadError'

/** The line of the screen that builds the gate. */
function gateLine() {
  const line = SOURCE.split('\n').find(l => l.trim().startsWith('const gate ='))
  assert.ok(line, 'JoinConsent.tsx no longer builds a gate')
  return line
}

/** `const onAgreeAndJoin = async () => {...}`, as written in the screen. */
function handlerSource() {
  const start = SOURCE.indexOf('const onAgreeAndJoin = async () => {')
  assert.notEqual(start, -1, 'JoinConsent.tsx has no onAgreeAndJoin')
  const end = SOURCE.indexOf('\n  }\n', start)
  assert.notEqual(end, -1)
  return SOURCE.slice(start, end + '\n  }'.length)
}

/** Runs the real handler over a given screen state. Returns the joins it made. */
async function pressAgree({joinInfo, consented = true, pending = false}) {
  const joins = []
  const scope = {
    consentGateFor: consent.consentGateFor,
    joinInfo,
    consented,
    pending,
    id: 'c',
    viewer: 'did:example:v',
    agreeAndJoin: async args => {
      joins.push(args)
      return {ok: false, reason: 'join_failed'}
    },
    setPending() {},
    setJoinError() {},
    setJoined() {},
    queryClient: {invalidateQueries() {}},
    createCommunityQueryKey() {},
    createMyCommunitiesQueryKey() {},
  }
  const body = `${gateLine()}\n${handlerSource()}\nreturn onAgreeAndJoin()`
  const run = new Function(...Object.keys(scope), body)
  await run(...Object.values(scope))
  return joins
}

/**
 * The branches of the chain inside `<Layout.Content>`, in order. Prettier sets
 * each `{cond ? (` and `) : cond ? (` at the chain's own indent, which the
 * branch bodies are always deeper than.
 */
function branches() {
  const open = SOURCE.indexOf('<Layout.Content>')
  const close = SOURCE.indexOf('</Layout.Content>', open)
  assert.ok(open !== -1 && close !== -1)
  const lines = SOURCE.slice(open, close).split('\n').slice(1)
  const out = []
  for (const line of lines) {
    const head =
      /^ {8}\{(.+) \? \($/.exec(line) ?? /^ {8}\) : (.+) \? \($/.exec(line)
    if (head) out.push({condition: head[1], body: ''})
    else if (/^ {8}\) : \($/.test(line)) out.push({condition: 'true', body: ''})
    else if (out.length > 0) out[out.length - 1].body += `${line}\n`
  }
  assert.ok(out.length > 1, 'could not read the branch chain')
  return out
}

/** What the screen's body holds for a given state. */
function shown({joinInfo, isLoading = false, isError = false, joined = null}) {
  const gate = new Function(
    'consentGateFor',
    'joinInfo',
    `${gateLine()}\nreturn gate`,
  )(consent.consentGateFor, joinInfo)
  const scope = {isLoading, isError, joinInfo, gate, joined}
  const branch = branches().find(({condition}) =>
    new Function(...Object.keys(scope), `return (${condition})`)(
      ...Object.values(scope),
    ),
  )
  assert.ok(branch, 'no branch matched')
  return branch.body
}

const hasConsentControls = body =>
  body.includes(CONSENT_BOX) || body.includes(AGREE)

for (const wording_version of [1, 3, 2.5, null]) {
  test(`C9: Agree makes no join when join-info names ${wording_version}`, async () => {
    assert.deepEqual(await pressAgree({joinInfo: {wording_version}}), [])
  })
}

test('C9: Agree makes no join with no join-info', async () => {
  assert.deepEqual(await pressAgree({joinInfo: undefined}), [])
})

test('C9: Agree joins with version 2 once the box is ticked', async () => {
  assert.deepEqual(await pressAgree({joinInfo: {wording_version: 2}}), [
    {id: 'c', consentVersion: '2', consented: true},
  ])
})

test('C9: Agree makes no join without the tick, or while one is pending', async () => {
  const joinInfo = {wording_version: 2}
  assert.deepEqual(await pressAgree({joinInfo, consented: false}), [])
  assert.deepEqual(await pressAgree({joinInfo, pending: true}), [])
})

for (const wording_version of [1, 3, 2.5]) {
  test(`C10: join-info naming ${wording_version} shows the update state, no consent box`, () => {
    const body = shown({joinInfo: {wording_version}})
    assert.ok(body.includes(NEEDS_UPDATE))
    assert.equal(hasConsentControls(body), false)
  })
}

for (const [label, state] of [
  ['null', {joinInfo: {wording_version: null}}],
  ['the string "2"', {joinInfo: {wording_version: '2'}}],
  ['no join-info', {joinInfo: undefined}],
  ['a failed read', {joinInfo: {wording_version: 2}, isError: true}],
]) {
  test(`C10: ${label} shows the load error, no consent box`, () => {
    const body = shown(state)
    assert.ok(body.includes(LOAD_ERROR))
    assert.equal(hasConsentControls(body), false)
  })
}

test('C10: version 2 is the one state that shows the consent box and Agree', () => {
  const body = shown({joinInfo: {wording_version: 2}})
  assert.ok(body.includes(CONSENT_BOX))
  assert.ok(body.includes(AGREE))
  assert.equal(body.includes(NEEDS_UPDATE), false)
})

test('C10: loading shows no consent box', () => {
  assert.equal(
    hasConsentControls(shown({joinInfo: undefined, isLoading: true})),
    false,
  )
})
