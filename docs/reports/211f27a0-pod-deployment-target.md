# Task 211f27a0: Podfile post_install raises pod deployment targets to 15.0 (Xcode 27.1)

Branch: `coord/app-podfile-post-install-raises-211f27a0` (base 5aae9a5b4, communities/integration head)
Implementation commit: `e53059169`

## What changed

```
 app.config.js                                      |   4 +
 plugins/podDeploymentTarget/README.md              |  18 ++++
 .../__tests__/__fixtures__/Podfile.sdk54           |  36 ++++++++
 .../__tests__/podfileTransform.test.mjs            |  92 +++++++++++++++++++
 plugins/podDeploymentTarget/podfileTransform.js    | 102 +++++++++++++++++++++
 .../podDeploymentTarget/withPodDeploymentTarget.js |  15 +++
 6 files changed, 267 insertions(+)
```

- Plugin: `plugins/podDeploymentTarget/withPodDeploymentTarget.js`. It uses `withPodfile` from
  `expo/config-plugins` and calls the pure transform in `plugins/podDeploymentTarget/podfileTransform.js`.
  The layout follows `plugins/uiSceneLifecycle`.
- Registration: `app.config.js` `plugins`, right after
  `./plugins/uiSceneLifecycle/withUISceneLifecycle.js`:
  `'./plugins/podDeploymentTarget/withPodDeploymentTarget.js'`.
- The transform adds a tagged block (`# @generated begin/end ao-pod-deployment-target`) at the
  end of `post_install do |installer|`, after `react_native_post_install`. For every
  `installer.pods_project.targets` build configuration, it sets `IPHONEOS_DEPLOYMENT_TARGET` to
  `'15.0'` when `Gem::Version.new(current) < Gem::Version.new('15.0')`.
  - A value at or above 15.0 is left as it is. An unset value is also left alone (it inherits).
  - The block only touches pods_project. The app target (user project) keeps the
    `expo-build-properties` `deploymentTarget: '17.0'`.
  - Running the transform twice gives the same Podfile. If the Podfile has no `post_install`
    hook, the transform throws, so prebuild fails loudly.
- No feature-flag changes and no `eas.json` changes.

## Test

`node --test plugins/podDeploymentTarget/__tests__/podfileTransform.test.mjs`: **5/5 pass** (run on the PC, node v24.14.0).

- `pod targets: 13.0 -> 15.0, 15.0 unchanged, higher unchanged`: 13.0 becomes 15.0 and 9.0 becomes 15.0.
  15.0, 15.0.1 and 17.0 are unchanged, and unset stays unset.
- `Podfile transform injects the block at the end of post_install`: uses the SDK 54 template fixture.
  It checks that the block comes after `react_native_post_install`, that it is the last thing in the
  hook, that it contains the strict-`<` Ruby comparison and assignment, that it makes no
  user-project/aggregate-target edits, and that the rest of the Podfile is byte-identical.
- `Podfile transform is idempotent`, `fails loudly without a post_install hook`, `floor is 15.0`.

Limits of this test: the worktree has no `node_modules` and the PC has no Ruby. So the test is a
plain node test (`.mjs`, which jest does not pick up), not part of `pnpm test`. The Ruby itself was
**not executed**. Its comparison is checked by structure, and its behaviour is pinned through the JS
twin `resolveDeploymentTarget`. `withPodDeploymentTarget.js` was syntax-checked only; it was not
loaded, because `expo/config-plugins` is not installed here.

## iOS build

iOS build not run on the PC; the Mac lane runs prebuild and the Xcode build.

## What the Mac lane must verify

1. `npx expo prebuild --platform ios --clean` succeeds. `withPodfile` must resolve from
   `expo/config-plugins` on SDK 54. If it doesn't, switch the plugin to `withDangerousMod`.
2. `ios/Podfile` contains the `ao-pod-deployment-target` block once, inside `post_install`, after
   `react_native_post_install(...)`.
3. After `pod install`, no target in `ios/Pods/Pods.xcodeproj` has `IPHONEOS_DEPLOYMENT_TARGET`
   below 15.0, for example: `grep -o 'IPHONEOS_DEPLOYMENT_TARGET = [0-9.]*' ios/Pods/Pods.xcodeproj/project.pbxproj | sort | uniq -c`.
   Targets that were above 15.0 must keep their own values.
4. The app target is still at 17.0 in `ios/*.xcodeproj`.
5. The Xcode 27.1 build no longer reports pod deployment-target errors.
