/**
 * D1 (open join) and F1 (app half). Anyone can join: no invite, no approval. The
 * consent step stays, and the door can still refuse. Screen wiring is checked
 * as source text, because JSX cannot load without dependencies.
 */
import assert from 'node:assert/strict'
import {existsSync, readFileSync} from 'node:fs'
import {test} from 'node:test'

const consent = await import('#/screens/Community/consent')
const access = await import('#/screens/Community/access').catch(() => ({}))

const read = p => readFileSync(`src/screens/Community/${p}`, 'utf8')
const withoutDocComments = s => s.replace(/\/\*\*[\s\S]*?\*\//g, '')
const JOINED = {community: {id: 'c', name: 'C'}, joined: true}

function fakeClient(result = {ok: true, data: JOINED}) {
  const calls = []
  return {
    calls,
    client: {
      join: async (...args) => {
        calls.push(['join', ...args])
        return result
      },
      setAgentGrant: async (...args) => {
        calls.push(['grant', ...args])
        return {ok: true, data: {communityId: 'c', on: true}}
      },
    },
  }
}

const joinWith = c =>
  consent.agreeAndJoin({id: 'c', consentVersion: '2', consented: true}, c)

test('D1: open join needs only consent, with no invite and no approval', async () => {
  const {calls, client: c} = fakeClient()
  const out = await joinWith(c)
  assert.equal(out.ok, true)
  assert.deepEqual(calls, [['join', 'c', 2]])
})

test('D1: the join request body holds the consent version and nothing else', async () => {
  const sent = []
  const realFetch = globalThis.fetch
  globalThis.fetch = async (url, init) => {
    sent.push({url, init})
    return new Response(JSON.stringify(JOINED), {status: 200})
  }
  try {
    const out = await consent.agreeAndJoin({
      id: 'c',
      consentVersion: consent.CONSENT_WORDING_VERSION,
      consented: true,
    })
    assert.equal(out.ok, true)
  } finally {
    globalThis.fetch = realFetch
  }
  assert.equal(sent.length, 1)
  assert.ok(sent[0].url.endsWith('/app/communities/c/join'))
  assert.equal(sent[0].init.method, 'POST')
  assert.deepEqual(JSON.parse(sent[0].init.body), {consentVersion: 2})
})

test('D1: the consent step stays: no tick, no join', async () => {
  const {calls, client: c} = fakeClient()
  const out = await consent.agreeAndJoin(
    {id: 'c', consentVersion: '2', consented: false},
    c,
  )
  assert.deepEqual(out, {ok: false, reason: 'no_consent'})
  assert.deepEqual(calls, [])
})

test('D1: the join screen ignores an invite and asks for no approval', () => {
  const screen = withoutDocComments(read('JoinConsent.tsx'))
  assert.ok(!/params\??\.invite/.test(screen))
  assert.ok(!/approval/i.test(screen))
  assert.ok(!/invite/i.test(withoutDocComments(read('consent.ts'))))
})

test('D1: the home Join button goes to the join screen, not the holding sheet', () => {
  assert.equal(
    existsSync('src/screens/Community/components/JoinConsentEntry.tsx'),
    false,
  )
  const home = read('index.tsx')
  assert.ok(!home.includes('JoinConsentEntry'))
  assert.ok(home.includes("navigate('CommunityJoin', {id"))
})

test('F1: a refusal from the door is told apart from a failure', async () => {
  for (const status of [400, 403, 404, 409]) {
    const {client: c} = fakeClient({ok: false, error: {kind: 'http', status}})
    const out = await joinWith(c)
    assert.equal(out.ok, false)
    assert.equal(out.reason, 'refused', `status ${status}`)
  }
  for (const error of [
    {kind: 'http', status: 500},
    {kind: 'http', status: 429},
    {kind: 'network'},
    {kind: 'bad_response'},
  ]) {
    const {client: c} = fakeClient({ok: false, error})
    const out = await joinWith(c)
    assert.equal(out.reason, 'join_failed', JSON.stringify(error))
  }
})

test('F1: a 2xx that says joined: false is a refusal, not a welcome', async () => {
  const {client: c} = fakeClient({
    ok: true,
    data: {community: {id: 'c', name: 'C'}, joined: false},
  })
  const out = await joinWith(c)
  assert.equal(out.ok, false)
  assert.equal(out.reason, 'refused')
})

test('F1: the join screen shows the refusal apart from the retry message', () => {
  const screen = read('JoinConsent.tsx')
  assert.ok(screen.includes('communityJoinRefused'))
  assert.ok(screen.includes("outcome.reason === 'refused'"))
})

test('F1: a door refusal of a member read counts as not a member', () => {
  const refused = access.isMembershipRefusal
  assert.equal(refused({kind: 'http', status: 403}), true)
  assert.equal(refused({kind: 'http', status: 404}), true)
  assert.equal(refused({kind: 'http', status: 500}), false)
  assert.equal(refused({kind: 'network'}), false)
  assert.equal(refused(undefined), false)
})

test('F1: member content shows only for a member the door has not refused', () => {
  const show = access.canShowMemberContent
  const member = {tier: 'members', isMember: true}
  assert.equal(show(member, undefined), true)
  assert.equal(show(member, {kind: 'network'}), true)
  assert.equal(show(member, {kind: 'http', status: 403}), false)
  assert.equal(show(member, {kind: 'http', status: 404}), false)
  assert.equal(show({tier: 'members', isMember: false}, undefined), false)
  assert.equal(show({tier: 'paid', isMember: false}, undefined), false)
  assert.equal(show({tier: 'public', isMember: true}, undefined), false)
})

test('F1: posts and the roster are behind that check', () => {
  assert.ok(
    read('components/PostsSection.tsx').includes('canShowMemberContent('),
  )
  assert.ok(
    read('components/MembersSection.tsx').includes('canShowMemberContent('),
  )
})

test('F1: a refused home offers the join screen and drops cached member content', () => {
  const home = read('index.tsx')
  assert.ok(home.includes('isMembershipRefusal('))
  assert.ok(home.includes('communityNotMember'))
  assert.ok(home.includes('removeCommunityMemberContent('))
})

test('F1: joining refreshes the home, so a cached refusal does not outlive it', () => {
  const screen = read('JoinConsent.tsx')
  assert.ok(screen.includes('createCommunityQueryKey('))
  assert.ok(screen.includes('createMyCommunitiesQueryKey('))
})
