# Community Signature: app https callback + person-only (dark) - task 71b9bc89

- **Branch:** `feat/community-signature-1126`
- **Base:** `origin/one-dev/build-52-community-duo` 3ade7fe99 (build 52). It contains
  `sig/community-signin` 84397baa3 and is newer, so it was used, per the spec.
- **Ledger:** rc_972bf2b66919483a. Plan step 2 (app branch), items (a), (b), (c) and (d).
  Item (e), the owner's "Invite by email", is not built: it needs a runtime route that
  does not exist yet (plan step 1b).
- **State:** DARK. Every `EXPO_PUBLIC_AO_SIGNATURE_*` is unset, so nothing changes in a
  build. That is pinned by tests: the dark config resolves to iOS 17.0, scheme `one`
  and the brand's associated domains only.
- **Nothing was deployed, uploaded or sent.** There was no EAS, no TestFlight, no
  runtime change and no secrets.

## Tests: NOT RUN

**I could not run any tests, tsc or lint on this runner.**
- The worktree has no `node_modules`, `pnpm` is not installed, and the allowlist denies
  `npx pnpm@11.5.2 install`.
- I asked the orchestrator to install pnpm or allow the npx form (qid `4b7965df`). There
  was no answer before this report.
- A plain-node smoke script (`scripts/ao-signature-config-smoke.js`) also needs
  `expo/config-plugins` from `node_modules`, so it did not run either.

Everything below was checked only by reading the code. Before merge, run:

```
pnpm install --frozen-lockfile
pnpm test        # tsc -p tsconfig.communities.json + jest
pnpm typecheck
pnpm lint
node scripts/ao-signature-config-smoke.js   # prints scheme / associatedDomains / iOS floor for dark, https and bounce
```

The Swift module was not compiled. That needs the Mac's `xcodebuild` (see "Build 53"
below).

## What changed

### 1. Callback: the claimed https link, not the custom scheme

**Config** (`src/features/aoSignature/config.ts`):
- `AOSignatureConfig.callbackMode` is new and is `'https' | 'bounce' | null`.
- **https mode** turns on when `EXPO_PUBLIC_AO_SIGNATURE_APP_REDIRECT_URI` has the path
  `/auth/janus/community/app-callback` (`AO_SIGNATURE_HTTPS_CALLBACK_PATH`).
  - It applies to iOS only. Android keeps the bounce until it has its own client and
    App Links.
  - `EXPO_PUBLIC_AO_SIGNATURE_SCHEME` must be **unset**. A scheme together with the
    https path is a mixed config and is refused, which leaves the lane dark.
  - A port or credentials in the URL are refused, because the OS matches host + path
    only.
  - `callbackUrl` is the redirect itself, and `scheme` is null.
- **Bounce mode** (`/auth/janus/app-callback` or `android-callback` + `community(-dev)`)
  is unchanged.

**PKCE** (`pkce.ts`): in https mode the state is the bare random part. There is no
`as.<scheme>.` bounce marker because no bounce is involved.

**Sign-in** (`signIn.ts`):
- The new check `isClaimedCallback` is a belt on top of the OS match. In https mode the
  URL that comes back must have exactly the registered https origin and path, or it is
  refused before any redeem.
- `signInNative` now passes through an `AOSignatureError` thrown by the browser port,
  such as `not-configured`, instead of reporting it as `janus`.

**Browser** (`browser.ts`): an `https://` callback goes to the new local module. The
scheme bounce still uses `expo-web-browser`. Both are required lazily, only once a
sign-in starts.

**Scopes:** unchanged, still `openid email`, which is pinned by a test. The grant-mode
redeem at `/auth/janus/community-ios/session` is unchanged too.

### 2. Native sign-in module: `modules/expo-ao-auth-session` (iOS)

- **What it is:** a local Expo module, autolinked from `modules/`.
  - `ExpoAOAuthSessionModule.swift` runs `ASWebAuthenticationSession(url:callback: .https(host:path:))`.
  - The session is non-ephemeral, so the Janus/Google session carries over.
  - It runs one session at a time and finds a key-window presentation anchor.
- **Results:** a cancel (`canceledLogin`) becomes `{type:'cancel'}`. Any other failure
  rejects, and `signInNative` maps that to `janus`.
- **iOS floor:** the pod stays at 17.0 so a dark build still compiles. 17.4 is checked at
  runtime with `#available`.
- **JS side** (`index.ts`): it uses `requireOptionalNativeModule` and adds
  `httpsCallbackTarget`, a pure function that extracts host + path. If the binary lacks
  the module, or iOS is older than 17.4, you get `AOAuthSessionUnavailable`, which shows
  as "Authority Signature sign-in isn't available in this build."
- **Docs:** `modules/expo-ao-auth-session/README.md`.

### 3. Build config, only when armed (`app.config.js`)

- `aoSignatureNativeLane` is the per-platform mirror of `config.ts`. It is used by two
  functions:
  - `aoSignatureNativeScheme`: unchanged answers for the bounce, and none for https mode;
  - the new `aoSignatureHttpsCallbackHost`.
- **When https mode is armed for iOS:**
  - `deploymentTarget` goes **17.0 → 17.4**. Dark builds and Android stay at 17.0.
  - `associatedDomains` gains `applinks:<callback host>` and
    `webcredentials:<callback host>`.
    - **Why both:** Apple ties `Callback.https` to Associated Domains. Developer reports
      say `webcredentials` is the service it checks, but Apple has not documented which
      one it requires. Listing both costs nothing.
    - **Paid signing only:** free-team builds have no Associated Domains at all, so the
      https callback **cannot work on a free-team build**.
  - No extra URL scheme is registered.
- **Parity test** (`appConfigParity.test.ts`): it now also pins the host for each case
  and checks it against `config.ts`.
- **Resolved-config test** (`appConfigHttps.test.ts`): it checks what a build really
  carries.

### 4. Person-only members: the picker is offered, never forced

- **Gate** (`hooks.ts` `useAOSignatureGate`): the gate now sends an AO session to the
  shell only for missing **Community terms**. `needsAgent` alone no longer sends anyone
  there.
- **Shell** (`components/Shell.tsx`): once enrolled, it always shows the community:
  "You're signed in to Community", the PDS-session broker (`AOConnectCommunity`), and
  then `AOOptionalAgent`.
- **`components/OptionalAgent.tsx`** (new):
  - When there is no primary, it shows "You don't need an agent to take part in your
    communities" and a **Choose an agent** button.
  - The button opens the existing picker inline, and **Not now** closes it again.
  - It is keyed per session, so an open picker never carries over to another sign-in.
  - It renders nothing once a primary exists.
- **Account settings** (`components/AccountSection.tsx`) shows the same offer for a
  linked account.
- **Not-provisioned:** a 403 `not-provisioned` still sets `needsAgent`
  (`noteAONotProvisioned`), so the offer comes back. It no longer takes over the app.
- **Order:** the terms still come first. An unenrolled session sees `AOEnrollment`
  before anything else.

**Assumption:** "community members" means everyone who signs in to the Community app
with Signature, so no one is forced into the picker.
- That includes an agent owner who has agents but no primary.
- The app cannot tell a person-only account from an agent owner without a primary
  without an extra call. The redeem answer has no agent list.
- If an agent owner without a primary must still be forced, the fix is small: gate on
  `outcome !== 'provisioned'`, or on the introspect agent count.

### 5. A stray callback link (`src/Navigation.tsx`)

When the lane is armed, an open of `/auth/janus/community/app-callback` outside the auth
session routes to Home, not NotFound. That happens when the universal link is tapped
elsewhere. It carries nothing usable: the code is useless without that session's PKCE
verifier.

### Tests added or changed (jest)

- `__tests__/httpsCallback.test.ts` (new):
  - https config arming and refusals: Android, mixed scheme, port, credentials, query,
    trailing slash, http, no client;
  - the bounce still arms;
  - web is unaffected;
  - state without a bounce marker, and redirect_uri, S256 and scopes;
  - `signInNative` with the https callback: a callback on a foreign host, path,
    protocol, port or the old scheme never reaches the runtime, and neither does a
    foreign state;
  - `isClaimedCallback`;
  - the module wrapper: exact host + path, result mapping, no module or old iOS means
    unavailable;
  - browser routing: https → module, never `expo-web-browser`; scheme → `expo-web-browser`;
  - a missing module gives `not-configured` and no redeem; a native failure gives `janus`.
- `__tests__/appConfigHttps.test.ts` (new):
  - the resolved config, dark vs armed, for iOS, a local prebuild, Android and free-team;
  - a half config stays dark.
- `__tests__/appConfigParity.test.ts`: https cases and a callback-host parity block.
- `__tests__/shellPickerKey.test.tsx`, rewritten for offer-not-gate:
  - person-only sees the community plus the offer, and opens and closes the picker;
  - with a primary, there is no offer;
  - a session swap remounts the offer closed, and no picker instance is shared;
  - the gate with a PDS session plus person-only is null; Signature-only is the shell;
    an unenrolled person is the shell.
- `__tests__/dark.test.tsx`: the new native module is never required while dark.
- `__fixtures__/fixtures.ts`: `IOS_CFG.callbackMode = 'bounce'`, plus `IOS_HTTPS_CFG`.

## What build 53 needs (Mac, supervised)

The app side is code-complete for a Dev build 53, but it only works once the runtime and
Janus pieces below exist.

**1. Base.** Build on this branch, or merge it onto the line build 53 is cut from.
- Its base is build 52 (3ade7fe99).
- Bump `ios.buildNumber` 52 → 53 in `app.config.js`. This branch does not.

**2. Env on the command line only.** Never commit it (all values are public identifiers):
- `EXPO_PUBLIC_AO_SIGNATURE_ISSUER`: the Janus **Dev** issuer, exact.
- `EXPO_PUBLIC_AO_SIGNATURE_RUNTIME_URL=https://authority-one-agent-runtime-dev.e-479.workers.dev`.
  This must be the same origin as `EXPO_PUBLIC_AGENT_RUNTIME_URL` in the Dev profile, or
  the lane stays dark.
- `EXPO_PUBLIC_AO_SIGNATURE_CLIENT_ID_IOS=<the issued community-ios-dev client id>`
- `EXPO_PUBLIC_AO_SIGNATURE_APP_REDIRECT_URI=https://app-dev.authority-one.com/auth/janus/community/app-callback`
- `EXPO_PUBLIC_AO_SIGNATURE_AUDIENCE=community-api`, if Janus wants `audience=` on
  authorize.
- `EXPO_PUBLIC_AO_SIGNATURE_AUTHORIZE_BASE` is optional and only for a branded host.
- **Do NOT set** `EXPO_PUBLIC_AO_SIGNATURE_SCHEME`. It turns the https mode off (mixed
  config = dark).
- `PAID_SIGNING=1`, which is needed for Associated Domains, and `EAS_BUILD_PLATFORM=ios`
  (or a local prebuild).

**3. Prebuild and check.** Run `expo prebuild --clean -p ios` (the module is new native
code; pods must install). Then check the generated project:
- `IPHONEOS_DEPLOYMENT_TARGET = 17.4`;
- the entitlements contain `applinks:app-dev.authority-one.com` and
  `webcredentials:app-dev.authority-one.com`;
- `ExpoAOAuthSession` is in the Podfile.lock.

**4. Apple Developer.** Paid builds already carry `applinks:authority-one.com`, so the
`com.authorityone.app` App ID should already have Associated Domains and the
provisioning profile should regenerate cleanly. I could not verify this from here:
confirm it before the cable install.

**5. Runtime (plan step 1a, prod worker, dark, Elliott's go).** The app-dev AASA must
list `4TKU6PS7ZS.com.authorityone.app`:
- under `applinks` for `/auth/janus/community/app-callback`;
- under **`webcredentials.apps`**. This is new versus the plan, which listed only the
  applinks path.

Without these the OS never hands the callback back, and the sheet just shows the page.
AASA changes can take a while to reach devices through Apple's CDN. A developer-mode
device can use `?mode=developer` on the associated domain, but this branch does not add
that.

**6. Janus.** `community-ios-dev` must be issued with exactly that redirect, scopes
`openid email` and audience `community-api`. This is plan step 0, the draft to Beau.

**7. Dev runtime config.** Plan step 4: `JANUS_AO_CONFIG` on Dev with the client, the
redirect and `allowPrincipals`; `AO_SIGNIN_V2=1`; `AO_SESSION_SECRET`.
- Without v2, the redeem answers without `aos1.` and the app shows "not accepting
  Signature sign-ins yet" (`no-ao-session`).
- That is safe, but it is not a working sign-in.

**8. Person-only members.** For them to use the community, the runtime must let a
person-only `aos1.` bearer reach the community routes without a primary (plan step 1c).
- If `/app/communities/*` still answers `not-provisioned`, the app no longer traps them
  in the picker.
- But those calls fail, and the offer to choose an agent stays visible.

## Not done / open

- **Owner "Invite by email" action (plan 2e):** not built. It needs the runtime invite
  route and the `inviteLanes` admission (plan step 1b).
- **Android:** stays on the bounce, or dark. An https callback on Android needs its own
  client, App Links (`assetlinks.json`) and a Custom Tabs auth flow.
- **An OTA update onto build 52 or older armed with https mode** fails safe as
  `not-configured`, because those binaries have no module. Arming is a build-time env
  anyway, so this only matters if someone sets the env in an OTA.
- **`webcredentials` vs `applinks`:** which one iOS really requires for `Callback.https`
  is only community-reported, not documented by Apple. Both are configured. Confirm on
  the device in plan step 6.
- **`expo-web-browser` upgrade:** a later version may support https callbacks natively.
  The local module can be dropped when the app moves to it.
