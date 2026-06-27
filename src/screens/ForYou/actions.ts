import {Linking, Share} from 'react-native'

import {logger} from '#/logger'
import {type FeedItem} from './types'

/** Open an item's canonical link (browser / source app). No-op if missing. */
export async function openItemLink(item: FeedItem): Promise<void> {
  const url = item.link
  if (!url) return
  try {
    await Linking.openURL(url)
  } catch (e) {
    logger.warn('ForYou: failed to open link', {safeMessage: String(e)})
  }
}

/** Share an item via the platform share sheet (native) or Web Share / clipboard. */
export async function shareItem(item: FeedItem): Promise<void> {
  const url = item.link ?? ''
  const message = url ? `${item.title} ${url}` : item.title
  try {
    // Web Share API when available (web), else the native share sheet.
    const webNav = globalThis as unknown as {
      navigator?: {
        share?: (data: {title?: string; text?: string; url?: string}) => Promise<void>
      }
    }
    if (webNav.navigator?.share) {
      await webNav.navigator.share({title: item.title, text: item.title, url})
      return
    }
    await Share.share({message, url, title: item.title})
  } catch (e) {
    logger.warn('ForYou: share failed', {safeMessage: String(e)})
  }
}
