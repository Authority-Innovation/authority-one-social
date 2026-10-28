// Web authorize leg: a FULL-PAGE redirect to Janus and back to this app's own
// callback URL (EXPO_PUBLIC_AO_SIGNATURE_WEB_REDIRECT_URI), then the runtime's
// server-side exchange (grant mode).
//
// Why not expo-web-browser's popup on web: popups are blocked on mobile
// browsers when not opened synchronously from the tap, Janus's consent page may
// break out of a popup, and its web handshake parks the code-bearing callback
// URL in localStorage. The redirect needs only this attempt's PKCE verifier,
// state and nonce to survive the round trip — kept in sessionStorage (this tab
// only), for at most FLOW_MAX_AGE_MS, and deleted the moment the page reads it
// back. In link mode the pending record also carries the PDS accessJwt that
// minted the link code (the web app already keeps that PDS session in
// localStorage, so this adds no new exposure).
import {AO_SIGNATURE_CONFIG} from './config'
import {type AOFlow, FLOW_MAX_AGE_MS} from './pkce'
import {type AOLinkPrep, type AONativeBrowserPort} from './signIn'

const PENDING_KEY = 'ao-signature-pending-v1'

export interface AOWebPending {
  flow: AOFlow
  link: AOLinkPrep | null
  returnTo?: string
}

export function getNativeBrowser(): AONativeBrowserPort {
  throw new Error('native only')
}

export function startWebRedirect(url: string, pending: AOWebPending): void {
  const returnTo = window.location.pathname + window.location.search
  window.sessionStorage.setItem(
    PENDING_KEY,
    JSON.stringify({...pending, returnTo}),
  )
  window.location.assign(url)
}

let captured: {url: string; pending: AOWebPending} | null = null

function readPending(now: number): AOWebPending | null {
  let raw: string | null = null
  try {
    raw = window.sessionStorage.getItem(PENDING_KEY)
    window.sessionStorage.removeItem(PENDING_KEY)
  } catch {
    return null
  }
  if (!raw) return null
  try {
    const p = JSON.parse(raw) as AOWebPending
    if (!p?.flow || typeof p.flow.createdAt !== 'number') return null
    if (now - p.flow.createdAt > FLOW_MAX_AGE_MS) return null
    return p
  } catch {
    return null
  }
}

/**
 * Called once, before the navigator reads the URL (App.web.tsx). If this page
 * load is Janus coming back to the callback path, take the query + the pending
 * attempt into memory and put the address bar back where the person was, so
 * the code never sits in the URL or history. Dark ⇒ returns without touching
 * anything.
 */
export function captureAOSignatureWebCallback(now: number = Date.now()): void {
  const cfg = AO_SIGNATURE_CONFIG
  if (!cfg || cfg.platform !== 'web' || typeof window === 'undefined') return
  let target: URL
  try {
    target = new URL(cfg.redirectUri)
  } catch {
    return
  }
  const here = window.location
  if (here.origin !== target.origin || here.pathname !== target.pathname) return
  const url = here.href
  const pending = readPending(now)
  const back = pending?.returnTo
  const safe =
    typeof back === 'string' && back.startsWith('/') && !back.startsWith('//')
      ? back
      : '/'
  window.history.replaceState(null, '', safe)
  if (pending) captured = {url, pending}
}

export function takeWebCallback(): {url: string; pending: AOWebPending} | null {
  const out = captured
  captured = null
  return out
}
