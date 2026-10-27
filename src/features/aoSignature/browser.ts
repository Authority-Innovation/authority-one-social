// Native authorize leg: expo-web-browser's auth session (ASWebAuthenticationSession
// on iOS, a Custom Tab + the app's scheme intent on Android). Non-ephemeral, so
// Janus's own browser session (Google, one tap) carries over.
import type * as WebBrowserNS from 'expo-web-browser'

import {type AOFlow} from './pkce'
import {
  type AOBrowserResult,
  type AOLinkPrep,
  type AONativeBrowserPort,
} from './signIn'

type WebBrowserModule = typeof WebBrowserNS

export function getNativeBrowser(): AONativeBrowserPort {
  return {
    async authorize(url, callbackUrl): Promise<AOBrowserResult> {
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
