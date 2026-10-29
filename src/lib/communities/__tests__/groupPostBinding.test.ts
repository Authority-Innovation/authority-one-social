/* eslint-disable import-x/no-nodejs-modules -- reads the lexicon JSON from disk */
import {readFileSync} from 'node:fs'
import path from 'node:path'

import {describe, expect, it, jest} from '@jest/globals'

import {
  buildGroupPostBindingWrite,
  findCidMismatches,
  isWellFormedGroupPostBinding,
} from '#/lib/communities/groupPostBinding'
import {
  GROUP_POST_LEXICON,
  validateGroupPostRecord,
} from '#/lib/communities/groupPostBindingLexicon'

// The repo-wide __mocks__ stub multiformats/cid; lexicon validation of a
// `cid` field needs the real parser.
jest.mock('multiformats/cid', () => jest.requireActual('multiformats/cid'))

const DID = 'did:plc:author'
const CID_A = 'bafyreie5737gdxlw5i64vzichcalba3z2v5n6icifvx5xytvske7mr3hpm'
const CID_B = 'bafyreick4zaw3oxx6ltzob5khfcplaquk4s3ulinexijye7wswntszajm4'
const GROUP = {
  uri: 'at://did:plc:owner/com.authorityone.group.profile/self',
  cid: CID_A,
}

describe('GROUP_POST_LEXICON', () => {
  it('is identical to lexicons/com/authorityone/group/post.json', () => {
    const json = JSON.parse(
      readFileSync(
        path.join(
          __dirname,
          '../../../../lexicons/com/authorityone/group/post.json',
        ),
        'utf8',
      ),
    )
    expect(GROUP_POST_LEXICON).toEqual(json)
  })
})

describe('buildGroupPostBindingWrite', () => {
  it('uses the post rkey, the post URI and computed CID, and the group ref', () => {
    const w = buildGroupPostBindingWrite({
      did: DID,
      postRkey: '3kabc',
      postCid: CID_B,
      group: GROUP,
      createdAt: '2026-10-29T00:00:00.000Z',
    })
    expect(w).toEqual({
      $type: 'com.atproto.repo.applyWrites#create',
      collection: 'com.authorityone.group.post',
      rkey: '3kabc',
      value: {
        $type: 'com.authorityone.group.post',
        subject: {uri: `at://${DID}/app.bsky.feed.post/3kabc`, cid: CID_B},
        group: GROUP,
        createdAt: '2026-10-29T00:00:00.000Z',
      },
    })
    expect(validateGroupPostRecord(w.value).success).toBe(true)
  })

  it('client-side validation rejects a malformed binding', () => {
    expect(
      validateGroupPostRecord({
        $type: 'com.authorityone.group.post',
        subject: {uri: `at://${DID}/app.bsky.feed.post/3kabc`},
        group: GROUP,
        createdAt: '2026-10-29T00:00:00.000Z',
      }).success,
    ).toBe(false)
    expect(validateGroupPostRecord({$type: 'app.bsky.feed.post'}).success).toBe(
      false,
    )
  })
})

describe('isWellFormedGroupPostBinding', () => {
  const target = {kind: 'community', id: 'btb', tier: 'public'}
  it.each<[string, unknown, boolean]>([
    ['public with group', {target, group: GROUP}, true],
    ['members', {target: {...target, tier: 'members'}, group: GROUP}, false],
    ['paid', {target: {...target, tier: 'paid'}, group: GROUP}, false],
    ['empty id', {target: {...target, id: ' '}, group: GROUP}, false],
    ['no group', {target}, false],
    ['group cid empty', {target, group: {...GROUP, cid: ''}}, false],
    [
      'group uri is a post',
      {target, group: {...GROUP, uri: `at://${DID}/app.bsky.feed.post/x`}},
      false,
    ],
    ['undefined', undefined, false],
  ])('%s -> %s', (_name, v, expected) => {
    expect(isWellFormedGroupPostBinding(v)).toBe(expected)
  })
})

describe('findCidMismatches', () => {
  const writes = [
    {collection: 'app.bsky.feed.post'},
    {collection: 'app.bsky.feed.threadgate'},
    {collection: 'com.authorityone.group.post'},
  ]
  const computed = [{uri: `at://${DID}/app.bsky.feed.post/a`, cid: CID_A}]

  it('matches when the PDS returns the computed CID for the post write', () => {
    expect(
      findCidMismatches({
        writes,
        results: [{uri: computed[0].uri, cid: CID_A}, {}, {}],
        computed,
      }),
    ).toEqual([])
  })

  it.each<[string, unknown[] | undefined]>([
    ['different cid', [{uri: computed[0].uri, cid: CID_B}]],
    ['different uri', [{uri: `at://${DID}/app.bsky.feed.post/b`, cid: CID_A}]],
    ['no results', undefined],
    ['empty results', []],
  ])('%s is a mismatch', (_name, results) => {
    expect(findCidMismatches({writes, results, computed})).toHaveLength(1)
  })
})
