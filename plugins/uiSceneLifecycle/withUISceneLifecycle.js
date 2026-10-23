/* eslint-disable import-x/no-nodejs-modules, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access --
 * Node-only Expo config plugin (runs at prebuild): it needs fs/path, and the Info.plist /
 * AppDelegate / xcode-project objects handed to mods are untyped. */
/**
 * Authority One: adopt the iOS UIScene lifecycle.
 *
 * Why: apps built with the iOS 27 SDK that have no `UIApplicationSceneManifest` trap
 * (EXC_BREAKPOINT in `_UIApplicationEvaluateRuntimeIssueForNoSceneLifecycleAdoption`) when
 * UIKit creates a scene — we hit it on background (Non-UI) launches, e.g. a location wake
 * (TestFlight builds 33–35, Xcode 27.1). Expo SDK 54 / RN 0.81 ship no scene support
 * (`ExpoAppDelegate` has only "TODO: Configuring and Discarding Scenes"), so this plugin
 * does the adoption for the generated project:
 *
 *  1. Info.plist: `UIApplicationSceneManifest` with a single window-scene configuration
 *     whose delegate is `SceneDelegate` (multiple scenes off).
 *  2. Adds `SceneDelegate.swift` to the app target. It creates the UIWindow for the scene,
 *     hosts the RN root view controller the AppDelegate builds, and forwards URL / user
 *     activity / shortcut / lifecycle callbacks to the AppDelegate (UIKit stops calling the
 *     app-delegate versions once scenes are adopted).
 *  3. Rewrites the generated AppDelegate so `didFinishLaunching` no longer creates a window.
 *     The RN root is built once, on demand: by the scene, or — when no scene connects
 *     within a short grace period (background launch) — off-screen, so JS / TaskManager
 *     work still runs as before. Debug builds with expo-dev-launcher keep creating the window in
 *     didFinishLaunching (its AppDelegate subscriber requires one) and attach it to the scene.
 *
 * Every edit is tagged and the plugin is idempotent (running it twice is a no-op).
 */
const fs = require('fs')
const path = require('path')
const {
  withAppDelegate,
  withDangerousMod,
  withInfoPlist,
  withXcodeProject,
  IOSConfig,
} = require('expo/config-plugins')

const SCENE_DELEGATE_FILE = 'SceneDelegate.swift'
const SCENE_DELEGATE_CLASS = 'SceneDelegate'
const SCENE_DELEGATE_TEMPLATE = path.join(__dirname, SCENE_DELEGATE_FILE)

const TAG = 'uiscene-lifecycle'
const marker = name => ({
  begin: `// @generated begin ${TAG}-${name} (plugins/uiSceneLifecycle)`,
  end: `// @generated end ${TAG}-${name}`,
})

// ---------------------------------------------------------------------------
// Info.plist

function applySceneManifest(infoPlist) {
  const delegateClassName = `$(PRODUCT_MODULE_NAME).${SCENE_DELEGATE_CLASS}`
  const existing = infoPlist.UIApplicationSceneManifest || {}
  const configurations = existing.UISceneConfigurations || {}
  const appRole = (
    configurations.UIWindowSceneSessionRoleApplication || []
  ).filter(c => c && c.UISceneConfigurationName !== 'Default Configuration')

  infoPlist.UIApplicationSceneManifest = {
    ...existing,
    UIApplicationSupportsMultipleScenes: false,
    UISceneConfigurations: {
      ...configurations,
      UIWindowSceneSessionRoleApplication: [
        {
          UISceneConfigurationName: 'Default Configuration',
          UISceneDelegateClassName: delegateClassName,
        },
        ...appRole,
      ],
    },
  }
  return infoPlist
}

// ---------------------------------------------------------------------------
// AppDelegate.swift

const STATE = marker('state')
const LAUNCH = marker('launch')
const METHODS = marker('methods')

const STATE_BLOCK = `  ${STATE.begin}
  /// The React Native root view controller. Built once by \`startReactNativeIfNeeded\`;
  /// SceneDelegate hosts it in the window scene's window.
  var reactRootViewController: UIViewController?
  /// didFinishLaunching options; merged with the scene's connection options on first connect.
  var reactLaunchOptions: [UIApplication.LaunchOptionsKey: Any]?
  ${STATE.end}
`

const LAUNCH_BLOCK = `#if os(iOS) || os(tvOS)
    ${LAUNCH.begin}
    // UIScene lifecycle: no window here — SceneDelegate creates it (and builds the RN root
    // with the scene's cold-start URL / user activity merged into the launch options) when a
    // window scene connects. When no scene connects (background launches on iOS 17-26; iOS
    // 27 connects one even then) React Native is still started off-screen, as before, so JS /
    // TaskManager work runs:
    //  - immediately for launches iOS marks as background events (location, push, BLE) —
    //    they never carry a deep link;
    //  - otherwise (e.g. background fetch) after a grace period. On a normal foreground launch
    //    the scene connects a few tens of ms after didFinishLaunching (measured on the iOS 27
    //    simulator, after the next main-queue turn); starting React Native before it would
    //    drop the cold-start deep link from Linking.getInitialURL().
    reactLaunchOptions = launchOptions
    if Self.devLauncherNeedsEarlyWindow {
      // Debug + expo-dev-launcher: its AppDelegate subscriber needs a window (and the RN
      // root, via its ReactDelegate handler) inside didFinishLaunching. The window is
      // attached to the scene in SceneDelegate.
      window = UIWindow(frame: UIScreen.main.bounds)
      window?.rootViewController = startReactNativeIfNeeded(launchOptions: launchOptions)
    } else if Self.isBackgroundEventLaunch(launchOptions) {
      NSLog("[UIScene] background-event launch; starting React Native off-screen")
      _ = startReactNativeIfNeeded(launchOptions: launchOptions)
    } else {
      DispatchQueue.main.asyncAfter(deadline: .now() + Self.sceneConnectGracePeriod) { [weak self] in
        guard let self = self, self.reactRootViewController == nil else { return }
        NSLog("[UIScene] no scene connected after launch (state=%ld); starting React Native off-screen",
              UIApplication.shared.applicationState.rawValue)
        _ = self.startReactNativeIfNeeded(launchOptions: launchOptions)
      }
    }
    ${LAUNCH.end}
#endif`

const METHODS_BLOCK = `  ${METHODS.begin}
  /// Builds the React Native root once — what \`RCTReactNativeFactory.startReactNative(withModuleName:in:launchOptions:)\`
  /// does, minus the window (Expo ReactDelegate handlers, root view controller and splash
  /// customisation all go through the same factory / delegate calls).
  func startReactNativeIfNeeded(
    launchOptions: [UIApplication.LaunchOptionsKey: Any]?
  ) -> UIViewController? {
    if let existing = reactRootViewController {
      return existing
    }
    guard let factory = reactNativeFactory, let delegate = reactNativeDelegate else {
      return nil
    }
    NSLog("[UIScene] building React Native root (applicationState=%ld)",
          UIApplication.shared.applicationState.rawValue)
    let rootView = factory.rootViewFactory.view(
      withModuleName: "main",
      initialProperties: nil,
      launchOptions: launchOptions)
    let rootViewController = delegate.createRootViewController()
    delegate.setRootView(rootView, toRootViewController: rootViewController)
    reactRootViewController = rootViewController
    return rootViewController
  }

  /// Launches iOS performs for a background event; these never carry a cold-start URL.
  static func isBackgroundEventLaunch(_ launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
    guard let launchOptions = launchOptions else { return false }
    let keys: [UIApplication.LaunchOptionsKey] = [
      .location, .remoteNotification, .bluetoothCentrals, .bluetoothPeripherals,
    ]
    return keys.contains { launchOptions[$0] != nil }
  }

  /// How long didFinishLaunching waits for a window scene before starting React Native
  /// off-screen (background launch with no scene).
  static let sceneConnectGracePeriod: TimeInterval = 1.0

  /// expo-dev-launcher is a debug-only pod; its didFinishLaunching subscriber fatalErrors
  /// without a window, so Debug builds that link it keep the early window.
  static var devLauncherNeedsEarlyWindow: Bool {
#if DEBUG
    return NSClassFromString("EXDevLauncherController") != nil
#else
    return false
#endif
  }
  ${METHODS.end}

`

// The window/root creation the Expo SDK 54 template puts in didFinishLaunching.
const TEMPLATE_WINDOW_RE =
  /#if os\(iOS\) \|\| os\(tvOS\)\s*\n\s*window = UIWindow\(frame: UIScreen\.main\.bounds\)\s*\n\s*factory\.startReactNative\(\s*withModuleName: "main",\s*in: window,\s*launchOptions: launchOptions\)\s*\n#endif/

const FACTORY_PROPERTY_RE =
  /( *var reactNativeFactory: RCTReactNativeFactory\?\n)/
const LINKING_ANCHOR_RE = /( *\/\/ Linking API\n)/

function applyAppDelegate(contents) {
  if (contents.includes(`${TAG}-launch`)) {
    return contents // already applied
  }
  for (const [re, what] of [
    [
      TEMPLATE_WINDOW_RE,
      'the window/startReactNative block in didFinishLaunching',
    ],
    [FACTORY_PROPERTY_RE, '`var reactNativeFactory: RCTReactNativeFactory?`'],
    [LINKING_ANCHOR_RE, 'the `// Linking API` anchor'],
  ]) {
    if (!re.test(contents)) {
      throw new Error(
        `[withUISceneLifecycle] AppDelegate.swift does not match the Expo SDK 54 template: ` +
          `could not find ${what}. Update plugins/uiSceneLifecycle for the new template.`,
      )
    }
  }
  return contents
    .replace(FACTORY_PROPERTY_RE, (_m, line) => `${line}\n${STATE_BLOCK}`)
    .replace(TEMPLATE_WINDOW_RE, () => LAUNCH_BLOCK)
    .replace(LINKING_ANCHOR_RE, (_m, line) => `${METHODS_BLOCK}${line}`)
}

// ---------------------------------------------------------------------------
// Xcode project + SceneDelegate.swift

function writeSceneDelegate(projectRoot, projectName) {
  const dest = path.join(projectRoot, 'ios', projectName, SCENE_DELEGATE_FILE)
  const src = fs.readFileSync(SCENE_DELEGATE_TEMPLATE, 'utf8')
  if (!fs.existsSync(dest) || fs.readFileSync(dest, 'utf8') !== src) {
    fs.writeFileSync(dest, src)
  }
  return dest
}

function addSceneDelegateToProject(project, projectName) {
  const filepath = `${projectName}/${SCENE_DELEGATE_FILE}`
  if (project.hasFile(filepath)) {
    return project
  }
  return IOSConfig.XcodeUtils.addBuildSourceFileToGroup({
    filepath,
    groupName: projectName,
    project,
  })
}

// ---------------------------------------------------------------------------

const withUISceneLifecycle = config => {
  config = withInfoPlist(config, cfg => {
    cfg.modResults = applySceneManifest(cfg.modResults)
    return cfg
  })

  config = withAppDelegate(config, cfg => {
    if (cfg.modResults.language !== 'swift') {
      throw new Error('[withUISceneLifecycle] expected a Swift AppDelegate')
    }
    cfg.modResults.contents = applyAppDelegate(cfg.modResults.contents)
    return cfg
  })

  config = withDangerousMod(config, [
    'ios',
    cfg => {
      const projectName = IOSConfig.XcodeUtils.getProjectName(
        cfg.modRequest.projectRoot,
      )
      writeSceneDelegate(cfg.modRequest.projectRoot, projectName)
      return cfg
    },
  ])

  config = withXcodeProject(config, cfg => {
    const projectName = IOSConfig.XcodeUtils.getProjectName(
      cfg.modRequest.projectRoot,
    )
    cfg.modResults = addSceneDelegateToProject(cfg.modResults, projectName)
    return cfg
  })

  return config
}

module.exports = withUISceneLifecycle
module.exports._internal = {
  applySceneManifest,
  applyAppDelegate,
  writeSceneDelegate,
  addSceneDelegateToProject,
  SCENE_DELEGATE_TEMPLATE,
}
