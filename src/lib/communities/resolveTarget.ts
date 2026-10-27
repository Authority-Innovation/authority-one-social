/**
 * Decides where a composer submit goes. Pure: no React, no env reads, no I/O.
 * The caller passes the flags in, so tests can drive every row of the table.
 *
 * Rules (fork change plan, Phase 3 "Composer target and fail-closed rule"):
 *
 *  - profile and public-tier community targets keep the existing PDS path.
 *  - members and paid community targets go ONLY through the communities
 *    runtime client (`communitiesClient.post` / `.reply`). They never reach a
 *    PDS write; the T3 guard (`guardComposerPdsWrite`) still enforces that.
 *  - A reply inherits its parent's target. If the parent's target cannot be
 *    determined, the submit is refused with a typed error (fail closed).
 *  - `EXPO_PUBLIC_LOCKED_COMMUNITY` fixes the target to that community. The
 *    composer cannot move a post anywhere else.
 *  - With `EXPO_PUBLIC_COMMUNITIES_ENABLED` off (the default), anything that
 *    would land in a community is refused. Profile posting is untouched.
 *
 * Never throws. Anything it does not recognise is refused, never allowed.
 */
import {
  type CommunityTier,
  type ComposerTarget,
} from '#/lib/communities/composerTarget'

/** The write path a resolved target uses. */
export type ComposerTargetRoute =
  /** The user's PDS via the existing composer path (profile, public tier). */
  | 'pds'
  /** The communities runtime client. Members and paid tiers only. */
  | 'communities'

export type ComposerTargetErrorCode =
  /** A reply whose parent's target is missing, malformed or unrecognised. */
  | 'unknown-parent-target'
  /** The requested target is malformed or unrecognised. */
  | 'unknown-target'
  /** An explicit target that disagrees with the parent's target on a reply. */
  | 'reply-target-mismatch'
  /** A target (or parent) outside the community this build is locked to. */
  | 'locked-community-mismatch'
  /** Locked build, but nothing tells us the locked community's tier. */
  | 'locked-community-tier-unknown'
  /** A community target while the communities flag is off. */
  | 'communities-disabled'

export type ComposerTargetError = {code: ComposerTargetErrorCode}

export type ResolvedComposerTarget =
  | {
      ok: true
      target: ComposerTarget
      route: ComposerTargetRoute
      /** True when the target came from `EXPO_PUBLIC_LOCKED_COMMUNITY`. */
      locked: boolean
    }
  | {ok: false; error: ComposerTargetError}

export type ComposerTargetParent = {
  /**
   * The parent's id. An AT-URI for a PDS post, or the runtime post id for a
   * members/paid community post.
   */
  uri: string
  /** The parent's own target, when the caller knows it. */
  target?: ComposerTarget | null
}

export type ResolveTargetContext = {
  /** What the composer was opened with. Undefined means "nothing asked for". */
  requested?: ComposerTarget
  /** Present when the submit is a reply. */
  parent?: ComposerTargetParent
  /** `EXPO_PUBLIC_LOCKED_COMMUNITY`. Empty or undefined means not locked. */
  lockedCommunityId?: string
  /** The locked community's tier, when the caller has the community config. */
  lockedCommunityTier?: CommunityTier
  /** `EXPO_PUBLIC_COMMUNITIES_ENABLED`. */
  communitiesEnabled: boolean
}

const TIERS: readonly CommunityTier[] = ['public', 'members', 'paid']

function fail(code: ComposerTargetErrorCode): ResolvedComposerTarget {
  return {ok: false, error: {code}}
}

function isTier(v: unknown): v is CommunityTier {
  return typeof v === 'string' && (TIERS as readonly string[]).includes(v)
}

/**
 * Returns the target in canonical form (no extra keys), or undefined when it is
 * not a well-formed target.
 */
function normalise(v: unknown): ComposerTarget | undefined {
  if (!v || typeof v !== 'object') return undefined
  const t = v as Record<string, unknown>
  if (t.kind === 'profile') return {kind: 'profile'}
  if (
    t.kind === 'community' &&
    typeof t.id === 'string' &&
    t.id.trim().length > 0 &&
    isTier(t.tier)
  ) {
    return {kind: 'community', id: t.id, tier: t.tier}
  }
  return undefined
}

function sameTarget(a: ComposerTarget, b: ComposerTarget): boolean {
  if (a.kind === 'profile' || b.kind === 'profile') return a.kind === b.kind
  return a.id === b.id && a.tier === b.tier
}

/** Members and paid content lives in the walled store, never on a PDS. */
export function isWalledTarget(target: ComposerTarget): target is Extract<
  ComposerTarget,
  {kind: 'community'}
> & {
  tier: 'members' | 'paid'
} {
  return (
    target.kind === 'community' &&
    (target.tier === 'members' || target.tier === 'paid')
  )
}

export function routeForTarget(target: ComposerTarget): ComposerTargetRoute {
  return isWalledTarget(target) ? 'communities' : 'pds'
}

function isPdsPostUri(uri: unknown): boolean {
  return (
    typeof uri === 'string' &&
    /^at:\/\/[^/]+\/app\.bsky\.feed\.post\/[^/]+$/.test(uri)
  )
}

/**
 * The parent's target. An explicit target wins. Without one, an
 * app.bsky.feed.post AT-URI is a PDS record, and every PDS post is public, so
 * the reply stays on the PDS path as a profile reply. Anything else is unknown.
 */
function parentTarget(
  parent: ComposerTargetParent,
): ComposerTarget | undefined {
  if (parent.target !== undefined && parent.target !== null) {
    return normalise(parent.target)
  }
  return isPdsPostUri(parent.uri) ? {kind: 'profile'} : undefined
}

function ok(target: ComposerTarget, locked: boolean): ResolvedComposerTarget {
  return {ok: true, target, route: routeForTarget(target), locked}
}

export function resolveTarget(
  context: ResolveTargetContext,
): ResolvedComposerTarget {
  if (!context || typeof context !== 'object') return fail('unknown-target')
  const {requested, parent, lockedCommunityId, lockedCommunityTier} = context
  const communitiesEnabled = context.communitiesEnabled === true

  let explicit: ComposerTarget | undefined
  if (requested !== undefined) {
    explicit = normalise(requested)
    if (!explicit) return fail('unknown-target')
  }

  let inherited: ComposerTarget | undefined
  if (parent !== undefined) {
    if (!parent || typeof parent !== 'object') {
      return fail('unknown-parent-target')
    }
    inherited = parentTarget(parent)
    if (!inherited) return fail('unknown-parent-target')
    if (explicit && !sameTarget(explicit, inherited)) {
      return fail('reply-target-mismatch')
    }
  }

  const lockedId =
    typeof lockedCommunityId === 'string' ? lockedCommunityId.trim() : ''
  if (lockedId) {
    if (!communitiesEnabled) return fail('communities-disabled')
    // The target is fixed. A different community, or a reply outside the
    // locked community, is refused rather than quietly re-homed.
    for (const t of [explicit, inherited]) {
      if (t?.kind === 'community' && t.id !== lockedId) {
        return fail('locked-community-mismatch')
      }
    }
    if (inherited?.kind === 'profile') return fail('locked-community-mismatch')
    const known = [explicit, inherited].find(
      (t): t is Extract<ComposerTarget, {kind: 'community'}> =>
        t?.kind === 'community',
    )
    if (
      lockedCommunityTier !== undefined &&
      (!isTier(lockedCommunityTier) ||
        (known && known.tier !== lockedCommunityTier))
    ) {
      return fail('unknown-target')
    }
    const tier = lockedCommunityTier ?? known?.tier
    if (!tier) return fail('locked-community-tier-unknown')
    return ok({kind: 'community', id: lockedId, tier}, true)
  }

  const target = inherited ?? explicit ?? {kind: 'profile'}
  if (target.kind === 'community' && !communitiesEnabled) {
    return fail('communities-disabled')
  }
  return ok(target, false)
}
