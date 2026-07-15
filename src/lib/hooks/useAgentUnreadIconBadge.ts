import {useEffect} from 'react'
import {AppState} from 'react-native'
import {useQueryClient} from '@tanstack/react-query'

import {setAppIconBadgeCount} from '#/lib/notifications/notifications'
import {
  AGENT_CONVERSATIONS_QUERY_ROOT,
  useOwnedAgentsUnread,
} from '#/state/queries/agent-conversations'
import {IS_NATIVE} from '#/env'

/**
 * Mirror the total unread across all the owner's agents onto the iOS app-icon
 * badge (foreground path via expo-notifications setBadgeCountAsync — no push
 * infra involved). Refreshes the underlying conversations queries whenever the
 * app returns to the foreground so the badge tracks reality, and re-sets the
 * badge whenever the total changes. Native-only; a no-op on web.
 */
export function useAgentUnreadIconBadge() {
  const {total} = useOwnedAgentsUnread()
  const queryClient = useQueryClient()

  useEffect(() => {
    if (!IS_NATIVE) return
    void setAppIconBadgeCount(total)
  }, [total])

  useEffect(() => {
    if (!IS_NATIVE) return
    const sub = AppState.addEventListener('change', state => {
      if (state === 'active') {
        void queryClient.invalidateQueries({
          queryKey: [AGENT_CONVERSATIONS_QUERY_ROOT],
        })
      }
    })
    return () => sub.remove()
  }, [queryClient])
}
