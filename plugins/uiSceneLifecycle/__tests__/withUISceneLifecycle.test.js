/**
 * @jest-environment node
 */
/* eslint-disable import-x/no-nodejs-modules, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access --
 * Node-side test of a prebuild config plugin: needs fs/os/path and drives the untyped
 * `xcode` project API (a dependency of @expo/config-plugins). */
// Plain Node test (config plugins run in Node at prebuild time). jest/jestSetup.js mocks
// `crypto` to {}, which breaks the xcode library's UUID generator, so the project fixture
// gets a deterministic unique-UUID generator instead (see withTestUuids).
let uuidCounter = 0

const fs = require('fs')
const os = require('os')
const path = require('path')
// eslint-disable-next-line import-x/no-extraneous-dependencies -- comes with @expo/config-plugins
const xcode = require('xcode')

const {
  applySceneManifest,
  applyAppDelegate,
  writeSceneDelegate,
  addSceneDelegateToProject,
  SCENE_DELEGATE_TEMPLATE,
} = require('../withUISceneLifecycle')._internal

const FIXTURES = path.join(__dirname, '__fixtures__')
const TEMPLATE_APP_DELEGATE = fs.readFileSync(
  path.join(FIXTURES, 'AppDelegate.sdk54.swift'),
  'utf8',
)

const count = (haystack, needle) => haystack.split(needle).length - 1

describe('withUISceneLifecycle — Info.plist', () => {
  it('adds a single-scene manifest with SceneDelegate as the default configuration', () => {
    const plist = applySceneManifest({CFBundleName: 'AuthorityOne'})
    expect(plist.CFBundleName).toBe('AuthorityOne')
    expect(plist.UIApplicationSceneManifest).toEqual({
      UIApplicationSupportsMultipleScenes: false,
      UISceneConfigurations: {
        UIWindowSceneSessionRoleApplication: [
          {
            UISceneConfigurationName: 'Default Configuration',
            UISceneDelegateClassName: '$(PRODUCT_MODULE_NAME).SceneDelegate',
          },
        ],
      },
    })
  })

  it('is idempotent', () => {
    const once = applySceneManifest({})
    const twice = applySceneManifest(JSON.parse(JSON.stringify(once)))
    expect(twice).toEqual(once)
  })

  it('forces multiple scenes off and keeps unrelated scene configurations', () => {
    const external = {
      UISceneConfigurationName: 'External',
      UISceneDelegateClassName: 'Other',
    }
    const plist = applySceneManifest({
      UIApplicationSceneManifest: {
        UIApplicationSupportsMultipleScenes: true,
        UISceneConfigurations: {
          UIWindowSceneSessionRoleApplication: [
            {
              UISceneConfigurationName: 'Default Configuration',
              UISceneDelegateClassName: 'Stale',
            },
          ],
          UIWindowSceneSessionRoleExternalDisplayNonInteractive: [external],
        },
      },
    })
    const m = plist.UIApplicationSceneManifest
    expect(m.UIApplicationSupportsMultipleScenes).toBe(false)
    expect(m.UISceneConfigurations.UIWindowSceneSessionRoleApplication).toEqual(
      [
        {
          UISceneConfigurationName: 'Default Configuration',
          UISceneDelegateClassName: '$(PRODUCT_MODULE_NAME).SceneDelegate',
        },
      ],
    )
    expect(
      m.UISceneConfigurations
        .UIWindowSceneSessionRoleExternalDisplayNonInteractive,
    ).toEqual([external])
  })
})

describe('withUISceneLifecycle — AppDelegate.swift', () => {
  const out = applyAppDelegate(TEMPLATE_APP_DELEGATE)

  it('removes the window/startReactNative block from didFinishLaunching', () => {
    expect(TEMPLATE_APP_DELEGATE).toContain('factory.startReactNative(')
    expect(out).not.toContain('factory.startReactNative(')
    // The only remaining UIWindow(frame:) is the debug-only expo-dev-launcher early window.
    expect(count(out, 'UIWindow(frame: UIScreen.main.bounds)')).toBe(1)
    expect(out).toMatch(
      /if Self\.devLauncherNeedsEarlyWindow \{[^}]*window = UIWindow\(frame: UIScreen\.main\.bounds\)/,
    )
  })

  it('builds the RN root on demand and starts it off-screen when no scene connects', () => {
    expect(out).toContain('func startReactNativeIfNeeded(')
    expect(out).toContain('factory.rootViewFactory.view(')
    expect(out).toContain('delegate.createRootViewController()')
    expect(out).toContain(
      'delegate.setRootView(rootView, toRootViewController: rootViewController)',
    )
    expect(out).toContain(
      'DispatchQueue.main.asyncAfter(deadline: .now() + Self.sceneConnectGracePeriod)',
    )
    expect(out).toMatch(
      /\} else if Self\.isBackgroundEventLaunch\(launchOptions\) \{\s*\n[^\n]*\n\s*_ = startReactNativeIfNeeded\(launchOptions: launchOptions\)/,
    )
    expect(out).toContain(
      '.location, .remoteNotification, .bluetoothCentrals, .bluetoothPeripherals',
    )
    expect(out).toContain('var reactRootViewController: UIViewController?')
    expect(out).toContain(
      'var reactLaunchOptions: [UIApplication.LaunchOptionsKey: Any]?',
    )
  })

  it('keeps factory binding, super call, deep links and universal links', () => {
    expect(out).toContain('bindReactNativeFactory(factory)')
    expect(out).toContain(
      'return super.application(application, didFinishLaunchingWithOptions: launchOptions)',
    )
    expect(out).toContain(
      'RCTLinkingManager.application(app, open: url, options: options)',
    )
    expect(out).toContain(
      'RCTLinkingManager.application(application, continue: userActivity, restorationHandler: restorationHandler)',
    )
    expect(out).toContain('// Linking API')
  })

  it('places the launch block inside didFinishLaunching, before the super call', () => {
    const start = out.indexOf('didFinishLaunchingWithOptions launchOptions')
    const launch = out.indexOf('@generated begin uiscene-lifecycle-launch')
    const superCall = out.indexOf(
      'return super.application(application, didFinishLaunchingWithOptions',
    )
    expect(start).toBeGreaterThan(-1)
    expect(launch).toBeGreaterThan(start)
    expect(superCall).toBeGreaterThan(launch)
  })

  it('is idempotent', () => {
    expect(applyAppDelegate(out)).toBe(out)
    for (const name of ['state', 'launch', 'methods']) {
      expect(count(out, `@generated begin uiscene-lifecycle-${name}`)).toBe(1)
      expect(count(out, `@generated end uiscene-lifecycle-${name}`)).toBe(1)
    }
  })

  it('fails loudly on an unexpected template instead of silently skipping', () => {
    const changed = TEMPLATE_APP_DELEGATE.replace(
      'window = UIWindow(frame: UIScreen.main.bounds)',
      'window = makeWindow()',
    )
    expect(() => applyAppDelegate(changed)).toThrow(
      /does not match the Expo SDK 54 template/,
    )
  })
})

describe('withUISceneLifecycle — SceneDelegate.swift injection', () => {
  const PBX = path.join(FIXTURES, 'project.sdk54.pbxproj')

  function loadProject() {
    const project = xcode.project(PBX)
    project.parseSync()
    withTestUuids(project)
    return project
  }

  function withTestUuids(project) {
    project.generateUuid = function () {
      const id = `UISCENE${String(++uuidCounter).padStart(17, '0')}`
      return this.allUuids().includes(id) ? this.generateUuid() : id
    }
    return project
  }

  function sceneDelegateEntries(project) {
    const refs = Object.entries(project.pbxFileReferenceSection()).filter(
      ([k, v]) =>
        !k.endsWith('_comment') && /SceneDelegate\.swift"?$/.test(v.path || ''),
    )
    const builds = Object.entries(project.pbxBuildFileSection()).filter(
      ([k, v]) =>
        !k.endsWith('_comment') &&
        /SceneDelegate\.swift/.test(v.fileRef_comment || ''),
    )
    const target = project.getTarget('com.apple.product-type.application')
    const sources = project
      .pbxSourcesBuildPhaseObj(target.uuid)
      .files.filter(f => /SceneDelegate\.swift/.test(f.comment))
    return {refs, builds, sources}
  }

  it('adds SceneDelegate.swift to the app target sources exactly once (idempotent)', () => {
    const project = loadProject()
    expect(sceneDelegateEntries(project).refs).toHaveLength(0)

    addSceneDelegateToProject(project, 'AuthorityOne')
    addSceneDelegateToProject(project, 'AuthorityOne')

    const {refs, builds, sources} = sceneDelegateEntries(project)
    expect(refs).toHaveLength(1)
    expect(builds).toHaveLength(1)
    expect(sources).toHaveLength(1)

    // Survives a write/re-parse round trip and a third application.
    const tmp = path.join(
      fs.mkdtempSync(path.join(os.tmpdir(), 'uiscene-')),
      'project.pbxproj',
    )
    fs.writeFileSync(tmp, project.writeSync())
    const reparsed = xcode.project(tmp)
    reparsed.parseSync()
    withTestUuids(reparsed)
    addSceneDelegateToProject(reparsed, 'AuthorityOne')
    expect(sceneDelegateEntries(reparsed).sources).toHaveLength(1)
  })

  it('writes SceneDelegate.swift next to AppDelegate.swift, idempotently', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'uiscene-root-'))
    fs.mkdirSync(path.join(root, 'ios', 'AuthorityOne'), {recursive: true})
    const dest = writeSceneDelegate(root, 'AuthorityOne')
    const first = fs.readFileSync(dest, 'utf8')
    writeSceneDelegate(root, 'AuthorityOne')
    expect(fs.readFileSync(dest, 'utf8')).toBe(first)
    expect(first).toBe(fs.readFileSync(SCENE_DELEGATE_TEMPLATE, 'utf8'))
    expect(fs.readdirSync(path.join(root, 'ios', 'AuthorityOne'))).toEqual([
      'SceneDelegate.swift',
    ])
  })

  it('SceneDelegate hosts the AppDelegate root and forwards links, activities and lifecycle', () => {
    const src = fs.readFileSync(SCENE_DELEGATE_TEMPLATE, 'utf8')
    // Info.plist resolves "$(PRODUCT_MODULE_NAME).SceneDelegate"; an @objc rename would break it.
    expect(src).toMatch(
      /^class SceneDelegate: UIResponder, UIWindowSceneDelegate \{/m,
    )
    expect(src).not.toMatch(/@objc\(\w+\)\s*\nclass SceneDelegate/)
    expect(src).toContain('UIWindow(windowScene: windowScene)')
    expect(src).toContain('appDelegate.startReactNativeIfNeeded(')
    expect(src).toContain('openURLContexts')
    expect(src).toContain('connectionOptions.urlContexts')
    expect(src).toContain('connectionOptions.userActivities')
    expect(src).toContain(
      'func scene(_ scene: UIScene, continue userActivity: NSUserActivity)',
    )
    expect(src).toContain('performActionFor shortcutItem')
    // Debug + expo-dev-launcher keeps (and re-attaches) its early window across a disconnect.
    expect(src).toMatch(
      /func sceneDidDisconnect[\s\S]*?if AppDelegate\.devLauncherNeedsEarlyWindow \{[\s\S]*?return\s*\n\s*\}/,
    )
    for (const cb of [
      'applicationDidBecomeActive',
      'applicationWillResignActive',
      'applicationWillEnterForeground',
      'applicationDidEnterBackground',
    ]) {
      expect(src).toContain(`appDelegate?.${cb}(UIApplication.shared)`)
    }
  })
})

describe('withUISceneLifecycle — registration', () => {
  it('is registered in app.config.js plugins', () => {
    const appConfig = require('../../../app.config.js')({})
    expect(appConfig.expo.plugins).toContain(
      './plugins/uiSceneLifecycle/withUISceneLifecycle.js',
    )
  })
})
