/* eslint-disable import-x/no-nodejs-modules, @typescript-eslint/no-unsafe-member-access -- Node-side source-reading test over raw lexicon JSON */
import {spawnSync} from 'node:child_process'
import {createHash} from 'node:crypto'
import {existsSync, readdirSync, readFileSync} from 'node:fs'
import path from 'node:path'

import {describe, expect, it} from '@jest/globals'

import {type ComAuthorityoneGroupDefs} from '#/lib/lexicon/generated'
import {
  type AdmissionPolicy,
  type GroupRole,
  type GroupView,
  type GroupVisibility,
  type MembershipStatus,
  type MemberView,
  type PostingPolicy,
} from '#/state/queries/group'

const root = path.resolve(__dirname, '../../../..')
const lexiconDir = path.join(root, 'lexicons')
// git may check these out with CRLF on Windows; compare on LF.
const read = (p: string) =>
  readFileSync(path.join(root, p), 'utf8').replace(/\r\n/g, '\n')

function listJson(dir: string): string[] {
  return readdirSync(dir, {withFileTypes: true}).flatMap(e => {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) return listJson(p)
    return e.name.endsWith('.json') ? [p] : []
  })
}

const nsidToPath = (nsid: string) =>
  path.join(lexiconDir, ...nsid.split('.')) + '.json'

describe('lexicon codegen', () => {
  // Also the validity check: lexgen fails on any lexicon lex-cli rejects.
  it('generated code matches the lexicons (pnpm lexgen leaves no diff)', () => {
    const res = spawnSync(
      process.execPath,
      [path.join(root, 'scripts', 'lexgen.mjs'), '--check'],
      {cwd: root, encoding: 'utf8'},
    )
    expect(res.stderr).toBe('')
    expect(res.status).toBe(0)
  })
})

describe('lexicon files', () => {
  const files = listJson(lexiconDir)

  it('every file is a lexicon whose id matches its path', () => {
    expect(files.length).toBe(12)
    for (const file of files) {
      const doc = JSON.parse(readFileSync(file, 'utf8'))
      expect(doc.lexicon).toBe(1)
      expect(nsidToPath(doc.id)).toBe(file)
    }
  })

  it('every NSID constant in group.ts has a lexicon file', () => {
    const src = read('src/state/queries/group.ts')
    const nsids = [
      ...src.matchAll(/export const GROUP_\w+ = '([a-z.]+)'/gi),
    ].map(m => m[1])
    expect(nsids).toEqual([
      'com.authorityone.group.profile',
      'com.authorityone.group.membership',
      'com.authorityone.group.post',
      'com.authorityone.group.invite',
    ])
    for (const nsid of nsids) {
      expect(existsSync(nsidToPath(nsid))).toBe(true)
    }
  })

  it('every XRPC method group.ts calls has a lexicon file', () => {
    const src = read('src/state/queries/group.ts')
    const methods = new Set(
      [...src.matchAll(/'(com\.authorityone\.group\.get\w+)'/g)].map(m => m[1]),
    )
    expect(methods.size).toBeGreaterThan(0)
    for (const nsid of methods) {
      expect(existsSync(nsidToPath(nsid))).toBe(true)
    }
  })

  // sha256 (LF) of the spike copies carried over unchanged. defs.json and
  // getMemberships.json are intentionally absent - see lexicons/README.md.
  it.each([
    ['ban', '67f2819e5736bfa339c87e76d4386e70d881eab40f73cdc3dbaec8ce917c106f'],
    [
      'getGroup',
      '86f27148532813aedc95081080adbae5a75b6bea6cb0a335f7a92f19fd95cf0f',
    ],
    [
      'getMembers',
      '1b65409e1ac3829c41c5d3c19d5581bc6b6bbae93bed1f1104bc53f4acb4e06b',
    ],
    [
      'getTimeline',
      '258cbb9e3105c656d423f1b1108cf046064aac5e3c7e0903eda4e7e03ea45ecd',
    ],
    [
      'invite',
      'd1ba7845f557196719e8c6995d01c96a9d9f5f09143cea41f5b299cd6a189adf',
    ],
    [
      'membership',
      'bd74b7819b9ab5427261510563e0d6b75de25511b750408ea0fe5e441b90f21d',
    ],
    [
      'post',
      '678fa536825aac19e384d909836ab76db4c838d4a8dabfed96c4056fa0e10c2f',
    ],
    [
      'profile',
      'cd90d74c4db5815d677ea4a70d9de283e512e6525303bb2416213bd2370e4d68',
    ],
    [
      'searchGroups',
      '0d4677be3eb3f8a26c8446fe757e533c333217909d3794a06163a3aea0c1b8af',
    ],
  ])('group/%s.json is byte-identical to the spike copy', (name, sha) => {
    const body = read(`lexicons/com/authorityone/group/${name}.json`)
    expect(createHash('sha256').update(body).digest('hex')).toBe(sha)
  })

  it('carries only the two documented validity fixes in defs/getMemberships', () => {
    const defs = JSON.parse(read('lexicons/com/authorityone/group/defs.json'))
    expect(defs.defs.groupViewBasic.properties.creator).toEqual(
      defs.defs.groupView.properties.creator,
    )
    expect(defs.defs.membershipView.required).toEqual([
      'group',
      'role',
      'status',
    ])
    const getMemberships = JSON.parse(
      read('lexicons/com/authorityone/group/getMemberships.json'),
    )
    expect(
      getMemberships.defs.main.output.schema.properties.memberships.items,
    ).toEqual({type: 'ref', ref: 'com.authorityone.group.defs#membershipView'})
  })
})

describe('com.authorityone.community.config (draft)', () => {
  const doc = JSON.parse(
    read('lexicons/com/authorityone/community/config.json'),
  )
  const record = doc.defs.main.record

  it('is a draft singleton record', () => {
    expect(doc.description).toContain('"draft": true')
    expect(doc.defs.main.type).toBe('record')
    expect(doc.defs.main.key).toBe('literal:self')
  })

  it('requires only community, tier and consentVersion', () => {
    expect([...record.required].sort()).toEqual([
      'community',
      'consentVersion',
      'tier',
    ])
    expect(record.properties.community.ref).toBe('com.atproto.repo.strongRef')
    expect(record.properties.consentVersion.type).toBe('integer')
    expect(record.properties.tier.knownValues).toEqual([
      'com.authorityone.community.config#public',
      'com.authorityone.community.config#members',
      'com.authorityone.community.config#paid',
    ])
    expect(record.properties.listing.knownValues).toEqual([
      'com.authorityone.community.config#listed',
      'com.authorityone.community.config#unlisted',
    ])
  })

  it('has every field from the plan', () => {
    expect(Object.keys(record.properties).sort()).toEqual(
      [
        'community',
        'tier',
        'listing',
        'theme',
        'brand',
        'agent',
        'agentSponsor',
        'moderation',
        'ageNotice',
        'consentVersion',
      ].sort(),
    )
    expect(Object.keys(doc.defs.theme.properties).sort()).toEqual(
      ['primary', 'accent', 'background', 'logo', 'icon', 'wordmark'].sort(),
    )
    expect(doc.defs.theme.properties.logo.type).toBe('blob')
    expect(doc.defs.theme.properties.icon.type).toBe('blob')
    expect(Object.keys(doc.defs.brand.properties).sort()).toEqual(
      [
        'displayName',
        'legalName',
        'supportUrl',
        'termsUrl',
        'privacyUrl',
      ].sort(),
    )
    expect(Object.keys(doc.defs.moderation.properties).sort()).toEqual(
      ['labelers', 'reportTo', 'rulesUrl'].sort(),
    )
  })

  it('members-only posts have no lexicon', () => {
    const community = listJson(
      path.join(lexiconDir, 'com', 'authorityone', 'community'),
    )
    expect(community.map(f => path.basename(f))).toEqual(['config.json'])
  })
})

// Compile-time only (checked by `pnpm typecheck`): the names group.ts has
// always exported are the generated lexicon types.
type Equals<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2
    ? true
    : false
const typeChecks: [
  Equals<GroupView, ComAuthorityoneGroupDefs.GroupView>,
  Equals<MemberView, ComAuthorityoneGroupDefs.MemberView>,
  Equals<GroupVisibility, ComAuthorityoneGroupDefs.Visibility>,
  Equals<AdmissionPolicy, ComAuthorityoneGroupDefs.AdmissionPolicy>,
  Equals<PostingPolicy, ComAuthorityoneGroupDefs.PostingPolicy>,
  Equals<GroupRole, ComAuthorityoneGroupDefs.Role>,
  Equals<MembershipStatus, ComAuthorityoneGroupDefs.MembershipStatus>,
] = [true, true, true, true, true, true, true]
void typeChecks
