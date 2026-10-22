// Web persistence for the AO session: NONE — memory only, by design.
//
// The runtime returns the 30-day `aos1.` bearer in a JSON body and offers no
// httpOnly-cookie session (its /app/* CORS is Bearer-only, no credentials), so
// any browser storage would leave a long-lived bearer readable by any script
// that ever runs on this origin (localStorage/sessionStorage/IndexedDB alike).
// Residual risk, stated: while the tab is open the token is in JS memory, so an
// XSS on the app origin could still read it — the same exposure the PDS
// session already has on web. A reload signs the person out of Signature;
// "Continue with Authority Signature" is one tap while Janus's own browser
// session lives.
export const AO_STORAGE_PERSISTS = false

export function readStoredSession(): Promise<string | null> {
  return Promise.resolve(null)
}

export function writeStoredSession(_value: string): Promise<void> {
  return Promise.resolve()
}

export function clearStoredSession(): Promise<void> {
  return Promise.resolve()
}
