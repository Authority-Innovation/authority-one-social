import {useEffect} from 'react'
import {useNavigation} from '@react-navigation/native'

import {type NavigationProp} from '#/lib/routes/types'
import {COMMUNITIES_ENABLED} from '#/env'

/**
 * Screen-level flag-off fallback for every community route. Navigation by
 * route name skips `router.matchPath`, so each community screen calls this.
 * It lives in its own module so the join screen can use it without loading
 * the whole community home.
 */
export function useCommunitiesDisabledFallback() {
  const navigation = useNavigation<NavigationProp>()
  useEffect(() => {
    if (!COMMUNITIES_ENABLED) {
      navigation.navigate('Home')
    }
  }, [navigation])
}
