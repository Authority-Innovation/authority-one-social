// Native authorize leg, by callback mode:
//  · https (Community iOS, the claimed callback): the local expo-ao-auth-session
//    module - ASWebAuthenticationSession with Callback.https (iOS 17.4+);
//  · bounce (legacy): expo-web-browser's auth session (ASWebAuthenticationSession
//    on iOS, a Custom Tab + the app's scheme intent on Android).
// Non-ephemeral either way, so Janus's own browser session (Google, one tap)
// carries over. Each native module is loaded only once a sign-in starts.
import type * as WebBrowserNS from 'expo-web-browser'

import type * as AOAuthSessionNS from '../../../modules/expo-ao-auth-session'
import {AOSignatureError} from './errors'
import {type AOFlow} from './pkce'
import {
  type AOBrowserResult,
  type AOLinkPrep,
  type AONativeBrowserPort,
} from './signIn'

type WebBrowserModule = typeof WebBrowserNS
type AOAuthSessionModule = typeof AOAuthSessionNS

/** The callback the session waits for is the claimed https URL itself. */
export function isHttpsCallback(callbackUrl: string): boolean {
  return callbackUrl.startsWith('https://')
}

export function getNativeBrowser(): AONativeBrowserPort {
  return {
    async authorize(url, callbackUrl): Promise<AOBrowserResult> {
      if (isHttpsCallback(callbackUrl)) {
        const m =
          require('../../../modules/expo-ao-auth-session') as AOAuthSessionModule
        try {
          return await m.authorizeWithHttpsCallback(url, callbackUrl)
        } catch (e) {
          if (e instanceof m.AOAuthSessionUnavailable) {
            throw new AOSignatureError('not-configured')
          }
          throw e
        }
      }
      // Loaded only once a Signature sign-in starts.
      const WebBrowser = require('expo-web-browser') as WebBrowserModule
      const res = await WebBrowser.openAuthSessionAsync(url, callbackUrl, {
        preferEphemeralSession: false,
      })
      return res.type === 'success' && typeof res.url === 'string'
        ? {type: 'success', url: res.url}
        : {type: 'cancel'}
    },
  }
}

export interface AOWebPending {
  flow: AOFlow
  link: AOLinkPrep | null
}

/** Web only. */
export function startWebRedirect(_url: string, _pending: AOWebPending): void {
  throw new Error('web only')
}

/** Web only: native has no page-load callback. */
export function takeWebCallback(): {url: string; pending: AOWebPending} | null {
  return null
}

export function captureAOSignatureWebCallback(): void {}
