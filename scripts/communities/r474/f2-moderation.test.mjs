/**
 * F2 (BLOCKER): no report, block, remove or ban. This covers the app half. The
 * door has no moderation routes yet, so the calls below follow a PROPOSED
 * contract, and the app has to say so plainly when the door answers 404. Block
 * is device-local until the door has one.
 */
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {afterEach, test} from 'node:test'

const client = await import('#/lib/agent-runtime/communitiesClient')
const mod = await import('#/screens/Community/moderation').catch(() => ({}))

const realFetch = globalThis.fetch
afterEach(() => {
  globalThis.fetch = realFetch
})

function stubFetch(status, body = {}) {
  const calls = []
  globalThis.fetch = async (url, init) => {
    calls.push({url, init})
    return new Response(JSON.stringify(body), {status})
  }
  return calls
}

const BASE = 'https://runtime.invalid/app/communities'

test('F2: report sends only the reason, to the post it names', async () => {
  const calls = stubFetch(200)
  const res = await client.reportPost('c', 'p1', 'harassment')
  assert.equal(res.ok, true)
  assert.equal(calls[0].url, `${BASE}/c/posts/p1/report`)
  assert.equal(calls[0].init.method, 'POST')
  assert.deepEqual(JSON.parse(calls[0].init.body), {reason: 'harassment'})
})

test('F2: an unknown report reason sends nothing', async () => {
  const calls = stubFetch(200)
  const res = await client.reportPost('c', 'p1', 'whatever')
  assert.equal(res.ok, false)
  assert.equal(res.error.kind, 'invalid_argument')
  assert.equal(calls.length, 0)
})

test('F2: admin remove post, remove member and ban use their own routes', async () => {
  const cases = [
    [() => client.removePost('c', 'p1'), `${BASE}/c/moderation/posts/p1/remove`],
    [
      () => client.removeMember('c', 'a.test'),
      `${BASE}/c/moderation/members/a.test/remove`,
    ],
    [
      () => client.banMember('c', 'a.test'),
      `${BASE}/c/moderation/members/a.test/ban`,
    ],
  ]
  for (const [run, url] of cases) {
    const calls = stubFetch(200)
    assert.equal((await run()).ok, true)
    assert.equal(calls[0].url, url)
    assert.equal(calls[0].init.method, 'POST')
  }
})

test('F2: a member id with a slash cannot change the route', async () => {
  const calls = stubFetch(200)
  await client.banMember('c', 'a/../../x')
  assert.equal(calls[0].url, `${BASE}/c/moderation/members/a%2F..%2F..%2Fx/ban`)
})

test('F2: a door without the route is told apart from a failure', () => {
  const outcome = mod.moderationOutcome
  assert.equal(outcome({ok: true, data: null}), 'done')
  assert.equal(
    outcome({ok: false, error: {kind: 'http', status: 404}}),
    'not_available',
  )
  assert.equal(
    outcome({ok: false, error: {kind: 'http', status: 403}}),
    'not_allowed',
  )
  assert.equal(outcome({ok: false, error: {kind: 'network'}}), 'failed')
})

test('F2: blocked members are hidden, matched by DID or handle', () => {
  const a = {id: '1', authorActor: 'did:plc:a', authorHandle: 'a.test', author: {did: 'did:plc:a'}}
  const b = {id: '2', authorActor: 'b.test', authorHandle: 'b.test', author: {}}
  const c = {id: '3', authorActor: 'did:plc:c', author: {did: 'did:plc:c'}}
  const hide = mod.withoutBlocked
  assert.deepEqual(hide([a, b, c], []).map(r => r.id), ['1', '2', '3'])
  assert.deepEqual(hide([a, b, c], ['did:plc:a']).map(r => r.id), ['2', '3'])
  assert.deepEqual(hide([a, b, c], ['b.test']).map(r => r.id), ['1', '3'])
  assert.deepEqual(hide([a, b, c], ['a.test']).map(r => r.id), ['2', '3'])
})

test('F2: block lists are per community and add without duplicates', () => {
  const add = mod.addBlocked
  const once = add(undefined, 'c', 'did:plc:a')
  assert.deepEqual(once, {c: ['did:plc:a']})
  assert.deepEqual(add(once, 'c', 'did:plc:a'), {c: ['did:plc:a']})
  assert.deepEqual(add(once, 'd', 'x.test'), {
    c: ['did:plc:a'],
    d: ['x.test'],
  })
})

test('F2: who can do what on a post', () => {
  const offered = mod.moderationActionsFor
  assert.deepEqual(offered({own: true, isAdmin: false, hasMemberId: true}), [])
  assert.deepEqual(offered({own: false, isAdmin: false, hasMemberId: true}), [
    'report',
    'block',
  ])
  assert.deepEqual(offered({own: false, isAdmin: true, hasMemberId: true}), [
    'report',
    'block',
    'remove-post',
    'remove-member',
    'ban',
  ])
  // An admin can remove their own post through delete, not moderation.
  assert.deepEqual(offered({own: true, isAdmin: true, hasMemberId: true}), [])
  // With no member id there is nobody to name in a remove or a ban.
  assert.deepEqual(offered({own: false, isAdmin: true, hasMemberId: false}), [
    'report',
    'remove-post',
  ])
})

test('F2: a timeline row keeps the door member id, including a DID-shaped one', async () => {
  const {toMemberPostRows} = await import('#/screens/Community/memberRows')
  const [row] = toMemberPostRows([
    {items: [{id: 'p', text: 't', createdAt: '', authorId: 'did:plc:x'}]},
  ])
  assert.equal(row.memberId, 'did:plc:x')
})

test('F2: the post menu and the timeline use all of it', () => {
  const menu = readFileSync(
    'src/screens/Community/components/MemberPostMenu.tsx',
    'utf8',
  )
  for (const needle of [
    'moderationActionsFor(',
    'reportPost(',
    'removePost(',
    'removeMember(',
    'banMember(',
    'useBlockedMembers',
    'community.viewerIsAdmin',
  ]) {
    assert.ok(menu.includes(needle), needle)
  }
  const posts = readFileSync(
    'src/screens/Community/components/PostsSection.tsx',
    'utf8',
  )
  assert.ok(posts.includes('withoutBlocked('))
})
