import {type FeedItem, type SourceAdapter} from '../types'

/**
 * Seeded (SAMPLE) adapters for the Raleigh demo. These prove the swipe UX with
 * realistic content. Each is flagged with how it would go LIVE:
 *
 *  - News RSS (WRAL / N&O / Canes Country): RSS is not JSON + CORS-blocked in the
 *    browser → needs a server-side fetch+parse proxy. `needsBackendProxy: true`.
 *  - Reddit r/canes: the .json endpoint is rate-limited + CORS/user-agent gated for
 *    apps → needs a backend proxy. `needsBackendProxy: true`.
 *  - Podcast RSS (Locked On Hurricanes / CanesCast): RSS + CORS → backend proxy.
 *  - YouTube highlights: the EMBED renders client-side (official player, not
 *    re-hosted), but DISCOVERY of latest videos needs the YouTube Data API (key)
 *    or channel RSS → backend proxy. `needsBackendProxy: true`.
 *  - NC State / Wake County HS football / venues: no clean public API (HS has none)
 *    → curated sample, likely a licensed/manual source later.
 *
 * Helper: build a resilient sample adapter from a static item list.
 */
function sampleAdapter(
  meta: {id: string; name: string; needsBackendProxy?: boolean},
  items: FeedItem[],
): SourceAdapter {
  return {
    id: meta.id,
    name: meta.name,
    origin: 'sample',
    needsBackendProxy: meta.needsBackendProxy,
    fetch({limit}) {
      return Promise.resolve(items.slice(0, limit ?? items.length))
    },
  }
}

const src = (id: string, name: string) => ({id, name, origin: 'sample' as const})

// ── News RSS ────────────────────────────────────────────────────────────────
export const newsAdapter = sampleAdapter(
  {id: 'news', name: 'Raleigh Sports News', needsBackendProxy: true},
  [
    {
      id: 'news:wral-1',
      type: 'link',
      title: 'Canes lock up home ice with statement win over Caps',
      summary:
        'Carolina’s top line carried the night as the Hurricanes secured a crucial divisional victory.',
      thumbnailUrl: 'https://picsum.photos/seed/wral-canes/1080/1350',
      source: src('news', 'WRAL Sports'),
      author: {name: 'WRAL Sports'},
      link: 'https://www.wral.com/sports/',
      createdAt: Date.parse('2026-06-25T12:00:00Z'),
      tags: {teams: ['Carolina Hurricanes'], geo: ['Raleigh, NC'], topics: ['NHL', 'News']},
    },
    {
      id: 'news:no-1',
      type: 'link',
      title: 'Bulls’ bats break out in series finale at the DBAP',
      summary: 'A six-run third inning powered Durham past Jacksonville.',
      thumbnailUrl: 'https://picsum.photos/seed/no-bulls/1080/1350',
      source: src('news', 'News & Observer'),
      author: {name: 'The News & Observer'},
      link: 'https://www.newsobserver.com/sports/',
      createdAt: Date.parse('2026-06-25T02:30:00Z'),
      tags: {teams: ['Durham Bulls'], geo: ['Durham, NC'], topics: ['Baseball', 'News']},
    },
    {
      id: 'news:cc-1',
      type: 'link',
      title: 'Three takeaways from the Hurricanes’ road trip',
      summary: 'Special teams, goaltending, and the depth scoring that’s trending up.',
      thumbnailUrl: 'https://picsum.photos/seed/canescountry/1080/1350',
      source: src('news', 'Canes Country'),
      author: {name: 'Canes Country'},
      link: 'https://www.canescountry.com/',
      createdAt: Date.parse('2026-06-24T18:00:00Z'),
      tags: {teams: ['Carolina Hurricanes'], geo: ['Raleigh, NC'], topics: ['NHL', 'Analysis']},
    },
  ],
)

// ── Reddit r/canes ──────────────────────────────────────────────────────────
export const redditAdapter = sampleAdapter(
  {id: 'reddit', name: 'r/canes', needsBackendProxy: true},
  [
    {
      id: 'reddit:t3-1',
      type: 'image',
      title: 'The Lenovo Center crowd after the OT winner 🌪️🔴',
      media: {
        kind: 'image',
        images: [
          {url: 'https://picsum.photos/seed/canes-crowd/1080/1920', alt: 'Arena crowd'},
          {url: 'https://picsum.photos/seed/canes-celly/1080/1920', alt: 'Team celebration'},
        ],
      },
      source: src('reddit', 'r/canes'),
      author: {name: 'u/bunchofjerks', handle: 'u/bunchofjerks'},
      link: 'https://www.reddit.com/r/canes/',
      createdAt: Date.parse('2026-06-25T04:00:00Z'),
      tags: {teams: ['Carolina Hurricanes'], geo: ['Raleigh, NC'], topics: ['Fans']},
    },
    {
      id: 'reddit:t3-2',
      type: 'text',
      title: 'Game thread: that penalty kill in the third was *art*',
      summary:
        'Four straight kills to close it out. This team’s structure when protecting a lead has been elite all month.',
      source: src('reddit', 'r/canes'),
      author: {name: 'u/sortagawaydown', handle: 'u/sortagawaydown'},
      link: 'https://www.reddit.com/r/canes/',
      createdAt: Date.parse('2026-06-25T03:40:00Z'),
      tags: {teams: ['Carolina Hurricanes'], topics: ['Fans', 'Discussion']},
    },
  ],
)

// ── Podcast RSS ─────────────────────────────────────────────────────────────
export const podcastAdapter = sampleAdapter(
  {id: 'podcast', name: 'Canes Podcasts', needsBackendProxy: true},
  [
    {
      id: 'podcast:lockedon-1',
      type: 'audio',
      title: 'Locked On Hurricanes — Home ice secured, playoff picture heats up',
      summary: 'Breaking down the win and what’s next on the schedule.',
      media: {
        kind: 'audio',
        episodeUrl: 'https://www.lockedonpodcasts.com/locked-on-hurricanes',
        artworkUrl: 'https://picsum.photos/seed/lockedon/600/600',
        durationSec: 1680,
      },
      thumbnailUrl: 'https://picsum.photos/seed/lockedon/600/600',
      source: src('podcast', 'Locked On Hurricanes'),
      link: 'https://www.lockedonpodcasts.com/locked-on-hurricanes',
      createdAt: Date.parse('2026-06-25T11:00:00Z'),
      tags: {teams: ['Carolina Hurricanes'], topics: ['Podcast', 'NHL']},
    },
    {
      id: 'podcast:canescast-1',
      type: 'audio',
      title: 'CanesCast — Mailbag: trade deadline targets',
      summary: 'Listeners’ questions on depth, cap space, and the kids.',
      media: {
        kind: 'audio',
        episodeUrl: 'https://www.nhl.com/hurricanes/fans/canescast',
        artworkUrl: 'https://picsum.photos/seed/canescast/600/600',
        durationSec: 2400,
      },
      thumbnailUrl: 'https://picsum.photos/seed/canescast/600/600',
      source: src('podcast', 'CanesCast'),
      link: 'https://www.nhl.com/hurricanes/fans/canescast',
      createdAt: Date.parse('2026-06-24T16:00:00Z'),
      tags: {teams: ['Carolina Hurricanes'], topics: ['Podcast', 'NHL']},
    },
  ],
)

// ── YouTube highlights (embed renders live; discovery needs Data API) ─────────
export const youtubeAdapter = sampleAdapter(
  {id: 'youtube', name: 'NHL / Hurricanes (YouTube)', needsBackendProxy: true},
  [
    {
      id: 'youtube:hl-1',
      type: 'video',
      title: 'Hurricanes vs. Capitals | Game Highlights',
      media: {
        kind: 'video',
        // PLACEHOLDER embed id standing in for the real Canes/NHL highlight. The
        // official YouTube player is used (not re-hosted); swap in the real videoId
        // once the YouTube Data API discovery proxy lands.
        embed: {provider: 'youtube', videoId: 'aqz-KE-bpKQ'},
        posterUrl: 'https://picsum.photos/seed/canes-hl/1080/1920',
        aspectRatio: 16 / 9,
      },
      source: src('youtube', 'NHL'),
      author: {name: 'NHL', handle: '@NHL'},
      link: 'https://www.youtube.com/@NHL',
      createdAt: Date.parse('2026-06-25T05:30:00Z'),
      tags: {teams: ['Carolina Hurricanes'], topics: ['NHL', 'Highlights', 'Video']},
    },
  ],
)

// ── Direct video (sample mp4 — proves expo-video autoplay path) ───────────────
export const clipsAdapter = sampleAdapter(
  {id: 'clips', name: 'Canes Clips'},
  [
    {
      id: 'clips:reel-1',
      type: 'video',
      title: 'Mic’d up: behind the bench for the OT winner',
      media: {
        kind: 'video',
        // Public sample mp4 standing in for a licensed/owned vertical clip.
        url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4',
        posterUrl: 'https://picsum.photos/seed/canes-reel/1080/1920',
        aspectRatio: 9 / 16,
      },
      source: src('clips', 'Hurricanes'),
      link: 'https://www.nhl.com/hurricanes/video',
      createdAt: Date.parse('2026-06-25T07:00:00Z'),
      tags: {teams: ['Carolina Hurricanes'], topics: ['Video', 'Highlights']},
    },
  ],
)

// ── NC State (college) ────────────────────────────────────────────────────────
export const collegeAdapter = sampleAdapter(
  {id: 'college', name: 'NC State Athletics'},
  [
    {
      id: 'college:ncsu-1',
      type: 'link',
      title: 'NC State football opens camp with eyes on the ACC',
      summary: 'The Wolfpack return key starters as fall practice gets underway in Raleigh.',
      thumbnailUrl: 'https://picsum.photos/seed/ncstate/1080/1350',
      source: src('college', 'GoPack.com'),
      author: {name: 'NC State Athletics'},
      link: 'https://gopack.com/sports/football',
      createdAt: Date.parse('2026-06-24T14:00:00Z'),
      tags: {teams: ['NC State Wolfpack'], geo: ['Raleigh, NC'], topics: ['College', 'Football']},
    },
  ],
)

// ── Wake County HS football (no public API — sample/curated) ──────────────────
export const highSchoolAdapter = sampleAdapter(
  {id: 'highschool', name: 'Wake County HS Football'},
  [
    {
      id: 'highschool:hsot-1',
      type: 'link',
      title: 'Friday lights: Wakefield edges Millbrook in OT thriller',
      summary: 'A walk-off field goal caps a back-and-forth Wake County opener.',
      thumbnailUrl: 'https://picsum.photos/seed/hsfootball/1080/1350',
      source: src('highschool', 'HighSchoolOT'),
      author: {name: 'HighSchoolOT'},
      link: 'https://www.highschoolot.com/',
      createdAt: Date.parse('2026-06-23T03:00:00Z'),
      tags: {geo: ['Wake County, NC', 'Raleigh, NC'], topics: ['High School', 'Football']},
    },
  ],
)

// ── Raleigh venue / event ─────────────────────────────────────────────────────
export const venuesAdapter = sampleAdapter(
  {id: 'venues', name: 'Raleigh Events'},
  [
    {
      id: 'venues:lenovo-1',
      type: 'link',
      title: 'Lenovo Center: Hurricanes Watch Party + live music this Saturday',
      summary: 'Doors at 5 PM. Outdoor plaza screening for the road game.',
      thumbnailUrl: 'https://picsum.photos/seed/lenovo/1080/1350',
      source: src('venues', 'Lenovo Center'),
      link: 'https://www.lenovocenter.com/events',
      createdAt: Date.parse('2026-06-24T09:00:00Z'),
      tags: {geo: ['Raleigh, NC'], topics: ['Events', 'Venue']},
    },
  ],
)
