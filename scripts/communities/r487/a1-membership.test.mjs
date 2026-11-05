/**
 * A1 and C11. The door sends no `role`, and `viewer_is_admin` only while its
 * admin role is on. With that role off, a real member must not read as a
 * non-member, and nobody may read as a member without the door or the join
 * record saying so. Runs the real descriptor and loader.
 */
import assert from 'node:assert/strict'
import {test} from 'node:test'

const {postsSource, toDescriptor} = await import('#/screens/Community/descriptor')
const access = await import('#/screens/Community/access')

const COMMUNITY = {
  id: 'c',
  name: 'C',
  description: null,
  accent: null,
  wording_version: 2,
}

function fakeClient({
  community = COMMUNITY,
  read = {ok: true, data: community},
  list = {ok: true, data: []},
} = {}) {
  const calls = []
  return {
    calls,
    client: {
      getCommunity: async id => {
        calls.push(['getCommunity', id])
        return read
      },
      listMyCommunities: async () => {
        calls.push(['listMyCommunities'])
        return list
      },
    },
  }
}

const load = client => access.readCommunityHome('c', client)
const NOT_FOUND = {kind: 'http', status: 404}

test('C11: a descriptor with nothing saying "member" is not a member', () => {
  const d = toDescriptor('c', COMMUNITY)
  assert.equal(d.isMember, false)
  assert.equal(postsSource(d), 'none')
})

test('C11: joined: false does not make a member', () => {
  assert.equal(toDescriptor('c', COMMUNITY, {joined: false}).isMember, false)
})

test('A1: the join record makes a member when the door omits viewer_is_admin', () => {
  const d = toDescriptor('c', COMMUNITY, {joined: true})
  assert.equal(d.isMember, true)
  assert.equal(postsSource(d), 'runtime')
})

test('A1: the join record gives membership and never admin', () => {
  assert.equal(
    toDescriptor('c', COMMUNITY, {joined: true}).viewerIsAdmin,
    false,
  )
})

test('A1: a joined member with viewer_is_admin omitted loads as a member', async () => {
  const {client} = fakeClient({list: {ok: true, data: [COMMUNITY]}})
  const res = await load(client)
  assert.equal(res.ok, true)
  assert.equal(res.data.isMember, true)
})

test('A1: someone the join record does not list loads as a non-member', async () => {
  const {client} = fakeClient({
    list: {ok: true, data: [{...COMMUNITY, id: 'other'}]},
  })
  const res = await load(client)
  assert.equal(res.ok, true)
  assert.equal(res.data.isMember, false)
})

test('A1: malformed join record rows do not make a member', async () => {
  const {client} = fakeClient({list: {ok: true, data: [null, 'c', 7, {}]}})
  const res = await load(client)
  assert.equal(res.ok, true)
  assert.equal(res.data.isMember, false)
})

for (const [label, error] of [
  ['a 500', {kind: 'http', status: 500}],
  ['a network failure', {kind: 'network'}],
  ['signed out', {kind: 'signed_out'}],
  ['a 403', {kind: 'http', status: 403}],
  ['a 404, which a door store failure also answers', NOT_FOUND],
]) {
  test(`A1: fails closed when the join record read gives ${label}`, async () => {
    const {client} = fakeClient({list: {ok: false, error}})
    const res = await load(client)
    // No descriptor means no member content, no wall and no Join button.
    assert.equal(res.ok, false)
    // A refusal would show the Join button. This is "we don't know".
    assert.equal(access.isMembershipRefusal(res.error), false)
  })
}

test('A1: the door refusing GET /:id stays a refusal and skips the join record', async () => {
  const {calls, client} = fakeClient({read: {ok: false, error: NOT_FOUND}})
  const res = await load(client)
  assert.equal(res.ok, false)
  assert.equal(access.isMembershipRefusal(res.error), true)
  assert.deepEqual(calls, [['getCommunity', 'c']])
})

for (const viewerIsAdmin of [true, false]) {
  test(`A1: viewerIsAdmin ${viewerIsAdmin} needs no join record read`, async () => {
    const {calls, client} = fakeClient({
      community: {...COMMUNITY, viewerIsAdmin},
    })
    const res = await load(client)
    assert.equal(res.ok, true)
    assert.equal(res.data.isMember, true)
    assert.equal(res.data.viewerIsAdmin, viewerIsAdmin)
    assert.deepEqual(calls, [['getCommunity', 'c']])
  })
}

test('A1: a door role needs no join record read', async () => {
  const {calls, client} = fakeClient({community: {...COMMUNITY, role: 'member'}})
  const res = await load(client)
  assert.equal(res.ok, true)
  assert.equal(res.data.isMember, true)
  assert.deepEqual(calls, [['getCommunity', 'c']])
})

test('A1: the default client reads the real door routes', async () => {
  const urls = []
  const realFetch = globalThis.fetch
  globalThis.fetch = async url => {
    urls.push(new URL(url).pathname)
    const body = url.endsWith('/communities')
      ? {communities: [COMMUNITY]}
      : {community: COMMUNITY}
    return new Response(JSON.stringify(body), {status: 200})
  }
  try {
    const res = await access.readCommunityHome('c')
    assert.equal(res.ok, true)
    assert.equal(res.data.isMember, true)
    assert.deepEqual(urls, ['/app/communities/c', '/app/communities'])
  } finally {
    globalThis.fetch = realFetch
  }
})
