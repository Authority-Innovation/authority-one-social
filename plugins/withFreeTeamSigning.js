const {withEntitlementsPlist} = require('expo/config-plugins')

/**
 * Authority One — Free-team iOS signing gate.
 *
 * Companion to the PAID_SIGNING flag in app.config.js. A free *personal* Apple
 * Developer team cannot sign these capabilities (Xcode: "Personal development
 * teams do not support the Communication Notifications, Extended Virtual
 * Addressing, Associated Domains, and Push Notifications capabilities"):
 *
 *   • aps-environment                                  → Push Notifications
 *   • com.apple.developer.associated-domains           → Associated Domains
 *   • com.apple.developer.usernotifications.communication → Communication Notifications
 *   • com.apple.developer.kernel.extended-virtual-addressing → Extended Virtual Addressing
 *   • com.apple.developer.kernel.increased-memory-limit     → (gated with Extended Virtual Addressing)
 *
 * app.config.js already omits the config-declared entitlements when
 * PAID_SIGNING is unset, but `aps-environment` is injected into the
 * entitlements plist by the expo-notifications config plugin (not declared in
 * app.config.js). This plugin strips every free-team-forbidden entitlement from
 * the generated plist, so the prebuilt Xcode project signs on a free personal
 * team. It is a no-op when PAID_SIGNING=1.
 *
 * ORDERING — this plugin MUST be registered FIRST in app.config.js `plugins`.
 * Expo executes entitlements-mod actions in REVERSE registration order (the base
 * provider descends the chain; each mod runs its action then calls the next), so
 * the first-registered plugin's action runs LAST — i.e. after expo-notifications
 * has added aps-environment. Registering it last would make it run before
 * expo-notifications, and the push entitlement would come back (verified).
 *
 * Re-enable everything for paid TestFlight / App Store builds by setting
 * PAID_SIGNING=1 in the build environment (see app.config.js for details).
 */
const FREE_TEAM_FORBIDDEN_ENTITLEMENTS = [
  'aps-environment', // Push Notifications
  'com.apple.developer.associated-domains', // Associated Domains
  'com.apple.developer.usernotifications.communication', // Communication Notifications
  'com.apple.developer.kernel.extended-virtual-addressing', // Extended Virtual Addressing
  'com.apple.developer.kernel.increased-memory-limit', // gated with Extended Virtual Addressing
]

module.exports = function withFreeTeamSigning(appConfig) {
  // Paid signing requested: keep all capabilities untouched.
  if (process.env.PAID_SIGNING === '1') {
    return appConfig
  }

  return withEntitlementsPlist(appConfig, function (decoratedAppConfig) {
    try {
      for (const key of FREE_TEAM_FORBIDDEN_ENTITLEMENTS) {
        delete decoratedAppConfig.modResults[key]
      }
    } catch (e) {
      console.error(`withFreeTeamSigning failed`, e)
    }
    return decoratedAppConfig
  })
}
