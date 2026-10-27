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
 * The guard is deliberately NOT behind a feature flag: it is a fail-closed
 * safety check, and nothing sets a community target yet, so it is inert for
 * every existing caller (the default target is the user's own profile).
 */

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
  'app.bsky.video.uploadVideo',
] as const

export type GuardedPdsWrite = (typeof GUARDED_PDS_WRITES)[number]

export type ComposerWriteRefusalReason =
  /** Members/paid content: the walled-store write path is not available yet. */
  | 'members-write-not-available'
  /** Anything the guard does not recognise. Fails closed. */
  | 'unknown-target'

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
 * Pure. Decides whether the composer may use any PDS write path for `target`.
 * Never throws; an unrecognised target is refused rather than allowed.
 */
export function guardComposerPdsWrite(
  target: ComposerTarget | undefined = DEFAULT_COMPOSER_TARGET,
): ComposerWriteDecision {
  if (!target || typeof target !== 'object') {
    return refuse('unknown-target')
  }
  switch (target.kind) {
    case 'profile':
      return {allowed: true}
    case 'community':
      switch (target.tier) {
        // Public-tier community posting is unchanged by this guard.
        case 'public':
          return {allowed: true}
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
