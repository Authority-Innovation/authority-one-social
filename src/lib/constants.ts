import {type Insets, Platform} from 'react-native'
import {type AppBskyActorDefs, BSKY_LABELER_DID} from '@atproto/api'

import {type ProxyHeaderValue} from '#/state/session/agent'
import {BLUESKY_PROXY_DID, CHAT_PROXY_DID, IS_DEV} from '#/env'

export const LOCAL_DEV_SERVICE =
  Platform.OS === 'android' ? 'http://10.0.2.2:2583' : 'http://localhost:2583'
export const STAGING_SERVICE = 'https://staging.bsky.dev'
export const BSKY_SERVICE = 'https://bsky.social'
export const BSKY_SERVICE_DID = 'did:web:bsky.social'
// Authority One: public (unauthenticated) AppView base URL. Override per-env via
// EXPO_PUBLIC_APPVIEW_URL (set in Cloudflare Pages to https://appview.authority-one.com).
// Falls back to Bluesky's public AppView so the local `pnpm web` dev flow is unchanged.
export const PUBLIC_BSKY_SERVICE =
  process.env.EXPO_PUBLIC_APPVIEW_URL || 'https://public.api.bsky.app'
// Authority One: self-hosted PDS. Override per-env via EXPO_PUBLIC_PDS_URL.
export const AUTHORITY_ONE_SERVICE =
  process.env.EXPO_PUBLIC_PDS_URL || 'https://pds.authority-one.com'
export const DEFAULT_SERVICE = AUTHORITY_ONE_SERVICE

// Agent runtime (Cloudflare Worker): conversational chat agent + approval-gated actions.
// Override per-env with EXPO_PUBLIC_AGENT_RUNTIME_URL (see src/lib/agent-runtime/config.ts).
export const AGENT_RUNTIME_SERVICE =
  'https://authority-one-agent-runtime.e-479.workers.dev'

// ─────────────────────────────────────────────────────────────────────────────
// Authority One legal / support links — single source of truth.
//
// All Terms / Privacy / Support / status links in the One app route through
// these constants so the real URL only needs to be set in ONE place.
//
// TODO(legal): FINALIZE BEFORE PUBLIC BUILD.
//   1. The pages live (as DRAFTS) in app-legal/ (terms / privacy / support) and
//      have NOT been reviewed by a lawyer — see app-legal/README.md.
//   2. The hosting domain + paths below are a PLACEHOLDER. Set
//      AUTHORITY_ONE_LEGAL_BASE (and the /terms, /privacy, /support paths if they
//      differ) to wherever app-legal/ ends up hosted, then this is done.
//   3. There is no dedicated status page or community-guidelines page yet; both
//      currently fall back to the support page (see below) — give them real URLs
//      if/when they exist.
// ─────────────────────────────────────────────────────────────────────────────
export const AUTHORITY_ONE_LEGAL_BASE = 'https://authority-one.com'
export const AUTHORITY_ONE_TOS_URL = `${AUTHORITY_ONE_LEGAL_BASE}/terms`
export const AUTHORITY_ONE_PRIVACY_URL = `${AUTHORITY_ONE_LEGAL_BASE}/privacy`
export const AUTHORITY_ONE_SUPPORT_URL = `${AUTHORITY_ONE_LEGAL_BASE}/support`

// Was: https://blueskyweb.zendesk.com/hc/en-us — repointed to our support page.
export const HELP_DESK_URL = AUTHORITY_ONE_SUPPORT_URL
export const CHAT_SERVICE = 'https://api.bsky.chat'
export const EMBED_SERVICE = 'https://embed.bsky.app'
export const EMBED_SCRIPT = `${EMBED_SERVICE}/static/embed.js`
export const BSKY_DOWNLOAD_URL = 'https://bsky.app/download'
export const STARTER_PACK_MAX_SIZE = 150
export const CARD_ASPECT_RATIO = 1200 / 630

// HACK
// Yes, this is exactly what it looks like. It's a hard-coded constant
// reflecting the number of new users in the last week. We don't have
// time to add a route to the servers for this so we're just going to hard
// code and update this number with each release until we can get the
// server route done.
// -prf
export const JOINED_THIS_WEEK = 560000 // estimate as of 12/18/24

export const DISCOVER_DEBUG_DIDS: Record<string, true> = {
  'did:plc:oisofpd7lj26yvgiivf3lxsi': true, // hailey.at
  'did:plc:p2cp5gopk7mgjegy6wadk3ep': true, // samuel.bsky.team
  'did:plc:ragtjsm2j2vknwkz3zp4oxrd': true, // pfrazee.com
  'did:plc:vpkhqolt662uhesyj6nxm7ys': true, // why.bsky.team
  'did:plc:3jpt2mvvsumj2r7eqk4gzzjz': true, // esb.lol
  'did:plc:vjug55kidv6sye7ykr5faxxn': true, // emilyliu.me
  'did:plc:tgqseeot47ymot4zro244fj3': true, // iwsmith.bsky.social
  'did:plc:2dzyut5lxna5ljiaasgeuffz': true, // darrin.bsky.team
}

// TODO(support): the old Zendesk feedback form (/requests/new + tf_* field
// prefill) no longer applies. app-legal/support is a static page, not a ticket
// form, so we just link to it and the email/handle prefill is dropped. Wire a
// real contact/feedback form here if/when one exists.
export function FEEDBACK_FORM_URL(_opts: {
  email?: string
  handle?: string
}): string {
  return AUTHORITY_ONE_SUPPORT_URL
}

export const MAX_DISPLAY_NAME = 64
export const MAX_DESCRIPTION = 256

export const MAX_GRAPHEME_LENGTH = 300

export const MAX_DRAFT_GRAPHEME_LENGTH = 1000

export const MAX_DM_GRAPHEME_LENGTH = 1000

export const MAX_GROUP_NAME_GRAPHEME_LENGTH = 50

// Recommended is 100 per: https://www.w3.org/WAI/GL/WCAG20/tests/test3.html
// but increasing limit per user feedback
export const MAX_ALT_TEXT = 2000

export const MAX_REPORT_REASON_GRAPHEME_LENGTH = 2000

export function IS_TEST_USER(handle?: string) {
  return handle && handle?.endsWith('.test')
}

export function IS_PROD_SERVICE(url?: string) {
  return url && url !== STAGING_SERVICE && !url.startsWith(LOCAL_DEV_SERVICE)
}

export const PROD_DEFAULT_FEED = (rkey: string) =>
  `at://did:plc:z72i7hdynmk6r22z27h6tvur/app.bsky.feed.generator/${rkey}`

export const STAGING_DEFAULT_FEED = (rkey: string) =>
  `at://did:plc:yofh3kx63drvfljkibw5zuxo/app.bsky.feed.generator/${rkey}`

export const PROD_FEEDS = [
  `feedgen|${PROD_DEFAULT_FEED('whats-hot')}`,
  `feedgen|${PROD_DEFAULT_FEED('thevids')}`,
]

export const STAGING_FEEDS = [
  `feedgen|${STAGING_DEFAULT_FEED('whats-hot')}`,
  `feedgen|${STAGING_DEFAULT_FEED('thevids')}`,
]

export const IMAGE_SIZE_CONFIG_POSTS = {
  maxDimension: 4000,
  maxSize: 2000000,
}

export const IMAGE_SIZE_CONFIG_2K_1MB = {
  maxDimension: 2000,
  maxSize: 1000000,
}

export const STAGING_LINK_META_PROXY =
  'https://cardyb.staging.bsky.dev/v1/extract?url='

export const PROD_LINK_META_PROXY = 'https://cardyb.bsky.app/v1/extract?url='

export function LINK_META_PROXY(_serviceUrl: string) {
  if (IS_DEV) {
    return STAGING_LINK_META_PROXY
  }

  return PROD_LINK_META_PROXY
}

// TODO(infra): no dedicated One status page yet — falls back to support.
// Was: https://status.bsky.app/
export const STATUS_PAGE_URL = AUTHORITY_ONE_SUPPORT_URL

// Hitslop constants
export const createHitslop = (size: number): Insets => ({
  top: size,
  left: size,
  bottom: size,
  right: size,
})
export const HITSLOP_10 = createHitslop(10)
export const HITSLOP_20 = createHitslop(20)
export const HITSLOP_30 = createHitslop(30)
export const LANG_DROPDOWN_HITSLOP = {top: 10, bottom: 10, left: 4, right: 4}
export const BACK_HITSLOP = HITSLOP_30
export const MAX_POST_LINES = 25

export const BSKY_APP_ACCOUNT_DID = 'did:plc:z72i7hdynmk6r22z27h6tvur'

export const BSKY_FEED_OWNER_DIDS = [
  BSKY_APP_ACCOUNT_DID,
  'did:plc:vpkhqolt662uhesyj6nxm7ys',
  'did:plc:q6gjnaw2blty4crticxkmujt',
]

export const DISCOVER_FEED_URI =
  'at://did:plc:z72i7hdynmk6r22z27h6tvur/app.bsky.feed.generator/whats-hot'
export const VIDEO_FEED_URI =
  'at://did:plc:z72i7hdynmk6r22z27h6tvur/app.bsky.feed.generator/thevids'
export const STAGING_VIDEO_FEED_URI =
  'at://did:plc:yofh3kx63drvfljkibw5zuxo/app.bsky.feed.generator/thevids'
export const VIDEO_FEED_URIS = [VIDEO_FEED_URI, STAGING_VIDEO_FEED_URI]
export const DISCOVER_SAVED_FEED = {
  type: 'feed',
  value: DISCOVER_FEED_URI,
  pinned: true,
}
export const TIMELINE_SAVED_FEED = {
  type: 'timeline',
  value: 'following',
  pinned: true,
}
export const VIDEO_SAVED_FEED = {
  type: 'feed',
  value: VIDEO_FEED_URI,
  pinned: true,
}

export const RECOMMENDED_SAVED_FEEDS: Pick<
  AppBskyActorDefs.SavedFeed,
  'type' | 'value' | 'pinned'
>[] = [DISCOVER_SAVED_FEED, TIMELINE_SAVED_FEED]

export const KNOWN_SHUTDOWN_FEEDS = [
  'at://did:plc:wqowuobffl66jv3kpsvo7ak4/app.bsky.feed.generator/the-algorithm', // for you by skygaze
]

export const GIF_SERVICE = 'https://gifs.bsky.app'

export const GIF_KLIPY_SEARCH = (params: string) =>
  `${GIF_SERVICE}/klipy/v2/search?${params}`
export const GIF_KLIPY_FEATURED = (params: string) =>
  `${GIF_SERVICE}/klipy/v2/featured?${params}`

export const MAX_LABELERS = 20

export const VIDEO_SERVICE = 'https://video.bsky.app'
export const VIDEO_SERVICE_DID = 'did:web:video.bsky.app'

export const VIDEO_MAX_DURATION_MS = 3 * 60 * 1000 // 3 minutes in milliseconds
/**
 * Maximum size of a video in megabytes, _not_ mebibytes. Backend uses
 * ISO megabytes.
 */
export const VIDEO_MAX_SIZE_MB = 300
export const VIDEO_MAX_SIZE = VIDEO_MAX_SIZE_MB * 1000 * 1000 // 300mb

export const SUPPORTED_MIME_TYPES = [
  'video/mp4',
  'video/mpeg',
  'video/webm',
  'video/quicktime',
  'image/gif',
] as const

export type SupportedMimeTypes = (typeof SUPPORTED_MIME_TYPES)[number]

export const EMOJI_REACTION_LIMIT = 5

export const urls = {
  website: {
    blog: {
      findFriendsAnnouncement:
        'https://bsky.social/about/blog/12-16-2025-find-friends',
      initialVerificationAnnouncement: `https://bsky.social/about/blog/04-21-2025-verification`,
      searchTipsAndTricks: 'https://bsky.social/about/blog/05-31-2024-search',
    },
    support: {
      // TODO(legal): no find-friends-specific policy yet — falls back to the
      // main privacy policy. Give it its own URL if contact-sync ships.
      findFriendsPrivacyPolicy: AUTHORITY_ONE_PRIVACY_URL,
    },
  },
}

// Authority One: AppView base URL + DID. Override per-env via EXPO_PUBLIC_APPVIEW_URL
// / EXPO_PUBLIC_APPVIEW_DID (Cloudflare Pages: https://appview.authority-one.com and
// its did:web). Fallbacks keep the local `pnpm web` dev flow pointed at Bluesky's AppView.
export const PUBLIC_APPVIEW =
  process.env.EXPO_PUBLIC_APPVIEW_URL || 'https://api.bsky.app'
export const PUBLIC_APPVIEW_DID =
  process.env.EXPO_PUBLIC_APPVIEW_DID || 'did:web:api.bsky.app'
export const PUBLIC_STAGING_APPVIEW_DID = 'did:web:api.staging.bsky.dev'

export const DEV_ENV_APPVIEW = `http://localhost:2584` // always the same
export const DEV_ENV_APPVIEW_DID = `did:plc:dw4kbjf5mn7nhenabiqpkyh3` // always the same

// temp hack for e2e - esb
export const BLUESKY_PROXY_HEADER = {
  value: `${BLUESKY_PROXY_DID}#bsky_appview`,
  get() {
    return this.value as ProxyHeaderValue
  },
  set(value: string) {
    this.value = value
  },
}

export const DM_SERVICE_HEADERS = {
  'atproto-proxy': `${CHAT_PROXY_DID}#bsky_chat`,
}

export const BLUESKY_MOD_SERVICE_HEADERS = {
  'atproto-proxy': `${BSKY_LABELER_DID}#atproto_labeler`,
}

export const BLUESKY_NOTIF_SERVICE_HEADERS = {
  'atproto-proxy': `${BLUESKY_PROXY_DID}#bsky_notif`,
}

// Repointed off bsky.social onto our own legal/support pages.
// TODO(legal): no separate community-guidelines page yet — both community links
// fall back to the support page; give them real URLs when those pages exist.
export const webLinks = {
  tos: AUTHORITY_ONE_TOS_URL,
  privacy: AUTHORITY_ONE_PRIVACY_URL,
  community: AUTHORITY_ONE_SUPPORT_URL,
  communityDeprecated: AUTHORITY_ONE_SUPPORT_URL,
}
