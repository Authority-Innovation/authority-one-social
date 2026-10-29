const {withPodfile} = require('expo/config-plugins')

const {applyPodDeploymentTarget} = require('./podfileTransform')

/**
 * Authority One - raises pod IPHONEOS_DEPLOYMENT_TARGET values below 15.0 to
 * 15.0 in the Podfile post_install hook (Xcode 27.1 rejects lower values).
 * See ./podfileTransform.js and ./README.md.
 */
module.exports = function withPodDeploymentTarget(config) {
  return withPodfile(config, cfg => {
    cfg.modResults.contents = applyPodDeploymentTarget(cfg.modResults.contents)
    return cfg
  })
}
