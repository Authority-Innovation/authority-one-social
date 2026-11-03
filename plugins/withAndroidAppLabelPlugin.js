const {withStringsXml, AndroidConfig} = require('expo/config-plugins')

/**
 * Community (Signature rollout D2): the label under the icon is the brand's
 * `displayName` ("Community"), not the store name in `expo.name` ("Signature
 * Community"), which Expo would otherwise also use as Android's `app_name`.
 * iOS gets the same split through CFBundleDisplayName.
 */
function setAppLabel(stringsXml, label) {
  return AndroidConfig.Strings.setStringItem(
    [
      AndroidConfig.Resources.buildResourceItem({
        name: 'app_name',
        value: label,
      }),
    ],
    stringsXml,
  )
}

function withAndroidAppLabelPlugin(config, {label} = {}) {
  if (!label) return config
  return withStringsXml(config, c => {
    c.modResults = setAppLabel(c.modResults, label)
    return c
  })
}

module.exports = withAndroidAppLabelPlugin
module.exports.setAppLabel = setAppLabel
