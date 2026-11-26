# expo-ao-auth-session (iOS only)

Runs the Signature (Janus) authorize leg in `ASWebAuthenticationSession` and
completes it on a **claimed https callback** -
`ASWebAuthenticationSession.Callback.https(host:path:)`, iOS 17.4+ - instead of
a custom URL scheme. `expo-web-browser`'s `openAuthSessionAsync` (Expo 54)
only takes a scheme, hence this module.

Used by `src/features/aoSignature/browser.ts` only when the Signature lane is
armed with `EXPO_PUBLIC_AO_SIGNATURE_APP_REDIRECT_URI` =
`https://<host>/auth/janus/community/app-callback` (and no
`EXPO_PUBLIC_AO_SIGNATURE_SCHEME`). It is required lazily, so a dark build - or
an OTA update onto a binary without the module - never touches it.

## Requirements for it to work on a device

- iOS 17.4+ (an armed build raises the app floor to 17.4 in `app.config.js`;
  the pod itself stays at 17.0 so dark builds still compile, and the Swift code
  checks availability at runtime).
- The app is associated with the callback host: `app.config.js` adds
  `applinks:<host>` and `webcredentials:<host>` when armed (paid signing only -
  a free personal team cannot sign Associated Domains).
- The host's `/.well-known/apple-app-site-association` lists
  `4TKU6PS7ZS.com.authorityone.app` for the callback path (applinks) and as a
  `webcredentials` app. That file is served by the runtime, not this repo.

## API

- `authorizeWithHttpsCallback(url, callbackUrl)` -> `{type: 'success', url}` or
  `{type: 'cancel'}`; throws `AOAuthSessionUnavailable` (`no-module`,
  `unsupported-os`, `bad-callback`) when it cannot start, which the app maps to
  "not available in this build".
- `httpsCallbackTarget(callbackUrl)` -> the exact `{host, path}` the OS session
  matches (pure, tested).

The session is non-ephemeral (the person's Janus browser session carries over)
and one-at-a-time. Nothing here reads or keeps a token: the callback URL (code +
state) goes straight back to JS, which checks the state and has the runtime
redeem it.
