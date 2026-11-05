/**
 * F1 (BLOCKER): "Members only" had no admission control. Decision D1 (assumed,
 * see the fix report): invite only. This covers the app half. The door has to
 * check the invite too, so the app also refuses to offer join until join-info
 * says the door enforces admission.
 */
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {afterEach, test} from 'node:test'

const client = await import('#/lib/agent-runtime/communitiesClient')
const consent = await import('#/screens/Community/consent')

const realFetch = globalThis.fetch
afterEach(() => {
  globalThis.fetch = realFetch
})

function stubFetch(status, body) {
  const calls = []
  globalThis.fetch = async (url, init) => {
    calls.push({url, init})
    return new Response(JSON.stringify(body), {status})
  }
  return calls
}

const OK_JOIN = {community: {id: 'c', name: 'C'}, joined: true}
const INFO = {wording_version: 2, admission: 'invite'}

test('F1: join sends the invite, and only the known fields', async () => {
  const calls = stubFetch(201, OK_JOIN)
  const res = await client.join('c', 2, 'inv-1')
  assert.equal(res.ok, true)
  assert.deepEqual(JSON.parse(calls[0].init.body), {
    consentVersion: 2,
    invite: 'inv-1',
  })
})

test('F1: join without an invite sends nothing', async () => {
  const calls = stubFetch(201, OK_JOIN)
  for (const bad of [undefined, '', '   ', 7]) {
    const res = await client.join('c', 2, bad)
    assert.equal(res.ok, false)
    assert.equal(res.error.kind, 'invalid_argument')
  }
  assert.equal(calls.length, 0)
})

test('F1: join-info keeps only a door that says it checks invites', async () => {
  stubFetch(200, INFO)
  assert.deepEqual((await client.getJoinInfo('c')).data, INFO)
  stubFetch(200, {wording_version: 2, admission: 'open'})
  assert.deepEqual((await client.getJoinInfo('c')).data, {wording_version: 2})
  stubFetch(200, {wording_version: 2})
  assert.deepEqual((await client.getJoinInfo('c')).data, {wording_version: 2})
})

test('F1: the invite param is cleaned before use', () => {
  assert.equal(consent.normalizeInvite(' abc-123 '), 'abc-123')
  assert.equal(consent.normalizeInvite(undefined), null)
  assert.equal(consent.normalizeInvite(''), null)
  assert.equal(consent.normalizeInvite('   '), null)
  assert.equal(consent.normalizeInvite(['a', 'b']), null)
  assert.equal(consent.normalizeInvite('a b'), null)
  assert.equal(consent.normalizeInvite('x'.repeat(513)), null)
})

test('F1: join is offered only with an invite and a door that checks it', () => {
  const gate = consent.admissionGateFor
  assert.deepEqual(gate(INFO, 'inv'), {kind: 'ok', invite: 'inv'})
  assert.deepEqual(gate(INFO, undefined), {kind: 'invite_required'})
  // Without the door's check, any string would pass, so "Members only" would
  // be untrue. An invite does not make up for that.
  assert.deepEqual(gate({wording_version: 2}, 'inv'), {kind: 'door_not_enforcing'})
  assert.deepEqual(gate({wording_version: 2}, undefined), {
    kind: 'door_not_enforcing',
  })
})

test('F1: agreeAndJoin refuses without an invite and never calls join', async () => {
  let joins = 0
  const out = await consent.agreeAndJoin(
    {id: 'c', consentVersion: '2', consented: true},
    {
      join: async () => {
        joins++
        return {ok: true, data: OK_JOIN}
      },
    },
  )
  assert.deepEqual(out, {ok: false, reason: 'no_invite'})
  assert.equal(joins, 0)
})

test('F1: an invite is still not consent', async () => {
  let joins = 0
  const out = await consent.agreeAndJoin(
    {id: 'c', consentVersion: '2', consented: false, invite: 'inv'},
    {
      join: async () => {
        joins++
        return {ok: true, data: OK_JOIN}
      },
    },
  )
  assert.deepEqual(out, {ok: false, reason: 'no_consent'})
  assert.equal(joins, 0)
})

test('F1: a door refusal reads as a bad invite, whatever the reason', async () => {
  for (const status of [403, 404, 410]) {
    const out = await consent.agreeAndJoin(
      {id: 'c', consentVersion: '2', consented: true, invite: 'inv'},
      {join: async () => ({ok: false, error: {kind: 'http', status}})},
    )
    assert.equal(out.ok, false)
    assert.equal(out.reason, 'invite_refused')
  }
  const out = await consent.agreeAndJoin(
    {id: 'c', consentVersion: '2', consented: true, invite: 'inv'},
    {join: async () => ({ok: false, error: {kind: 'network'}})},
  )
  assert.equal(out.reason, 'join_failed')
})

test('F1: the screen passes the invite and hides consent without one', () => {
  const src = readFileSync('src/screens/Community/JoinConsent.tsx', 'utf8')
  assert.ok(src.includes('normalizeInvite(route.params?.invite)'))
  assert.ok(src.includes('admissionGateFor('))
  assert.ok(src.includes('communityJoinInviteRequired'))
  assert.ok(src.includes('communityJoinNotOpen'))
  assert.ok(src.includes('invite: admission.invite'))
  assert.ok(!src.includes('deliberately never read'))
  // The two refusals come before the branch that renders the consent box.
  const box = src.indexOf('name="community_join_consent"')
  assert.ok(src.indexOf('communityJoinInviteRequired') < box)
  assert.ok(src.indexOf('communityJoinNotOpen') < box)
})
