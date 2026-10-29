/**
 * Only a current admin may launch (sponsor) the community agent. Fails
 * closed: anything but a literal `viewerIsAdmin === true` is not an admin, and
 * the membership role (owner, moderator) is deliberately not consulted.
 */
export function isCommunityAdmin(
  community: {viewerIsAdmin?: unknown} | null | undefined,
): boolean {
  return community?.viewerIsAdmin === true
}
