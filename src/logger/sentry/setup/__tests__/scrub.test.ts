import {describe, expect, it} from '@jest/globals'

import {redactSecrets, scrubBreadcrumb} from '../scrub'

const TOKEN = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJvd25lciJ9.c2ln'

describe('Sentry breadcrumb scrub (Agent Live review L1)', () => {
  it('redacts the LiveKit token in the /rtc/validate URL', () => {
    const crumb = scrubBreadcrumb({
      category: 'fetch',
      data: {
        method: 'GET',
        url: `https://media.test/rtc/validate?access_token=${TOKEN}&auto_subscribe=0`,
        status_code: 401,
      },
    })
    expect(JSON.stringify(crumb)).not.toContain(TOKEN)
    expect(crumb.data.url).toBe(
      'https://media.test/rtc/validate?access_token=<redacted>&auto_subscribe=0',
    )
    expect(crumb.data.status_code).toBe(401)
  })

  it('redacts join_request and token params, in messages too', () => {
    expect(
      redactSecrets(`wss://x/rtc/v1?join_request=abc&token=${TOKEN}`),
    ).toBe('wss://x/rtc/v1?join_request=<redacted>&token=<redacted>')
    expect(
      scrubBreadcrumb({message: `GET /rtc?access_token=${TOKEN}`}).message,
    ).toBe('GET /rtc?access_token=<redacted>')
  })

  it('leaves other breadcrumbs alone', () => {
    const crumb = {message: 'navigated', data: {to: '/profile', n: 1}}
    expect(scrubBreadcrumb(crumb)).toEqual(crumb)
  })
})
