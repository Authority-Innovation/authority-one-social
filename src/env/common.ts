import {type Did} from '@atproto/api'

import packageJson from '#/../package.json'

/**
 * The semver version of the app, as defined in `package.json.`
 *
 * N.B. The fallback is needed for Render.com deployments
 */
export const RELEASE_VERSION: string =
  process.env.EXPO_PUBLIC_RELEASE_VERSION || packageJson.version

/**
 * The env the app is running in e.g. development, testflight, production, e2e
 */
export const ENV: string = process.env.EXPO_PUBLIC_ENV as
  | 'production'
  | 'testflight'
  | 'development'
  | 'e2e'
  | (string & {})

/**
 * Indicates whether the app is running in TestFlight
 */
export const IS_TESTFLIGHT = ENV === 'testflight'

/**
 * Indicates whether the app is `__DEV__`
 */
export const IS_DEV = __DEV__

/**
 * Indicates whether the app is running in a test environment
 */
export const IS_E2E = ENV === 'e2e'

/**
 * Indicates whether the app is `__DEV__` or TestFlight
 */
export const IS_INTERNAL = IS_DEV || IS_TESTFLIGHT

/**
 * The commit hash that the current bundle was made from. The user can
 * see the commit hash in the app's settings along with the other version info.
 * Useful for debugging/reporting.
 */
export const BUNDLE_IDENTIFIER: string =
  process.env.EXPO_PUBLIC_BUNDLE_IDENTIFIER || 'dev'

/**
 * This will always be in the format of YYMMDDHH, so that it always increases
 * for each build. This should only be used for analytics reporting and shouldn't
 * be used to identify a specific bundle.
 */
export const BUNDLE_DATE: number =
  process.env.EXPO_PUBLIC_BUNDLE_DATE === undefined
    ? 0
    : Number(process.env.EXPO_PUBLIC_BUNDLE_DATE)

/**
 * The log level for the app.
 */
export const LOG_LEVEL = (process.env.EXPO_PUBLIC_LOG_LEVEL || 'info') as
  | 'debug'
  | 'info'
  | 'warn'
  | 'error'

/**
 * Enable debug logs for specific logger instances
 */
export const LOG_DEBUG: string = process.env.EXPO_PUBLIC_LOG_DEBUG || ''

/**
 * The DID of the AppView that authenticated reads are proxied to (the
 * `atproto-proxy` header). Fail-closed: a build missing the env var must
 * default to the Authority One AppView, never Bluesky's - since the
 * 2026-07-06 federation lockdown our accounts are frozen out of
 * api.bsky.app, so pointing there makes followed accounts silently vanish
 * from feeds and profiles with no error.
 */
export const BLUESKY_PROXY_DID: Did =
  process.env.EXPO_PUBLIC_BLUESKY_PROXY_DID ||
  'did:web:appview.authority-one.com'

/**
 * The DID of the chat service to proxy to
 */
export const CHAT_PROXY_DID: Did =
  process.env.EXPO_PUBLIC_CHAT_PROXY_DID || 'did:web:api.bsky.chat'

/**
 * The DID of the Authority One group AppView that `com.authorityone.group.*`
 * reads are proxied to. No default on purpose: when unset, group reads are
 * "not available" and are never sent, so they cannot fall through to the PDS
 * or to the bsky AppView proxy. See `src/state/queries/group.ts`.
 */
export const AUTHORITYONE_GROUP_PROXY_DID: string =
  process.env.EXPO_PUBLIC_AUTHORITYONE_GROUP_PROXY_DID || ''

/**
 * The service id the group AppView publishes in its DID document, i.e. the
 * fragment of the `atproto-proxy` header (`<did>#<service id>`).
 */
export const AUTHORITYONE_GROUP_SERVICE_ID: string =
  process.env.EXPO_PUBLIC_AUTHORITYONE_GROUP_SERVICE_ID || 'authority_one_group'

/**
 * Disables the age assurance access gate: signed-in users always get full
 * access and never see the birthdate/verification interstitial. Intended for
 * self-hosted deployments whose AppView serves no region config and whose
 * accounts are provisioned out-of-band. Unset (the default) keeps upstream
 * Bluesky behavior.
 */
export const DISABLE_AGE_ASSURANCE: boolean =
  process.env.EXPO_PUBLIC_DISABLE_AGE_ASSURANCE === '1' ||
  process.env.EXPO_PUBLIC_DISABLE_AGE_ASSURANCE === 'true'

/**
 * Metrics API host
 */
// Authority One spike: metrics disabled (no events sent to bsky.app)
export const METRICS_API_HOST: string =
  process.env.EXPO_PUBLIC_METRICS_API_HOST || ''

/**
 * Growthbook API host
 */
export const GROWTHBOOK_API_HOST: string =
  process.env.EXPO_PUBLIC_GROWTHBOOK_API_HOST || `${METRICS_API_HOST}/gb`

/**
 * Growthbook client key
 */
// Authority One spike: GrowthBook disabled (empty key)
export const GROWTHBOOK_CLIENT_KEY: string =
  process.env.EXPO_PUBLIC_GROWTHBOOK_CLIENT_KEY || ''

/**
 * Sentry DSN for telemetry
 */
export const SENTRY_DSN: string | undefined = process.env.EXPO_PUBLIC_SENTRY_DSN

/**
 * Bitdrift API key. If undefined, Bitdrift should be disabled.
 */
export const BITDRIFT_API_KEY: string | undefined =
  process.env.EXPO_PUBLIC_BITDRIFT_API_KEY

/**
 * GCP project ID which is required for native device attestation. On web, this
 * should be unset and evaluate to 0.
 */
export const GCP_PROJECT_ID: number =
  process.env.EXPO_PUBLIC_GCP_PROJECT_ID === undefined
    ? 0
    : Number(process.env.EXPO_PUBLIC_GCP_PROJECT_ID)

/**
 * URLs for the app config web worker. Can be a
 * locally running server, see `env.example` for more.
 */
export const GEOLOCATION_DEV_URL = process.env.GEOLOCATION_DEV_URL
export const GEOLOCATION_PROD_URL = `https://ip.bsky.app`
export const GEOLOCATION_URL = IS_DEV
  ? (GEOLOCATION_DEV_URL ?? GEOLOCATION_PROD_URL)
  : GEOLOCATION_PROD_URL

/**
 * URLs for the live-event config web worker. Can be a
 * locally running server, see `env.example` for more.
 */
export const LIVE_EVENTS_DEV_URL = process.env.LIVE_EVENTS_DEV_URL
export const LIVE_EVENTS_PROD_URL = `https://live-events.workers.bsky.app`
export const LIVE_EVENTS_URL = IS_DEV
  ? (LIVE_EVENTS_DEV_URL ?? LIVE_EVENTS_PROD_URL)
  : LIVE_EVENTS_PROD_URL

/**
 * URLs for the app-config web worker. Can be a
 * locally running server, see `env.example` for more.
 *
 * EXPO_PUBLIC_APP_CONFIG_URL overrides in any build: point it at a
 * self-hosted config worker, or set it to an empty string to disable the
 * fetch entirely (self-hosted deployments cannot use Bluesky's worker, which
 * rejects foreign origins via CORS).
 */
export const APP_CONFIG_DEV_URL = process.env.APP_CONFIG_DEV_URL
export const APP_CONFIG_PROD_URL = `https://app-config.workers.bsky.app`
export const APP_CONFIG_URL =
  process.env.EXPO_PUBLIC_APP_CONFIG_URL !== undefined
    ? process.env.EXPO_PUBLIC_APP_CONFIG_URL
    : IS_DEV
      ? (APP_CONFIG_DEV_URL ?? APP_CONFIG_PROD_URL)
      : APP_CONFIG_PROD_URL

/**
 * Authority One Communities. Every flag below defaults OFF (or empty) so a
 * build that does not set them behaves exactly as before.
 *
 * COMMUNITIES_ENABLED gates the whole feature, including the `/c/:id` routes:
 * with it off, a deep link to a community lands on Home.
 */
export const COMMUNITIES_ENABLED: boolean =
  process.env.EXPO_PUBLIC_COMMUNITIES_ENABLED === '1' ||
  process.env.EXPO_PUBLIC_COMMUNITIES_ENABLED === 'true'

/**
 * Shows the community switcher. Has no effect unless COMMUNITIES_ENABLED.
 */
export const COMMUNITY_SWITCHER: boolean =
  process.env.EXPO_PUBLIC_COMMUNITY_SWITCHER === '1' ||
  process.env.EXPO_PUBLIC_COMMUNITY_SWITCHER === 'true'

/**
 * Pins a brand build to a single community (its id). Empty means not locked.
 */
export const LOCKED_COMMUNITY: string =
  process.env.EXPO_PUBLIC_LOCKED_COMMUNITY || ''

/**
 * The brand this build ships as.
 */
export const BRAND: string = process.env.EXPO_PUBLIC_BRAND || 'authority-one'

/**
 * Full-app reskin for a brand build. Empty means no reskin - the AO app only
 * ever applies a community's accent to that community's header.
 */
export const BRAND_SKIN: string = process.env.EXPO_PUBLIC_BRAND_SKIN || ''
