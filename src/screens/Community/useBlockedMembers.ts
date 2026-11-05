import {useSession} from '#/state/session'
import {account, useStorage} from '#/storage'
import {addBlocked} from './moderation'

/**
 * The people this account has blocked in one community, on this device. The door
 * has no block yet, so this only hides their posts here: it does not stop them
 * reading or replying, and it does not follow the person to another device.
 */
export function useBlockedMembers({communityId}: {communityId: string}) {
  const did = useSession().currentAccount?.did ?? ''
  const [blocked, setBlocked] = useStorage(account, [
    did,
    'communityBlockedMembers',
  ])
  return {
    blocked: blocked?.[communityId] ?? [],
    block: (keys: string[]) => {
      setBlocked(
        keys.reduce(
          (next, key) => addBlocked(next, communityId, key),
          blocked,
        ) ?? {},
      )
    },
  }
}
