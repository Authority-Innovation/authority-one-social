// @ts-check
const fs = require('fs')
const path = require('path')
const pkg = require('./package.json')

/**
 * Authority One: Fraunces (serif) display face for the AO brand theme's
 * headlines/display names. Registered through the same `expo-font` plugin as
 * Inter. Listed conditionally — only files that actually exist on disk are
 * passed to the plugin, so a build never fails if the (OFL) .ttf hasn't been
 * dropped in yet; the AO theme just falls back to the system/serif font until
 * it is. To bundle: place `Fraunces.ttf` (the variable file from Google Fonts,
 * renamed) at `assets/fonts/fraunces/Fraunces.ttf`. See
 * `assets/fonts/fraunces/README.md`.
 *
 * IMPORTANT — register the STATIC instance, not the variable file. The Google
 * Fonts `Fraunces.ttf` is a variable font (axes opsz/wght/SOFT/WONK) whose
 * default instance is "Fraunces 9pt Black" (opsz=9, wght=900). React Native /
 * iOS do not reliably register variable `.ttf`s, so the variable file loads as
 * the system sans (the silent-fallback bug). We ship a static display cut
 * generated with `fonttools varLib.instancer` (see README) — `Fraunces-Static.ttf`,
 * whose internal family name is exactly "Fraunces" — and register that. We only
 * register the variable file as a fallback if the static one is absent.
 */
const AUTHORITY_ONE_FONT_CANDIDATES = [
  // Prefer the static instance (reliably registers on iOS/Android).
  './assets/fonts/fraunces/Fraunces-Static.ttf',
  // Fallback to the variable file only if the static cut hasn't been generated.
  './assets/fonts/fraunces/Fraunces.ttf',
]
// Register at most ONE Fraunces face. The variable file and the static cut BOTH
// declare the internal family name "Fraunces"; if both are bundled, iOS
// weight-matches a bold heading request to the variable Black face and falls
// back to the system sans (the bug). `.find` takes the FIRST existing candidate
// (static preferred), so only the static cut is ever registered. Do NOT switch
// this to `.filter` — that would register both and reintroduce the collision.
const AUTHORITY_ONE_FONT = AUTHORITY_ONE_FONT_CANDIDATES.find(f =>
  fs.existsSync(path.join(__dirname, f)),
)

/**
 * Carolina Hurricanes skin display face — "NHL Carolina" (static cut). Same
 * pattern as Fraunces: a STATIC instance (no `fvar`, internal family
 * "NHL Carolina" / PostScript "NHLCarolina") registered through `expo-font`,
 * included only when present on disk so a build never fails if it's absent (the
 * Hurricanes skin then just falls back to the default font for headings).
 * IMPORTANT: this face is UPPERCASE + NUMERALS ONLY — it is used SOLELY as the
 * Hurricanes `headingFont` (team name / headings / numbers), never for body text.
 */
const HURRICANES_FONT = './assets/fonts/nhl-carolina/NHLCarolina-Static.ttf'
const HURRICANES_FONT_PRESENT = fs.existsSync(
  path.join(__dirname, HURRICANES_FONT),
)

/**
 * @param {import('@expo/config-types').ExpoConfig} _config
 * @returns {{ expo: import('@expo/config-types').ExpoConfig }}
 */
module.exports = function (_config) {
  /**
   * App version number. Should be incremented as part of a release cycle.
   */
  const VERSION = pkg.version

  /**
   * Uses built-in Expo env vars
   *
   * @see https://docs.expo.dev/build-reference/variables/#built-in-environment-variables
   */
  const PLATFORM = process.env.EAS_BUILD_PLATFORM ?? 'web'

  const IS_TESTFLIGHT = process.env.EXPO_PUBLIC_ENV === 'testflight'
  const IS_PRODUCTION = process.env.EXPO_PUBLIC_ENV === 'production'
  const IS_DEV = !IS_TESTFLIGHT && !IS_PRODUCTION

  // === Free-team iOS signing gate ==========================================
  // A free *personal* Apple Developer team CANNOT sign these four capabilities
  // (Xcode: "Personal development teams do not support ... Communication
  // Notifications, Extended Virtual Addressing, Associated Domains, and Push
  // Notifications"):
  //   • Associated Domains          (com.apple.developer.associated-domains)
  //   • Push Notifications          (aps-environment — injected by expo-notifications)
  //   • Communication Notifications (com.apple.developer.usernotifications.communication)
  //   • Extended Virtual Addressing (com.apple.developer.kernel.extended-virtual-addressing,
  //                                  plus kernel.increased-memory-limit, gated with it)
  // These are REAL features we want for the paid TestFlight / App Store build, so
  // we GATE them behind PAID_SIGNING instead of deleting them.
  //
  //   FREE-TEAM DEV BUILD (default): leave PAID_SIGNING unset → all four are
  //     omitted, so `npx expo prebuild --clean -p ios` produces an Xcode project
  //     a free personal team can sign onto a device.
  //   PAID BUILD (TestFlight / App Store): set PAID_SIGNING=1 in the build env
  //     (e.g. the EAS build profile's `env`, or `PAID_SIGNING=1 npx expo prebuild
  //     --clean -p ios`) → all four capabilities are re-included.
  //
  // The companion strip plugin ./plugins/withFreeTeamSigning.js enforces this for
  // aps-environment (which expo-notifications injects into the entitlements plist,
  // not declared here) and acts as a catch-all.
  const PAID_SIGNING = process.env.PAID_SIGNING === '1'

  // Authority One: repointed off bsky.app. App Clip is stripped for the first
  // TestFlight build, so the `appclips:` entries are gone. Universal links point
  // at authority-one.com — they are harmless without an apple-app-site-association
  // file hosted there yet (links simply won't deep-link until the AASA is added).
  // Gated by PAID_SIGNING: empty on free-team dev builds (no Associated Domains
  // capability), populated for paid builds.
  const ASSOCIATED_DOMAINS = PAID_SIGNING
    ? [
        'applinks:authority-one.com',
        // When testing local services, enter an ngrok (et al) domain here. It must use a standard HTTP/HTTPS port.
        ...(IS_DEV || IS_TESTFLIGHT ? [] : []),
      ]
    : []

  const UPDATES_ENABLED = IS_TESTFLIGHT || IS_PRODUCTION

  const USE_SENTRY = Boolean(process.env.SENTRY_AUTH_TOKEN)

  // Authority One: use a plain 1024×1024 PNG for the iOS icon on every build.
  // The original fork shipped Apple Icon Composer `.icon` bundles (the Bluesky
  // butterfly); we drop those for the first TestFlight so the One icon is a
  // single, easy-to-replace PNG. Swap ios_icon_default_next.png for final art.
  const IOS_ICON_FILE = './assets/app-icons/ios_icon_default_next.png'

  return {
    expo: {
      version: VERSION,
      // Authority One: display name (Expo maps this to CFBundleDisplayName).
      // Was 'One' — too generic and rejected by App Store Connect as a bundle/
      // display name already taken. Renamed to the unique 'Authority One'.
      // Note: CFBundleName is NOT set explicitly, so Expo derives it from this
      // name too ("Authority One"), which is likewise unique. Bundle identifier
      // stays com.authorityone.app (unchanged).
      name: 'Authority-One',
      slug: 'one',
      scheme: 'one',
      owner: 'blueskysocial',
      runtimeVersion: {
        policy: 'appVersion',
      },
      icon: './assets/app-icons/ios_icon_default_next.png',
      userInterfaceStyle: 'automatic',
      primaryColor: '#E8431F', // Authority One brand orange (was Bluesky #006AFF)
      newArchEnabled: false,
      ios: {
        supportsTablet: false,
        // Authority One bundle identifier. Changeable — must match the App ID you
        // register under your Apple Developer team in App Store Connect.
        bundleIdentifier: 'com.authorityone.app',
        // Authority One: CFBundleVersion. The first upload defaulted to "1" and
        // was rejected; bumped to "2" so the re-upload isn't treated as a
        // duplicate build. Increment on every subsequent App Store Connect upload.
        buildNumber: '11',
        config: {
          usesNonExemptEncryption: false,
        },
        icon: IOS_ICON_FILE,
        infoPlist: {
          // Home-screen label shown UNDER the app icon. This is the on-device
          // app name and is intentionally distinct from the App Store listing
          // name ("Authority-One", set via `name`) and from CFBundleSpokenName.
          // "One" was rejected at upload with ITMS-90129 (name already taken),
          // so this is now the lowercase "authority-one". If Apple rejects this
          // too, it's a one-line swap to try another.
          CFBundleDisplayName: 'authority-one',
          CADisableMinimumFrameDurationOnPhone: true,
          // Authority One Context Engine PHASE 1.5 (feat/context-engine-background
          // branch ONLY): 'location' enables background location updates so the agent
          // can derive all-day place context (CONCLUSIONS only — never a GPS trail).
          // This is a SEPARATE, OFF-by-default opt-in; it does add App Store review
          // scrutiny, which is why it stays off the shippable build (see
          // CONTEXT-ENGINE-PHASE-1.5-README.md).
          UIBackgroundModes: ['remote-notification', 'location'],
          NSUserActivityTypes: ['INSendMessageIntent'],
          NSCameraUsageDescription:
            'Used for profile pictures, posts, and other kinds of content.',
          NSMicrophoneUsageDescription:
            'Used to talk to your agent by voice and for posts and other kinds of content.',
          NSSpeechRecognitionUsageDescription:
            'Used to transcribe your speech on-device so you can talk to your agent.',
          NSPhotoLibraryAddUsageDescription:
            'Used to save images to your library.',
          NSPhotoLibraryUsageDescription:
            'Used for profile pictures, posts, and other kinds of content',
          // Context Engine Phase 1.5 (branch only). Honest justification: all-day place
          // context for your agent. We turn your location into coarse CONCLUSIONS on
          // your device (like "home", "a venue", or how long you stayed) and store only
          // those — never a continuous location trail. Off by default; you turn it on.
          NSLocationAlwaysAndWhenInUseUsageDescription:
            'Authority One uses your location in the background to recognize the coarse places you spend time (like “home”, “work”, or a venue) so your agent has all-day context. It stores only these conclusions on your device, never a continuous location trail, and you can turn it off any time.',
          CFBundleSpokenName: 'Authority One',
          CFBundleLocalizations: [
            'en',
            'an',
            'ast',
            'ca',
            'cy',
            'da',
            'de',
            'el',
            'eo',
            'es',
            'eu',
            'fi',
            'fr',
            'fy',
            'ga',
            'gd',
            'gl',
            'hi',
            'hu',
            'ia',
            'id',
            'it',
            'ja',
            'km',
            'ko',
            'ne',
            'nl',
            'pl',
            'pt-BR',
            'pt-PT',
            'ro',
            'ru',
            'sv',
            'th',
            'tr',
            'uk',
            'vi',
            'yue',
            'zh-Hans',
            'zh-Hant',
          ],
        },
        // Associated Domains capability — only emitted on paid builds. On a
        // free-team build the key is omitted entirely (not just set to []), so no
        // com.apple.developer.associated-domains entitlement is generated.
        ...(PAID_SIGNING ? {associatedDomains: ASSOCIATED_DOMAINS} : {}),
        entitlements: {
          // The three capabilities below are gated by PAID_SIGNING. On a free-team
          // dev build this object is empty (no kernel / communication entitlements),
          // which is required for a free personal Apple team to sign. Set
          // PAID_SIGNING=1 to restore them for TestFlight / App Store.
          ...(PAID_SIGNING
            ? {
                'com.apple.developer.kernel.increased-memory-limit': true,
                'com.apple.developer.kernel.extended-virtual-addressing': true,
                'com.apple.developer.usernotifications.communication': true,
              }
            : {}),
          // Authority One: the App Group (was 'group.app.bsky') is removed for the
          // first build. It only existed to share data with the Share extension and
          // Notification Service Extension, both of which are stripped below, and no
          // JS reads it. Re-add as 'group.com.authorityone.app' if you reintroduce
          // an extension that needs shared storage.
          // 'com.apple.developer.device-information.user-assigned-device-name': true,
        },
        privacyManifests: {
          NSPrivacyCollectedDataTypes: [
            {
              NSPrivacyCollectedDataType: 'NSPrivacyCollectedDataTypeCrashData',
              NSPrivacyCollectedDataTypeLinked: false,
              NSPrivacyCollectedDataTypeTracking: false,
              NSPrivacyCollectedDataTypePurposes: [
                'NSPrivacyCollectedDataTypePurposeAppFunctionality',
              ],
            },
            {
              NSPrivacyCollectedDataType:
                'NSPrivacyCollectedDataTypePerformanceData',
              NSPrivacyCollectedDataTypeLinked: false,
              NSPrivacyCollectedDataTypeTracking: false,
              NSPrivacyCollectedDataTypePurposes: [
                'NSPrivacyCollectedDataTypePurposeAppFunctionality',
              ],
            },
            {
              NSPrivacyCollectedDataType:
                'NSPrivacyCollectedDataTypeOtherDiagnosticData',
              NSPrivacyCollectedDataTypeLinked: false,
              NSPrivacyCollectedDataTypeTracking: false,
              NSPrivacyCollectedDataTypePurposes: [
                'NSPrivacyCollectedDataTypePurposeAppFunctionality',
              ],
            },
          ],
          NSPrivacyAccessedAPITypes: [
            {
              NSPrivacyAccessedAPIType:
                'NSPrivacyAccessedAPICategoryFileTimestamp',
              NSPrivacyAccessedAPITypeReasons: ['C617.1', '3B52.1', '0A2A.1'],
            },
            {
              NSPrivacyAccessedAPIType: 'NSPrivacyAccessedAPICategoryDiskSpace',
              NSPrivacyAccessedAPITypeReasons: ['E174.1', '85F4.1'],
            },
            {
              NSPrivacyAccessedAPIType:
                'NSPrivacyAccessedAPICategorySystemBootTime',
              NSPrivacyAccessedAPITypeReasons: ['35F9.1'],
            },
            {
              NSPrivacyAccessedAPIType:
                'NSPrivacyAccessedAPICategoryUserDefaults',
              NSPrivacyAccessedAPITypeReasons: ['CA92.1', '1C8F.1'],
            },
          ],
        },
      },
      androidStatusBar: {
        barStyle: 'light-content',
      },
      // Dark nav bar in light mode is better than light nav bar in dark mode
      androidNavigationBar: {
        barStyle: 'light-content',
      },
      android: {
        icon: './assets/app-icons/android_icon_default_next.png',
        adaptiveIcon: {
          foregroundImage: './assets/icon-android-foreground.png',
          monochromeImage: './assets/icon-android-monochrome.png',
          backgroundColor: '#F4F0E8', // Authority One "paper" cream (windmill mark)
        },
        googleServicesFile: './google-services.json',
        package: 'com.authorityone.app', // was 'xyz.blueskyweb.app'
        intentFilters: [
          {
            action: 'VIEW',
            autoVerify: true,
            data: [
              {
                scheme: 'https',
                host: 'authority-one.com', // was 'bsky.app'
              },
              ...(IS_DEV
                ? [
                    {
                      scheme: 'http',
                      host: 'localhost:19006',
                    },
                  ]
                : []),
            ],
            category: ['BROWSABLE', 'DEFAULT'],
          },
        ],
      },
      web: {
        favicon: './assets/favicon.png',
      },
      updates: {
        url: 'https://updates.bsky.app/manifest',
        enabled: UPDATES_ENABLED,
        fallbackToCacheTimeout: 30000,
        codeSigningCertificate: UPDATES_ENABLED
          ? './code-signing/certificate.pem'
          : undefined,
        codeSigningMetadata: UPDATES_ENABLED
          ? {
              keyid: 'main',
              alg: 'rsa-v1_5-sha256',
            }
          : undefined,
        checkAutomatically: 'NEVER',
      },
      plugins: [
        // Authority One: free-team iOS signing gate (see PAID_SIGNING above).
        // MUST be FIRST in this array. Expo runs entitlements-mod ACTIONS in
        // reverse registration order (the base provider descends the chain, each
        // mod runs its action then calls the next), so the FIRST-registered plugin
        // runs its action LAST. Listing it first is therefore what makes it run
        // after every other entitlements mod — notably expo-notifications, which
        // injects aps-environment (Push Notifications). It then strips every
        // free-team-forbidden capability. No-op when PAID_SIGNING=1.
        './plugins/withFreeTeamSigning.js',
        'expo-video',
        'expo-localization',
        'expo-web-browser',
        [
          'react-native-edge-to-edge',
          {android: {enforceNavigationBarContrast: false}},
        ],
        ...(USE_SENTRY
          ? [
              /** @type {[string, any]} */ ([
                '@sentry/react-native/expo',
                {
                  organization: 'blueskyweb',
                  project: 'app',
                  url: 'https://sentry.io',
                },
              ]),
            ]
          : []),
        [
          'expo-build-properties',
          {
            ios: {
              deploymentTarget: '17.0',
              buildReactNativeFromSource: true,
              ccacheEnabled: IS_DEV,
              cxxLanguageStandard: 'c++23',
              extraPods: [
                {
                  name: 'MCEmojiPicker',
                  git: 'https://github.com/bluesky-social/MCEmojiPicker.git',
                  branch: 'main',
                },
              ],
            },
            android: {
              compileSdkVersion: 36,
              targetSdkVersion: 35,
              buildToolsVersion: '35.0.0',
              buildReactNativeFromSource: IS_PRODUCTION,
            },
          },
        ],
        [
          'expo-notifications',
          {
            icon: './assets/icon-android-notification.png',
            color: '#E8431F', // Authority One brand orange (was Bluesky #1185fe)
            sounds: PLATFORM === 'ios' ? ['assets/dm.aiff'] : ['assets/dm.mp3'],
          },
        ],
        'react-native-compressor',
        [
          '@bitdrift/react-native',
          {
            networkInstrumentation: true,
          },
        ],
        // Authority One: the App Clip, Share extension, and Notification Service
        // Extension config plugins are removed for the first TestFlight build so
        // only the main app target needs a provisioning profile. Re-add these three
        // lines (and the EAS `appExtensions` block below) to bring them back:
        //   './plugins/starterPackAppClipExtension/withStarterPackAppClip.js',
        //   './plugins/shareExtension/withShareExtensions.js',
        //   './plugins/notificationsExtension/withNotificationsExtension.js',
        './plugins/withGradleJVMHeapSizeIncrease.js',
        './plugins/withAndroidManifestLargeHeapPlugin.js',
        './plugins/withAndroidManifestFCMIconPlugin.js',
        './plugins/withAndroidManifestIntentQueriesPlugin.js',
        './plugins/withAndroidStylesAccentColorPlugin.js',
        './plugins/withAndroidNoJitpackPlugin.js',
        [
          'expo-font',
          {
            fonts: [
              './assets/fonts/inter/InterVariable.woff2',
              './assets/fonts/inter/InterVariable-Italic.woff2',
              // Android only
              './assets/fonts/inter/Inter-Regular.otf',
              './assets/fonts/inter/Inter-Italic.otf',
              './assets/fonts/inter/Inter-Medium.otf',
              './assets/fonts/inter/Inter-MediumItalic.otf',
              './assets/fonts/inter/Inter-SemiBold.otf',
              './assets/fonts/inter/Inter-SemiBoldItalic.otf',
              './assets/fonts/inter/Inter-Bold.otf',
              './assets/fonts/inter/Inter-BoldItalic.otf',
              // Authority One brand display face (Fraunces). The single static
              // cut, included only when present on disk (see AUTHORITY_ONE_FONT).
              ...(AUTHORITY_ONE_FONT ? [AUTHORITY_ONE_FONT] : []),
              // Carolina Hurricanes skin display face (NHL Carolina). Headings
              // only (uppercase+numerals); included only when present on disk.
              ...(HURRICANES_FONT_PRESENT ? [HURRICANES_FONT] : []),
            ],
          },
        ],
        [
          'expo-splash-screen',
          {
            ios: {
              enableFullScreenImage_legacy: true, // iOS only
              backgroundColor: '#F4F0E8', // One "paper" cream (windmill on paper)
              image: './assets/splash/splash.png',
              resizeMode: 'cover',
              dark: {
                enableFullScreenImage_legacy: true, // iOS only
                backgroundColor: '#110C09', // One warm near-black (dark paper)
                image: './assets/splash/splash-dark.png',
                resizeMode: 'cover',
              },
            },
            android: {
              backgroundColor: '#F4F0E8', // One "paper" cream
              image: './assets/splash/android-splash-logo-white.png', // black windmill (on cream)
              imageWidth: 102, // even division of 306px
              dark: {
                backgroundColor: '#110C09', // One warm near-black
                image: './assets/splash/android-splash-logo-dark.png', // cream windmill (on dark)
                imageWidth: 102,
              },
            },
          },
        ],
        [
          '@bsky.app/expo-dynamic-app-icon',
          {
            /**
             * Default set
             */
            default_light: {
              ios: './assets/app-icons/ios_icon_legacy_light.png',
              android: './assets/app-icons/android_icon_legacy_light.png',
              prerendered: true,
            },
            default_dark: {
              ios: './assets/app-icons/ios_icon_legacy_dark.png',
              android: './assets/app-icons/android_icon_legacy_dark.png',
              prerendered: true,
            },

            /**
             * Bluesky+ core set
             */
            core_aurora: {
              ios: './assets/app-icons/ios_icon_core_aurora.png',
              android: './assets/app-icons/android_icon_core_aurora.png',
              prerendered: true,
            },
            core_bonfire: {
              ios: './assets/app-icons/ios_icon_core_bonfire.png',
              android: './assets/app-icons/android_icon_core_bonfire.png',
              prerendered: true,
            },
            core_sunrise: {
              ios: './assets/app-icons/ios_icon_core_sunrise.png',
              android: './assets/app-icons/android_icon_core_sunrise.png',
              prerendered: true,
            },
            core_sunset: {
              ios: './assets/app-icons/ios_icon_core_sunset.png',
              android: './assets/app-icons/android_icon_core_sunset.png',
              prerendered: true,
            },
            core_midnight: {
              ios: './assets/app-icons/ios_icon_core_midnight.png',
              android: './assets/app-icons/android_icon_core_midnight.png',
              prerendered: true,
            },
            core_flat_blue: {
              ios: './assets/app-icons/ios_icon_core_flat_blue.png',
              android: './assets/app-icons/android_icon_core_flat_blue.png',
              prerendered: true,
            },
            core_flat_white: {
              ios: './assets/app-icons/ios_icon_core_flat_white.png',
              android: './assets/app-icons/android_icon_core_flat_white.png',
              prerendered: true,
            },
            core_flat_black: {
              ios: './assets/app-icons/ios_icon_core_flat_black.png',
              android: './assets/app-icons/android_icon_core_flat_black.png',
              prerendered: true,
            },
            core_classic: {
              ios: './assets/app-icons/ios_icon_core_classic.png',
              android: './assets/app-icons/android_icon_core_classic.png',
              prerendered: true,
            },

            /**
             * Skin app icons
             */
            // Carolina Hurricanes skin — "Stormy" mascot. Source is 1024x1024,
            // opaque RGB (no alpha, as iOS requires). TODO: replace with a
            // higher-res, licensed Hurricanes icon — this is team IP pending a
            // license decision (does not block the build).
            skin_hurricanes: {
              ios: './assets/app-icons/ios_icon_skin_hurricanes.png',
              android: './assets/app-icons/android_icon_skin_hurricanes.png',
              prerendered: true,
            },
          },
        ],
        ['expo-screen-orientation', {initialOrientation: 'PORTRAIT_UP'}],
        // Context Engine Phase 1.5 (feat/context-engine-background branch ONLY):
        // enable iOS background location + the Always usage string. The
        // isIosBackgroundLocationEnabled flag is what makes expo-location add the
        // background-location capability; UIBackgroundModes 'location' is also set in
        // infoPlist above. OFF-by-default in-app opt-in gates whether it ever runs.
        [
          'expo-location',
          {
            locationAlwaysAndWhenInUsePermission:
              'Authority One uses your location in the background to recognize the coarse places you spend time (like “home”, “work”, or a venue) so your agent has all-day context. It stores only these conclusions on your device, never a continuous location trail, and you can turn it off any time.',
            locationWhenInUsePermission:
              'Authority One uses your location while the app is open to recognize the coarse places you spend time, so your agent has context. It stores only conclusions on your device, never a continuous location trail.',
            isIosBackgroundLocationEnabled: true,
            isAndroidBackgroundLocationEnabled: true,
          },
        ],
        [
          'expo-contacts',
          {
            contactsPermission:
              'I agree to allow One to use my contacts for friend discovery until I opt out.',
          },
        ],
      ],
      extra: {
        eas: {
          // Authority One: the iOS `appExtensions` block (Share-with-Bluesky,
          // BlueskyNSE, BlueskyClip) is removed for the first TestFlight build so
          // each extension target doesn't need its own provisioning profile.
          // Re-add it together with the three extension config plugins above to
          // restore the extensions.
          projectId: '55bd077a-d905-4184-9c7f-94789ba0f302',
        },
      },
    },
  }
}
