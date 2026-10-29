// Generates door.json: the real responses of the runtime's community door
// (authority-one-runtime src/communities/door.js), produced by running that
// door with the same in-memory store harness the runtime's own door tests use
// (test/communities-agent-slot-fb477fb1.test.js, fakeWorld + setup). Nothing
// in door.json is hand-written: every body is what handleCommunities answered.
//
// Usage (from a checkout or `git archive` of the runtime at SOURCE_COMMIT):
//   node src/lib/communities/__fixtures__/door/generate.mjs <runtimeRoot> > door.json
//
// Not run by jest. Re-run it against a newer runtime commit to refresh the
// contract, and update SOURCE_COMMIT in the output.
import {pathToFileURL} from 'node:url'
import path from 'node:path'

const SOURCE_COMMIT = '7f436b820e5e1b4d4bfc89a8dabb3e27e79bbaf0'
const SOURCE_REF = 'origin/deploy/dev-communities'

// Item ids end in random bytes; fix them so the output is stable.
let byte = 0
globalThis.crypto.getRandomValues = arr => {
  for (let i = 0; i < arr.length; i++) arr[i] = byte++ & 0xff
  return arr
}

const root = process.argv[2]
if (!root) throw new Error('usage: generate.mjs <runtimeRoot>')
const load = p => import(pathToFileURL(path.join(root, p)).href)
const {handleCommunities, newItemId} = await load(
  'src/communities/door.js',
)
const {communityKeys: K} = await load('src/communities/keys.js')

const TENANT = 'tenant-a'
const C = 'garden'
// Fake DIDs only (the runtime test's fixture values).
const AGENT_DID = 'did:plc:gardenagentfixture'
const SPONSOR_DID = 'did:plc:gardensponsorfixture'
const ALICE = 'alice-agent'
const BOB = 'bob-agent'

// Every flag the app reads on: the agent slot, the grant and the admin role.
const CFG = {
  enabled: true,
  directory: {[C]: TENANT},
  communityAgent: {enabled: true},
  agentGrant: {enabled: true},
  admins: {enabled: true},
}
const CONFIG = {
  name: 'Garden club',
  description: 'A members-only garden club',
  accent: '#2f7d4f',
  wording_version: 3,
  agent: AGENT_DID,
  agentSponsor: SPONSOR_DID,
  tier: 'members',
  consentVersion: 3,
}

const tenants = new Map()
const storeOf = tenantId => {
  if (!tenants.has(tenantId)) tenants.set(tenantId, new Map())
  return tenants.get(tenantId)
}
const getStore = (_env, tenantId) => {
  const m = storeOf(tenantId)
  return {
    async put(k, v) {
      m.set(k, structuredClone(v))
    },
    async get(k) {
      return m.has(k) ? structuredClone(m.get(k)) : null
    },
    async list(prefix) {
      return new Map([...m].filter(([k]) => k.startsWith(prefix)))
    },
    async delete(k) {
      m.delete(k)
    },
  }
}
const seed = (k, v) => storeOf(TENANT).set(k, v)

seed(K.config(C), CONFIG)
seed(K.member(C, ALICE), {
  tenantId: TENANT,
  communityId: C,
  memberId: ALICE,
  // Already recorded, as onMemberAccess would leave it, so the read needs no
  // membership commit (the fake store has no commitMembership).
  did: 'did:plc:memberaliceagent',
  consentVersion: 3,
  role: 'admin',
})
seed(K.member(C, BOB), {
  tenantId: TENANT,
  communityId: C,
  memberId: BOB,
  did: 'did:plc:memberbobagent',
  consentVersion: 3,
})

const resolvePrincipal = async request => {
  const a = (request.headers.get('authorization') || '').replace(
    /^Bearer\s+/i,
    '',
  )
  if (!a.startsWith('tok-')) return {role: 'anon'}
  return {
    role: 'customer',
    account: a.slice(4),
    did: 'did:plc:member' + a.slice(4).replace(/[^a-z]/g, ''),
    via: 'atproto',
  }
}

let clock = Date.parse('2026-10-29T18:00:00.000Z')
const deps = {
  getStore,
  resolvePrincipal,
  readConfig: async () => CFG,
  now: () => (clock += 1000),
  notFound: () => Response.json({error: 'not found'}, {status: 404}),
}

async function call(method, p, {as = ALICE, body} = {}) {
  const h = new Headers({authorization: `Bearer tok-${as}`})
  if (body !== undefined) h.set('content-type', 'application/json')
  const url = new URL(`https://rt.example${p}`)
  const req = new Request(url, {
    method,
    headers: h,
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const res = await handleCommunities(req, {}, url, deps)
  const json = await res.json()
  if (res.status >= 400) throw new Error(`${method} ${p}: ${res.status}`)
  return json
}

const base = `/app/communities/${C}`
const post = await call('POST', `${base}/posts`, {
  body: {text: 'First post in the garden'},
})
const reply = await call('POST', `${base}/posts/${post.item.id}/replies`, {
  as: BOB,
  body: {text: 'A reply from Bob'},
})
// An agent item, stored exactly as the runtime's agent executor writes it
// (agent-slot.js, the `item` built for an approved proposal).
const agentId = newItemId((clock += 1000))
seed(K.item(C, agentId), {
  id: agentId,
  tenantId: TENANT,
  communityId: C,
  parentId: post.item.id,
  authorId: 'community-agent',
  agentDid: AGENT_DID,
  authorDid: AGENT_DID,
  text: 'From the garden notes: plant garlic before the first frost.',
  sources: [
    {
      title: 'Garden notes',
      kind: 'episode transcript',
      ref: 'https://example.test/notes/1',
      at: '2026-10-01T00:00:00.000Z',
    },
  ],
  tier: 'members',
  via: 'approval',
  createdAt: new Date(clock).toISOString(),
})
// An item written before R3 (no stored authorDid): author.did is null.
const legacyId = newItemId((clock += 1000))
seed(K.item(C, legacyId), {
  id: legacyId,
  tenantId: TENANT,
  communityId: C,
  parentId: null,
  authorId: BOB,
  text: 'An older post with no stored author DID',
  createdAt: new Date(clock).toISOString(),
})

const out = {
  $source: {
    repo: 'authority-one-runtime',
    ref: SOURCE_REF,
    commit: SOURCE_COMMIT,
    module: 'src/communities/door.js',
    harness:
      'test/communities-agent-slot-fb477fb1.test.js (fakeWorld/setup), flags: communities.enabled, communityAgent, agentGrant, admins all on',
    generator: 'src/lib/communities/__fixtures__/door/generate.mjs',
  },
  list: await call('GET', '/app/communities'),
  listAsMember: await call('GET', '/app/communities', {as: BOB}),
  community: await call('GET', base),
  joinInfo: await call('GET', `${base}/join-info`),
  post,
  reply,
  timeline: await call('GET', `${base}/timeline`),
  export: await call('GET', `${base}/export`),
  roster: await call('GET', `${base}/posts/${post.item.id}/roster`),
  grant: await call('GET', `${base}/agent-grant`),
}
process.stdout.write(JSON.stringify(out, null, 2) + '\n')
