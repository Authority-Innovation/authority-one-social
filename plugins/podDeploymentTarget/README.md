# podDeploymentTarget

Xcode 27.1 rejects pod targets with `IPHONEOS_DEPLOYMENT_TARGET` below 15.0.
`withPodDeploymentTarget.js` (registered in `app.config.js`) uses `withPodfile`
to append a tagged block to the end of the Podfile `post_install` hook, after
`react_native_post_install`. For every `installer.pods_project` target
configuration, a value below 15.0 is raised to 15.0. A value at or above 15.0,
or one left unset (inherited), stays as it is. The app target is in the user
project and is not touched; its deployment target still comes from
`expo-build-properties` (`ios.deploymentTarget`).

The transform is idempotent and throws when it can't find the `post_install`
hook, so a change to the Expo Podfile template fails prebuild instead of
being skipped without a warning.

Test (plain node, no dependencies):

    node --test plugins/podDeploymentTarget/__tests__/podfileTransform.test.mjs
