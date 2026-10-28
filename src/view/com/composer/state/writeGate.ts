/**
 * The composer's single gate in front of every write path it can trigger:
 * picking a video (bsky video upload lands the blob in the PDS), restoring a
 * draft (a restored video is re-uploaded the same way), saving a draft
 * (server-side drafts live on the PDS) and publishing (PDS record, PDS blob,
 * post-as-agent, runtime video).
 *
 * Pure apart from the callbacks handed to `restoreDraftGuarded`, so the
 * Composer wiring can be tested without rendering the Composer.
 *
 * Rule: a members/paid target never reaches a PDS write path. Its only path is
 * a plain publish through the communities runtime client. An unresolved target
 * reaches nothing.
 */
import {
  type ComposerWriteRefusalReason,
  guardComposerPdsWrite,
} from '#/lib/communities/composerTarget'
import {
  type ComposerTargetErrorCode,
  type ComposerTargetRoute,
  isWalledTarget,
  type ResolvedComposerTarget,
} from '#/lib/communities/resolveTarget'

export type ComposerWriteAction =
  | {kind: 'select-video'}
  | {kind: 'restore-draft'}
  | {kind: 'save-draft'}
  | {kind: 'publish'; postAs: boolean; authorityVideo: boolean}

export type ComposerWriteGateRefusal =
  | {code: 'unresolved-target'; error: ComposerTargetErrorCode}
  | {code: ComposerWriteRefusalReason}

export type ComposerWriteGate =
  | {allowed: true; route: ComposerTargetRoute}
  | {allowed: false; refusal: ComposerWriteGateRefusal}

function refuse(refusal: ComposerWriteGateRefusal): ComposerWriteGate {
  return {allowed: false, refusal}
}

export function gateComposerWrite(
  resolution: ResolvedComposerTarget,
  action: ComposerWriteAction,
): ComposerWriteGate {
  if (!resolution.ok) {
    return refuse({code: 'unresolved-target', error: resolution.error.code})
  }
  // Post-as-agent and runtime video are PDS paths, so a members publish with
  // either is refused by the guard below like any other PDS write.
  if (
    action.kind === 'publish' &&
    resolution.route === 'communities' &&
    isWalledTarget(resolution.target) &&
    !action.postAs &&
    !action.authorityVideo
  ) {
    return {allowed: true, route: 'communities'}
  }
  const decision = guardComposerPdsWrite(resolution.target)
  if (!decision.allowed) return refuse({code: decision.reason})
  if (resolution.route !== 'pds') return refuse({code: 'unknown-target'})
  return {allowed: true, route: 'pds'}
}

/**
 * Loads a draft into the composer only when the target allows it. A refused
 * target loads nothing and restores no video, so no draft video is handed to
 * the bsky video service (which writes the blob to the PDS).
 */
export async function restoreDraftGuarded<
  Loaded extends {
    posts: {id: string}[]
    restoredVideos: Map<number, Video>
  },
  Video,
>({
  resolution,
  onRefused,
  load,
  apply,
  restoreVideo,
}: {
  resolution: ResolvedComposerTarget
  onRefused: (refusal: ComposerWriteGateRefusal) => void
  load: () => Promise<Loaded>
  apply: (loaded: Loaded) => void
  restoreVideo: (postId: string, video: Video) => void
}): Promise<boolean> {
  const gate = gateComposerWrite(resolution, {kind: 'restore-draft'})
  if (!gate.allowed) {
    onRefused(gate.refusal)
    return false
  }
  const loaded = await load()
  apply(loaded)
  for (const [postIndex, video] of loaded.restoredVideos) {
    const post = loaded.posts[postIndex]
    if (post) restoreVideo(post.id, video)
  }
  return true
}
