/**
 * F3 (BLOCKER): the join screen named the person's own agent while the call
 * granted the community's agent. Decision D2 (assumed, see the fix report): the
 * grant means the community agent, and a non-member's join-info cannot say
 * whether there is one, so the grant is not offered at join at all.
 */
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {test} from 'node:test'

const consent = await import('#/screens/Community/consent')
const grantState = await import('#/screens/Community/agentGrantState')
  .catch(() => ({}))

const joinScreen = () =>
  readFileSync('src/screens/Community/JoinConsent.tsx', 'utf8')

function fakeClient() {
  const calls = {join: [], grant: []}
  return {
    calls,
    client: {
      join: async (...a) => {
        calls.join.push(a)
        return {ok: true, data: {community: {id: 'c', name: 'C'}, joined: true}}
      },
      setAgentGrant: async (...a) => {
        calls.grant.push(a)
        return {ok: true, data: {communityId: 'c', on: true}}
      },
    },
  }
}

test('F3: joining never sets an agent grant, even if a caller asks for one', async () => {
  const {calls, client} = fakeClient()
  const version = consent.CONSENT_WORDING_VERSION
  await consent.agreeAndJoin(
    {
      id: 'c',
      consentVersion: version,
      consented: true,
      agentGrant: true,
      invite: 'inv',
    },
    client,
  )
  assert.deepEqual(calls.grant, [])
})

test('F3: the new wording is a new consent version, and the old one is refused', () => {
  assert.equal(consent.CONSENT_WORDING_VERSION, '2')
  assert.equal(consent.consentGateFor({wording_version: 1}).kind, 'unsupported')
})

test('F3: the join screen no longer offers or names the person\'s own agent', () => {
  const src = joinScreen()
  assert.ok(!src.includes('useOwnerAgentsQuery'))
  assert.ok(!src.includes('myAgentName'))
  assert.ok(!src.includes('community_agent_grant'))
  assert.ok(!src.includes('read this community for me'))
})

test('F3: the join screen says the community agent gets nothing at join', () => {
  const src = joinScreen()
  assert.ok(src.includes('Access for this community’s agent'))
})

test('F3: a failed grant read shows an error, not a hidden row', () => {
  const state = grantState.agentGrantSectionState
  assert.equal(typeof state, 'function')
  const base = {isMember: true, agentDid: 'did:plc:a'}
  assert.equal(state({...base, on: undefined, isError: true}), 'error')
  assert.equal(state({...base, on: undefined, isError: false}), 'loading')
  assert.equal(state({...base, on: false, isError: false}), 'row')
  assert.equal(state({...base, on: true, isError: true}), 'row')
  assert.equal(state({...base, agentDid: undefined, on: undefined, isError: false}), 'hidden')
  assert.equal(state({...base, isMember: false, on: undefined, isError: false}), 'hidden')
  const src = readFileSync(
    'src/screens/Community/components/AgentGrantSection.tsx',
    'utf8',
  )
  assert.ok(src.includes('agentGrantSectionState('))
  assert.ok(src.includes('communityAgentGrantReadError'))
})
