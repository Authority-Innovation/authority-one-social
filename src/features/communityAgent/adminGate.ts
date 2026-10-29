/**
 * Only a current admin of the community may launch (sponsor) its agent, never
 * the agent itself. The runtime enforces this too; the app reads the
 * runtime-supplied `viewerIsAdmin` and fails closed: absent, null or anything
 * other than literal `true` is not an admin. Membership `role` is not used
 * here, it says nothing about admin rights.
 */
export function isCommunityAdmin(
  community: {viewerIsAdmin?: unknown} | null | undefined,
): boolean {
  return community?.viewerIsAdmin === true
}
