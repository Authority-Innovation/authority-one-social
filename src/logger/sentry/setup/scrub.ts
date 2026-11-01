/**
 * Breadcrumb scrub (Agent Live review L1). livekit-client puts the LiveKit
 * join token in the query of its `/rtc/validate?access_token=...` fetch, and
 * Sentry records fetch URLs as breadcrumbs. Redact token-bearing query values
 * from a breadcrumb's message and its data fields before anything is sent.
 * Pure, so it is tested without Sentry.
 */
const SECRET_PARAMS = /([?&](?:access_token|token|join_request)=)[^&#\s"']*/gi

export function redactSecrets(text: string): string {
  return text.replace(SECRET_PARAMS, '$1<redacted>')
}

type Crumb = {message?: string; data?: Record<string, unknown>}

export function scrubBreadcrumb<T extends Crumb>(crumb: T): T {
  const out = {...crumb}
  if (typeof out.message === 'string') out.message = redactSecrets(out.message)
  if (out.data) {
    const data: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(out.data)) {
      data[k] = typeof v === 'string' ? redactSecrets(v) : v
    }
    out.data = data
  }
  return out
}
