import {useLayoutEffect} from 'react'
import {type ColorSchemeName, useColorScheme} from 'react-native'
import {type ThemeName} from '@bsky.app/alf'

import {type AlfThemeSet, type SkinDefinition} from '#/lib/skins'
import {useThemePrefs} from '#/state/shell'
import {useSkin} from '#/state/skin'
import {dark, dim, light} from '#/alf/themes'
import {IS_WEB} from '#/env'

export function useColorModeTheme(): ThemeName {
  const theme = useThemeName()
  const skin = useSkin()

  useLayoutEffect(() => {
    updateDocument(theme, skin)
  }, [theme, skin])

  return theme
}

export function useThemeName(): ThemeName {
  const colorScheme = useColorScheme()
  const {colorMode, darkTheme} = useThemePrefs()

  return getThemeName(colorScheme, colorMode, darkTheme)
}

function getThemeName(
  colorScheme: ColorSchemeName,
  colorMode: 'system' | 'light' | 'dark',
  darkTheme?: ThemeName,
) {
  if (
    (colorMode === 'system' && colorScheme === 'light') ||
    colorMode === 'light'
  ) {
    return 'light'
  } else {
    return darkTheme ?? 'dim'
  }
}

const BASE_ALF_THEMES: AlfThemeSet = {light, dark, dim}

function skinThemeSet(skin: SkinDefinition): AlfThemeSet {
  return skin.alfThemes ?? BASE_ALF_THEMES
}

function updateDocument(theme: ThemeName, skin: SkinDefinition) {
  // @ts-ignore web only
  if (IS_WEB && typeof window !== 'undefined') {
    // @ts-ignore web only
    const html = window.document.documentElement
    // @ts-ignore web only
    const meta = window.document.querySelector('meta[name="theme-color"]')

    // remove any other color mode classes
    html.className = html.className.replace(/(theme|themepack)--[\w-]+/g, '')
    html.classList.add(`theme--${theme}`)
    html.classList.add(`themepack--${skin.id}`)
    // Paint the DOCUMENT itself with the active theme/skin background. The static
    // index.html CSS only knows the base light/dark/dim colors, so on a skinned
    // theme (e.g. warm paper) any scroll or overscroll past the app's own painted
    // views exposed the stale white/black document background underneath.
    html.style.backgroundColor = getBackgroundColor(theme, skin)
    // set color to 'theme-color' meta tag
    meta?.setAttribute('content', getBackgroundColor(theme, skin))
    window.localStorage.setItem('ALF_THEME', theme)
    window.localStorage.setItem('ALF_THEME_PACK', skin.id)
  }
}

export function getBackgroundColor(
  theme: ThemeName,
  skin: SkinDefinition,
): string {
  return skinThemeSet(skin)[theme].atoms.bg.backgroundColor
}
