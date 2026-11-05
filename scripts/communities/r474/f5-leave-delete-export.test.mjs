/**
 * F5 (HIGH): leave, delete and export existed only in the client API. The
 * runtime keeps the agent grant after a leave (runtime MEDIUM-1, still open), so
 * leaving turns the grant off first.
 */
import assert from 'node:assert/strict'
import {existsSync, readFileSync} from 'node:fs'
import {test} from 'node:test'

const actions = await import('#/screens/Community/memberActions').catch(
  () => ({}),
)

function fakeClient({grant, leave} = {}) {
  const calls = []
  return {
    calls,
    client: {
      setAgentGrant: async (id, on) => {
        calls.push(['grant', id, on])
        return grant ?? {ok: true, data: {communityId: id, on}}
      },
      leave: async id => {
        calls.push(['leave', id])
        return leave ?? {ok: true, data: null}
      },
    },
  }
}

test('F5: leaving turns the agent grant off, then leaves', async () => {
  const {calls, client} = fakeClient()
  const out = await actions.leaveCommunity('c', client)
  assert.deepEqual(out, {ok: true})
  assert.deepEqual(calls, [
    ['grant', 'c', false],
    ['leave', 'c'],
  ])
})

test('F5: no leave if the grant could not be turned off', async () => {
  const {calls, client} = fakeClient({
    grant: {ok: false, error: {kind: 'network'}},
  })
  const out = await actions.leaveCommunity('c', client)
  assert.deepEqual(out, {ok: false, reason: 'grant_off_failed'})
  assert.deepEqual(calls, [['grant', 'c', false]])
})

test('F5: a 404 on the grant route (agent flag off) does not stop a leave', async () => {
  const {calls, client} = fakeClient({
    grant: {ok: false, error: {kind: 'http', status: 404}},
  })
  assert.deepEqual(await actions.leaveCommunity('c', client), {ok: true})
  assert.equal(calls.length, 2)
})

test('F5: a failed leave is reported', async () => {
  const {client} = fakeClient({leave: {ok: false, error: {kind: 'network'}}})
  assert.deepEqual(await actions.leaveCommunity('c', client), {
    ok: false,
    reason: 'leave_failed',
  })
})

test('F5: own posts are matched by DID, and by handle only with no DID', () => {
  const me = {did: 'did:plc:me', handle: 'me.test'}
  const own = actions.isOwnPost
  assert.equal(own({author: {did: 'did:plc:me'}, authorHandle: 'x.test'}, me), true)
  assert.equal(own({author: {did: 'did:plc:other'}, authorHandle: 'me.test'}, me), false)
  assert.equal(own({author: {}, authorHandle: 'me.test'}, me), true)
  assert.equal(own({author: {}, authorHandle: 'x.test'}, me), false)
  assert.equal(own({author: {}}, me), false)
  assert.equal(own({author: {}, authorHandle: 'me.test'}, undefined), false)
})

test('F5: the export text holds the community id and items', () => {
  const text = actions.exportText({communityId: 'c', items: [{id: 'p1'}]})
  assert.deepEqual(JSON.parse(text), {communityId: 'c', items: [{id: 'p1'}]})
})

test('F5: the community home has real callers for leave, delete and export', () => {
  const section = 'src/screens/Community/components/MemberActionsSection.tsx'
  const menu = 'src/screens/Community/components/MemberPostMenu.tsx'
  assert.ok(existsSync(section))
  assert.ok(existsSync(menu))
  const s = readFileSync(section, 'utf8')
  assert.ok(s.includes('leaveCommunity('))
  assert.ok(s.includes('exportMine('))
  assert.ok(readFileSync(menu, 'utf8').includes('deleteMine('))
  assert.ok(
    readFileSync('src/screens/Community/index.tsx', 'utf8').includes(
      '<MemberActionsSection',
    ),
  )
  assert.ok(
    readFileSync(
      'src/screens/Community/components/PostsSection.tsx',
      'utf8',
    ).includes('<MemberPostMenu'),
  )
})
