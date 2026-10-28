/**
 * Authority One Communities - placeholder screens for `/c/:id` and
 * `/c/:id/members`. They render nothing yet; the real community home and
 * members screens replace them in a later task.
 *
 * Every path resolved through `router.matchPath` is already sent to Home when
 * EXPO_PUBLIC_COMMUNITIES_ENABLED is off (see `./linking.ts`). The guard below
 * is a second line for navigation by route name, which skips matchPath.
 */
import {useEffect} from 'react'
import {useNavigation} from '@react-navigation/native'

import {
  type CommonNavigatorParams,
  type NativeStackScreenProps,
  type NavigationProp,
} from '#/lib/routes/types'
import {COMMUNITIES_ENABLED} from '#/env'

export function CommunityScreen(
  _props: NativeStackScreenProps<CommonNavigatorParams, 'Community'>,
) {
  useCommunitiesDisabledFallback()
  return null
}

export function CommunityMembersScreen(
  _props: NativeStackScreenProps<CommonNavigatorParams, 'CommunityMembers'>,
) {
  useCommunitiesDisabledFallback()
  return null
}

export function useCommunitiesDisabledFallback() {
  const navigation = useNavigation<NavigationProp>()
  useEffect(() => {
    if (!COMMUNITIES_ENABLED) {
      navigation.navigate('Home')
    }
  }, [navigation])
}
