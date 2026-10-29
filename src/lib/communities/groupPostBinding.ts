/**
 * The `com.authorityone.group.post` binding for a public-tier community post.
 * Spec: docs/design/group-post-binding.md.
 *
 * A public community post is an ordinary `app.bsky.feed.post` plus a binding
 * record in the author's repo, written in the SAME `applyWrites` call (one repo
 * commit), so a public community post can never exist without its binding and
 * vice versa. The binding uses the post's own rkey and the post's locally
 * computed CID; after the write, the computed CID must equal the CID the PDS
 * returns, or the post fails (see GroupPostCidMismatchError).
 *
 * Members and paid content never gets a binding: a binding on the PDS would
 * itself leak that the post exists and where. Anything that is not a
 * well-formed public binding is refused before any write.
 *
 * Not reachable from the composer yet: resolveTarget and submitComposerThread
 * still refuse every public community target until the review passes.
 */
import {type $Typed, type ComAtprotoRepoApplyWrites} from '@atproto/api'

import {type ComposerTarget} from '#/lib/communities/composerTarget'
import {type Main as GroupPostRecord} from '#/lib/lexicon/generated/types/com/authorityone/group/post'

export const GROUP_POST_COLLECTION = 'com.authorityone.group.post'

/**
 * The group a public post binds to.
 *
 * OPEN (Q1, design doc section 1): plain AT-URI vs pinned strongRef. The
 * existing lexicon types `group` as a strongRef, so this keeps `{uri, cid}`
 * and changes no lexicon. The caller supplies the CID; no `getGroup` fetch is
 * built here. If Q1 lands on (a), `cid` goes away along with the lexicon
 * change.
 */
export type ResolvedGroupRef = {uri: string; cid: string}

export type PublicCommunityTarget = Extract<
  ComposerTarget,
  {kind: 'community'}
> & {tier: 'public'}

/**
 * What the bound write path needs: the public target and the resolved group.
 * Built at submit time only, never stored.
 */
export type GroupPostBinding = {
  target: PublicCommunityTarget
  group: ResolvedGroupRef
}

const GROUP_PROFILE_URI =
  /^at:\/\/[^/\s]+\/com\.authorityone\.group\.profile\/[^/\s]+$/

/**
 * Pure. True only for a binding to a public community with a group profile
 * AT-URI and a CID. Members/paid, a missing group, or anything malformed is
 * false.
 */
export function isWellFormedGroupPostBinding(
  v: unknown,
): v is GroupPostBinding {
  if (!v || typeof v !== 'object') return false
  const b = v as Record<string, unknown>
  const target = b.target as Record<string, unknown> | null | undefined
  const group = b.group as Record<string, unknown> | null | undefined
  return (
    !!target &&
    typeof target === 'object' &&
    target.kind === 'community' &&
    target.tier === 'public' &&
    typeof target.id === 'string' &&
    target.id.trim().length > 0 &&
    !!group &&
    typeof group === 'object' &&
    typeof group.uri === 'string' &&
    GROUP_PROFILE_URI.test(group.uri) &&
    typeof group.cid === 'string' &&
    group.cid.length > 0
  )
}

/** Thrown before any write when the binding is missing, malformed or not public. */
export class GroupPostBindingRefusedError extends Error {
  constructor() {
    super('Group post binding refused: not a well-formed public binding')
    this.name = 'GroupPostBindingRefusedError'
  }
}

/** Throws GroupPostBindingRefusedError unless `binding` is a well-formed public binding. */
export function assertGroupPostBinding(
  binding: unknown,
): asserts binding is GroupPostBinding {
  if (!isWellFormedGroupPostBinding(binding)) {
    throw new GroupPostBindingRefusedError()
  }
}

/**
 * The binding create for one post. Same rkey as the post (Q2 in the doc asks
 * whether to keep this; it is what the doc builds). `subject` is the post's
 * URI and its locally computed CID.
 */
export function buildGroupPostBindingWrite({
  did,
  postRkey,
  postCid,
  group,
  createdAt,
}: {
  did: string
  postRkey: string
  postCid: string
  group: ResolvedGroupRef
  createdAt: string
}): $Typed<ComAtprotoRepoApplyWrites.Create> & {value: GroupPostRecord} {
  return {
    $type: 'com.atproto.repo.applyWrites#create',
    collection: GROUP_POST_COLLECTION,
    rkey: postRkey,
    value: {
      $type: GROUP_POST_COLLECTION,
      subject: {
        uri: `at://${did}/app.bsky.feed.post/${postRkey}`,
        cid: postCid,
      },
      group: {uri: group.uri, cid: group.cid},
      createdAt,
    },
  }
}

/**
 * The PDS stored a post under a different CID than the client computed, so
 * the binding's `subject.cid` does not match its post.
 *
 * OPEN (Q6 / D3): no compensating delete. The batch is already committed; the
 * post and binding stay on the PDS, and the only effects are this error and
 * the log entry.
 */
export class GroupPostCidMismatchError extends Error {
  readonly mismatches: {uri: string; computed: string; returned?: string}[]

  constructor(
    mismatches: {uri: string; computed: string; returned?: string}[],
  ) {
    super(
      `Group post CID mismatch: ${mismatches
        .map(
          m => `${m.uri} computed ${m.computed}, PDS ${m.returned ?? 'none'}`,
        )
        .join('; ')}`,
    )
    this.name = 'GroupPostCidMismatchError'
    this.mismatches = mismatches
  }
}

/**
 * Pure. Compares each post's computed CID with the CID the PDS returned for
 * the matching write (`results[i]` is the result of `writes[i]`). A missing
 * result or URI counts as a mismatch: an unverifiable CID is not a match.
 */
export function findCidMismatches({
  writes,
  results,
  computed,
}: {
  writes: readonly {collection: string}[]
  results: readonly unknown[] | undefined
  computed: readonly {uri: string; cid: string}[]
}): {uri: string; computed: string; returned?: string}[] {
  const mismatches: {uri: string; computed: string; returned?: string}[] = []
  let postIndex = 0
  writes.forEach((w, i) => {
    if (w.collection !== 'app.bsky.feed.post') return
    const expected = computed[postIndex++]
    if (!expected) return
    const r = results?.[i] as {uri?: unknown; cid?: unknown} | undefined
    const returned = typeof r?.cid === 'string' ? r.cid : undefined
    if (r?.uri !== expected.uri || returned !== expected.cid) {
      mismatches.push({uri: expected.uri, computed: expected.cid, returned})
    }
  })
  if (postIndex !== computed.length) {
    for (const c of computed.slice(postIndex)) {
      mismatches.push({uri: c.uri, computed: c.cid})
    }
  }
  return mismatches
}
