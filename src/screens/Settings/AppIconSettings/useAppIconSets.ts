import {useMemo} from 'react'
import {msg} from '@lingui/core/macro'
import {useLingui} from '@lingui/react'

import {type AppIconSet} from '#/screens/Settings/AppIconSettings/types'

export function useAppIconSets() {
  const {_} = useLingui()

  return useMemo(() => {
    // Previews must match the art bundled by the @bsky.app/expo-dynamic-app-icon
    // plugin config in app.config.js (both variants currently share the One
    // art). The upstream "Bluesky+" core_* butterfly set is removed.
    const defaults = [
      {
        id: 'default_light',
        name: _(msg({context: 'Name of app icon variant', message: 'Light'})),
        iosImage: () => {
          return require(
            `../../../../assets/app-icons/ios_icon_default_next.png`,
          )
        },
        androidImage: () => {
          return require(
            `../../../../assets/app-icons/android_icon_default_next.png`,
          )
        },
      },
      {
        id: 'default_dark',
        name: _(msg({context: 'Name of app icon variant', message: 'Dark'})),
        iosImage: () => {
          return require(
            `../../../../assets/app-icons/ios_icon_default_next.png`,
          )
        },
        androidImage: () => {
          return require(
            `../../../../assets/app-icons/android_icon_default_next.png`,
          )
        },
      },
    ] satisfies AppIconSet[]

    return {
      defaults,
    }
  }, [_])
}
