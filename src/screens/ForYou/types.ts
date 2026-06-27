/**
 * "For You" feed — normalized content model + source-adapter contract.
 *
 * This is the forward-proofing layer: EVERY source (NHL API, RSS, Reddit, a future
 * LICENSED provider like Sinclair) implements the same {@link SourceAdapter} and
 * emits the same {@link FeedItem}. The swipe UI only ever sees FeedItems, so a new
 * source slots in by registering one adapter — no UI changes.
 */

/** The polymorphic kinds the full-screen renderer knows how to display. */
export type FeedMediaType = 'video' | 'image' | 'text' | 'link' | 'audio'

/**
 * VIDEO media. Either a directly playable `url` (mp4/HLS — autoplays via expo-video)
 * OR an official `embed` for highlight video we must NOT re-host (e.g. YouTube).
 */
export interface FeedMediaVideo {
  kind: 'video'
  /** Direct playable URL. Mutually-ish exclusive with `embed`. */
  url?: string
  /** Official embed (non-rehosted) — rendered via the provider's player. */
  embed?: {provider: 'youtube'; videoId: string}
  posterUrl?: string
  /** width/height, used to letterbox; defaults to 9:16 portrait. */
  aspectRatio?: number
}

/** IMAGE media — one or more full-bleed images (carousel when >1). */
export interface FeedMediaImages {
  kind: 'image'
  images: {url: string; alt?: string; aspectRatio?: number}[]
}

/** AUDIO/PODCAST media — a playable episode or a link to one. */
export interface FeedMediaAudio {
  kind: 'audio'
  /** Direct audio URL (mp3) if playable in-app. */
  url?: string
  /** Episode page to open when not directly playable. */
  episodeUrl?: string
  artworkUrl?: string
  durationSec?: number
}

export type FeedMedia = FeedMediaVideo | FeedMediaImages | FeedMediaAudio

/** Provenance of a source's data: live-fetched vs seeded sample. */
export type SourceOrigin = 'live' | 'sample'

/** Attribution shown on every item and required by licensed-content deals. */
export interface FeedSource {
  /** Adapter id, e.g. 'nhl'. */
  id: string
  /** Display label, e.g. 'NHL'. */
  name: string
  origin: SourceOrigin
  iconUrl?: string
}

/** Geo / team / topic tags — drive ranking (M2) and filtering. */
export interface FeedTags {
  teams?: string[]
  geo?: string[]
  topics?: string[]
}

/**
 * Structured score for a designed full-frame score card (NHL/MLB). When present,
 * the renderer shows a ScoreCard regardless of `type`.
 */
export interface FeedScore {
  home: string
  away: string
  homeScore?: number
  awayScore?: number
  /** e.g. 'Final', 'Upcoming', 'Live'. */
  state?: string
  /** Team color (hex) for the card background. */
  accentColor?: string
}

/** The single normalized item every adapter produces and the UI consumes. */
export interface FeedItem {
  /** Globally unique + stable, conventionally `${source.id}:${nativeId}`. */
  id: string
  type: FeedMediaType
  title: string
  /** Optional body/summary for text & link cards. */
  summary?: string
  /** Typed media payload; omitted for pure text cards. */
  media?: FeedMedia
  /** Canonical thumbnail for text/link/audio cards (and video poster fallback). */
  thumbnailUrl?: string
  source: FeedSource
  /** Author/handle within the source (reddit user, YT channel, byline). */
  author?: {name: string; handle?: string; avatarUrl?: string}
  /** Tap-through canonical URL (open in browser / source app). */
  link?: string
  /** Creation/publish time, Unix ms. */
  createdAt: number
  tags: FeedTags
  /** Present for game items -> rendered as a designed full-frame score card. */
  score?: FeedScore
}

/** Context passed to an adapter's fetch (cancellation + soft item cap). */
export interface SourceAdapterContext {
  signal?: AbortSignal
  /** Soft cap on items the blend wants from this source. */
  limit?: number
}

/**
 * The contract every content source implements. Adding a source = adding one of
 * these and registering it (see `./sources`). `fetch` MUST be resilient: it should
 * resolve to `[]` (or seeded sample) on any error rather than throw, so one flaky
 * source never breaks the blended feed.
 */
export interface SourceAdapter {
  /** Stable id, also used as the FeedItem id prefix. */
  id: string
  /** Human label for attribution + diagnostics. */
  name: string
  /** Whether this adapter returns live network data or seeded sample data. */
  origin: SourceOrigin
  /**
   * True when going live requires a server-side proxy (CORS / API key / signed
   * request) that M1 intentionally defers — the adapter ships sample data for now.
   */
  needsBackendProxy?: boolean
  /** Fetch + normalize. Never throws; returns [] on failure. */
  fetch(ctx: SourceAdapterContext): Promise<FeedItem[]>
}
