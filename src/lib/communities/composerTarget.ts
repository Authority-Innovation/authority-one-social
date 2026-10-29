/**
 * Where a composer post is headed, and whether the composer is allowed to write
 * it to the user's PDS.
 *
 * Members-tier and paid-tier community content lives in the walled store behind
 * the runtime door. It must NEVER reach the user's PDS: no
 * com.atproto.repo.createRecord / putRecord / applyWrites, no uploadBlob, no
 * server-side draft, no bsky video upload (which lands the blob in the PDS).
 *
 * The members write path (a runtime client) is not built yet, so for now a
 * members/paid target is simply refused with a typed reason the UI can render.
 *
 * The user's own profile (including no target at all, which means the
 * profile) may use the PDS write paths. A public-tier community target may
 * make exactly one PDS write: the bound `applyWrites` that writes the post and
 * its `com.authorityone.group.post` binding together (see
 * groupPostBinding.ts). Every other PDS write for a public target (drafts,
 * blobs, video, an unbound post) is refused with
 * `public-community-not-available`, so a public post never lands on the
 * profile with its community dropped. resolveTarget, gateComposerWrite and
 * submitComposerThread also still refuse public until the review passes.
 *
 * The guard is deliberately NOT behind a feature flag: it is a fail-closed
 * safety check. Undefined means the user's own profile. Null (a target the
 * composer could not resolve) and anything else it does not recognise is
 * refused.
 */

import {isWellFormedGroupPostBinding} from '#/lib/communities/groupPostBinding'

export type CommunityTier = 'public' | 'members' | 'paid'

export type ComposerTarget =
  | {kind: 'profile'}
  | {kind: 'community'; id: string; tier: CommunityTier}

export const DEFAULT_COMPOSER_TARGET: ComposerTarget = {kind: 'profile'}

/**
 * Every PDS write the composer can trigger. A refused target must reach none of
 * these. Kept as data so tests and reports can enumerate it.
 */
export const GUARDED_PDS_WRITES = [
  'com.atproto.repo.createRecord',
  'com.atproto.repo.putRecord',
  'com.atproto.repo.applyWrites',
  'com.atproto.repo.uploadBlob',
  'app.bsky.draft.createDraft',
  'app.bsky.draft.updateDraft',
  'app.bsky.draft.deleteDraft',
  'app.bsky.video.uploadVideo',
] as const

export type GuardedPdsWrite = (typeof GUARDED_PDS_WRITES)[number]

export type ComposerWriteRefusalReason =
  /** Members/paid content: the walled-store write path is not available yet. */
  | 'members-write-not-available'
  /** Anything the guard does not recognise. Fails closed. */
  | 'unknown-target'
  /**
   * A public-tier community target without a well-formed binding. Returned by
   * guardComposerPdsWrite for every public write that is not the bound
   * applyWrites, and by the publish layer (submit and write gate).
   */
  | 'public-community-not-available'

export type ComposerWriteDecision =
  | {allowed: true}
  | {
      allowed: false
      reason: ComposerWriteRefusalReason
      refusedWrites: readonly GuardedPdsWrite[]
    }

function refuse(reason: ComposerWriteRefusalReason): ComposerWriteDecision {
  return {allowed: false, reason, refusedWrites: GUARDED_PDS_WRITES}
}

/**
 * A public-tier community target. The publish layer refuses it until the
 * bound write path is reviewed; the profile post path would drop the
 * community.
 */
export function isPublicCommunityTarget(
  target: ComposerTarget | null | undefined,
): boolean {
  return (
    !!target &&
    typeof target === 'object' &&
    target.kind === 'community' &&
    target.tier === 'public'
  )
}

/**
 * The publish-layer refusal for a public community target. Every PDS write is
 * refused, because none of them can carry the community.
 */
export function refusePublicCommunityTarget(): Extract<
  ComposerWriteDecision,
  {allowed: false}
> {
  return {
    allowed: false,
    reason: 'public-community-not-available',
    refusedWrites: GUARDED_PDS_WRITES,
  }
}

/**
 * Pure. Decides whether the composer may use any PDS write path for `target`.
 * Never throws; an unrecognised target is refused rather than allowed.
 *
 * A public community target is allowed only with a well-formed binding to that
 * same community (the bound applyWrites is the only public PDS write path).
 * Drafts, blob uploads and video for a public target pass no binding and are
 * refused. Design doc section 5 item 3 leaves open whether those should be
 * allowed for public; until it is decided they stay refused (fail closed).
 */
export function guardComposerPdsWrite(
  target: ComposerTarget | null | undefined = DEFAULT_COMPOSER_TARGET,
  {binding}: {binding?: unknown} = {},
): ComposerWriteDecision {
  if (!target || typeof target !== 'object') {
    return refuse('unknown-target')
  }
  switch (target.kind) {
    case 'profile':
      return {allowed: true}
    case 'community':
      switch (target.tier) {
        case 'public':
          return isWellFormedGroupPostBinding(binding) &&
            binding.target.id === target.id
            ? {allowed: true}
            : refuse('public-community-not-available')
        case 'members':
        case 'paid':
          return refuse('members-write-not-available')
        default:
          return refuse('unknown-target')
      }
    default:
      return refuse('unknown-target')
  }
}

/**
 * Thrown by the data-layer write paths (draft mutations, video upload) when
 * the target is refused. These run before the network call, so a refused
 * target sends nothing even if a UI-level early return is missing.
 */
export class ComposerPdsWriteRefusedError extends Error {
  readonly reason: ComposerWriteRefusalReason
  readonly write: GuardedPdsWrite

  constructor(reason: ComposerWriteRefusalReason, write: GuardedPdsWrite) {
    super(`Composer PDS write refused (${write}): ${reason}`)
    this.name = 'ComposerPdsWriteRefusedError'
    this.reason = reason
    this.write = write
  }
}

/**
 * Throws ComposerPdsWriteRefusedError unless `target` may write to the PDS.
 * Call immediately before the `write` it names.
 */
export function assertComposerPdsWrite(
  target: ComposerTarget | null | undefined,
  write: GuardedPdsWrite,
): void {
  const decision = guardComposerPdsWrite(target)
  if (!decision.allowed) {
    throw new ComposerPdsWriteRefusedError(decision.reason, write)
  }
}
