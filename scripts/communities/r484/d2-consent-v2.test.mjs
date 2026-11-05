/**
 * D2 Option A. The agent toggle leaves the join screen, the grant stays on the
 * community home row, and the consent version moves from 1 to 2.
 */
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {test} from 'node:test'

const consent = await import('#/screens/Community/consent')
const read = p => readFileSync(`src/screens/Community/${p}`, 'utf8')

test('D2: this build ships consent version 2 and only version 2', () => {
  assert.equal(consent.CONSENT_WORDING_VERSION, '2')
  assert.deepEqual([...consent.SUPPORTED_CONSENT_VERSIONS], ['2'])
})

test('D2: join consent is recorded as version 2', async () => {
  const calls = []
  const out = await consent.agreeAndJoin(
    {id: 'c', consentVersion: '2', consented: true},
    {
      join: async (...args) => {
        calls.push(args)
        return {ok: true, data: {community: {id: 'c', name: 'C'}, joined: true}}
      },
    },
  )
  assert.equal(out.ok, true)
  assert.deepEqual(calls, [['c', 2]])
})

test('D2: the gate offers join for version 2 and fails closed on version 1', () => {
  assert.deepEqual(consent.consentGateFor({wording_version: 2}), {
    kind: 'ok',
    version: '2',
  })
  assert.deepEqual(consent.consentGateFor({wording_version: 1}), {
    kind: 'unsupported',
    version: '1',
  })
  assert.deepEqual(consent.consentGateFor({wording_version: null}), {
    kind: 'missing',
  })
})

test('D2: a version 1 join never reaches the door', async () => {
  let called = false
  const out = await consent.agreeAndJoin(
    {id: 'c', consentVersion: '1', consented: true},
    {
      join: async () => {
        called = true
      },
    },
  )
  assert.deepEqual(out, {ok: false, reason: 'unsupported_version'})
  assert.equal(called, false)
})

test('D2: joining never sets the agent grant, whatever a caller passes', async () => {
  const calls = []
  await consent.agreeAndJoin(
    {id: 'c', consentVersion: '2', consented: true, agentGrant: true},
    {
      join: async () => ({
        ok: true,
        data: {community: {id: 'c', name: 'C'}, joined: true},
      }),
      setAgentGrant: async (...args) => {
        calls.push(args)
        return {ok: true, data: {communityId: 'c', on: true}}
      },
    },
  )
  assert.deepEqual(calls, [])
})

test('D2: the agent toggle is absent from the join screen', () => {
  const screen = read('JoinConsent.tsx')
  assert.ok(!screen.includes('community_agent_grant'))
  assert.ok(!screen.includes('useOwnerAgentsQuery'))
  assert.ok(!screen.includes('read this community for me'))
  assert.ok(!read('consent.ts').includes('setAgentGrant'))
})

test('D2: the version 2 wording says the agent gets no access from joining', () => {
  assert.ok(
    read('JoinConsent.tsx').includes('Access for this community’s agent'),
  )
})

test('D2: the grant stays on the community home row', () => {
  assert.ok(read('components/AgentGrantSection.tsx').includes('<AgentGrantRow'))
  assert.ok(read('index.tsx').includes('<AgentGrantSection'))
})
