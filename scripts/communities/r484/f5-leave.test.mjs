/**
 * F5 (app half). Leaving turns the grant off first and stops if that fails. The
 * first two cases were already met by round 474; they are kept so the behaviour
 * stays pinned. The runtime half (leave deletes the grant) is a separate task.
 */
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {test} from 'node:test'

const {leaveCommunity} = await import('#/screens/Community/memberActions')
const read = p => readFileSync(`src/screens/Community/${p}`, 'utf8')

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

test('F5: the grant goes off first, then the leave path is called', async () => {
  const {calls, client} = fakeClient()
  assert.deepEqual(await leaveCommunity('c', client), {ok: true})
  assert.deepEqual(calls, [
    ['grant', 'c', false],
    ['leave', 'c'],
  ])
})

test('F5: a failed grant-off stops the leave', async () => {
  for (const error of [
    {kind: 'network'},
    {kind: 'signed_out'},
    {kind: 'bad_response'},
    {kind: 'http', status: 500},
    {kind: 'http', status: 403},
  ]) {
    const {calls, client} = fakeClient({grant: {ok: false, error}})
    assert.deepEqual(await leaveCommunity('c', client), {
      ok: false,
      reason: 'grant_off_failed',
    })
    assert.deepEqual(calls, [['grant', 'c', false]])
  }
})

test('F5: a door that answers the grant is still on stops the leave', async () => {
  const {calls, client} = fakeClient({
    grant: {ok: true, data: {communityId: 'c', on: true}},
  })
  assert.deepEqual(await leaveCommunity('c', client), {
    ok: false,
    reason: 'grant_off_failed',
  })
  assert.deepEqual(calls, [['grant', 'c', false]])
})

test('F5: when only the leave fails, the home learns the grant is now off', () => {
  const section = read('components/MemberActionsSection.tsx')
  assert.ok(section.includes('createCommunityAgentGrantQueryKey('))
  assert.ok(/setQueryData\([\s\S]*?false,?\s*\)/.test(section))
  // The row keeps its value in state, so it must remount on a new value.
  assert.ok(
    read('components/AgentGrantSection.tsx').includes('key={String(on)}'),
  )
})

test('F5: a leave clears the grant and roster caches as well as the posts', () => {
  const section = read('components/MemberActionsSection.tsx')
  assert.ok(section.includes('removeCommunityMemberContent('))
  const queries = read('queries.ts')
  const fn = queries.slice(
    queries.indexOf('export function removeCommunityMemberContent'),
  )
  for (const root of [
    'createCommunityTimelineQueryKey',
    'createCommunityAgentGrantQueryKey',
    "'communityRoster'",
  ]) {
    assert.ok(fn.includes(root), root)
  }
})
