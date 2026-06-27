import {blendFeeds} from '../blend'
import {type SourceAdapter, type SourceAdapterContext} from '../types'
import {mlbAdapter} from './mlb'
import {nhlAdapter} from './nhl'
import {
  clipsAdapter,
  collegeAdapter,
  highSchoolAdapter,
  newsAdapter,
  podcastAdapter,
  redditAdapter,
  venuesAdapter,
  youtubeAdapter,
} from './sampled'

/**
 * The registered source adapters for the Raleigh "For You" demo. Adding a source —
 * including a FUTURE LICENSED PROVIDER (e.g. Sinclair) — is one line here; the UI
 * and blend never change.
 */
export const FOR_YOU_ADAPTERS: SourceAdapter[] = [
  nhlAdapter, // LIVE (NHL web API) + sample fallback
  mlbAdapter, // LIVE (MLB Stats API) + sample fallback
  clipsAdapter, // SAMPLE direct video (expo-video autoplay path)
  youtubeAdapter, // SAMPLE discovery; embed renders live
  newsAdapter, // SAMPLE (RSS → backend proxy)
  redditAdapter, // SAMPLE (reddit → backend proxy)
  podcastAdapter, // SAMPLE (RSS → backend proxy)
  collegeAdapter, // SAMPLE
  highSchoolAdapter, // SAMPLE (no public API)
  venuesAdapter, // SAMPLE
]

/**
 * Fetch every registered adapter concurrently (each is individually resilient) and
 * blend the results into the final feed. A single failing adapter yields [] and
 * never breaks the feed.
 */
export async function loadForYouFeed(
  adapters: SourceAdapter[] = FOR_YOU_ADAPTERS,
  ctx: SourceAdapterContext = {},
) {
  const groups = await Promise.all(
    adapters.map(async a => {
      try {
        return await a.fetch(ctx)
      } catch {
        return []
      }
    }),
  )
  return blendFeeds(groups)
}

export {mlbAdapter,nhlAdapter}
