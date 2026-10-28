/**
 * The composer entry for a community. Its target is fixed to `communityId`
 * and nothing else: a post from here may only go to this community's private
 * store, never to the person's public account.
 *
 * The composer target wiring is T17. Until it lands this renders nothing, on
 * purpose: opening the ordinary composer from here would publish to the PDS,
 * so the safe default is no composer at all (fail-closed).
 */
export function CommunityComposerEntry(_props: {communityId: string}) {
  return null
}
