/**
 * Authority One - pod deployment target floor (pure Podfile transform).
 *
 * Xcode 27.1 rejects pod targets whose IPHONEOS_DEPLOYMENT_TARGET is below
 * 15.0. Several pods still declare older minimums in their podspecs, so this
 * injects a block at the END of the Podfile `post_install` hook (after
 * react_native_post_install, so nothing later can lower it again) that raises
 * every Pods-project target configuration below the floor to the floor.
 *
 * - Values already >= the floor are left as they are (never lowered).
 * - Configurations with no explicit value are left alone (they inherit the
 *   Pods project setting, which CocoaPods derives from `platform :ios`).
 * - Only `installer.pods_project` is touched; the app target lives in the
 *   user project and keeps whatever expo-build-properties sets.
 *
 * Kept free of expo/config-plugins imports so it can be tested with plain node.
 */
const MIN_POD_IOS_DEPLOYMENT_TARGET = '15.0'
const TAG = 'ao-pod-deployment-target'
const BEGIN = `# @generated begin ${TAG}`
const END = `# @generated end ${TAG}`

// JS twin of the Ruby comparison below (Gem::Version semantics for dotted
// numeric versions), used by the tests to pin the intended behaviour.
function compareVersions(a, b) {
  const pa = String(a).split('.').map(Number)
  const pb = String(b).split('.').map(Number)
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] || 0) - (pb[i] || 0)
    if (d !== 0) return d < 0 ? -1 : 1
  }
  return 0
}

function resolveDeploymentTarget(
  current,
  floor = MIN_POD_IOS_DEPLOYMENT_TARGET,
) {
  if (current === undefined || current === null || current === '') {
    return current
  }
  return compareVersions(current, floor) < 0 ? floor : current
}

function rubyBlock(indent, floor) {
  const i = indent
  return [
    `${i}${BEGIN}`,
    `${i}# Xcode 27.1 rejects pod deployment targets below ${floor}; raise lower values, never lower higher ones.`,
    `${i}installer.pods_project.targets.each do |pod_target|`,
    `${i}  pod_target.build_configurations.each do |build_config|`,
    `${i}    current = build_config.build_settings['IPHONEOS_DEPLOYMENT_TARGET']`,
    `${i}    next if current.nil? || current.to_s.empty?`,
    `${i}    if Gem::Version.new(current.to_s) < Gem::Version.new('${floor}')`,
    `${i}      build_config.build_settings['IPHONEOS_DEPLOYMENT_TARGET'] = '${floor}'`,
    `${i}    end`,
    `${i}  end`,
    `${i}end`,
    `${i}${END}`,
  ]
}

function applyPodDeploymentTarget(
  contents,
  floor = MIN_POD_IOS_DEPLOYMENT_TARGET,
) {
  // Idempotent: drop a previously generated block before re-inserting.
  const stripped = contents.replace(
    new RegExp(String.raw`^[ \t]*${BEGIN}[\s\S]*?${END}[ \t]*\r?\n`, 'm'),
    '',
  )
  const lines = stripped.split('\n')
  const start = lines.findIndex(l => /^\s*post_install do \|installer\|\s*$/.test(l))
  if (start === -1) {
    throw new Error(
      '[withPodDeploymentTarget] expected a `post_install do |installer|` hook in the Podfile. ' +
        'The Expo Podfile template may have changed; verify before removing this check.',
    )
  }
  const hookIndent = lines[start].match(/^\s*/)[0]
  let end = -1
  for (let i = start + 1; i < lines.length; i++) {
    if (lines[i] === `${hookIndent}end` || lines[i] === `${hookIndent}end\r`) {
      end = i
      break
    }
  }
  if (end === -1) {
    throw new Error(
      '[withPodDeploymentTarget] could not find the end of the Podfile post_install hook.',
    )
  }
  lines.splice(end, 0, ...rubyBlock(`${hookIndent}  `, floor))
  return lines.join('\n')
}

module.exports = {
  MIN_POD_IOS_DEPLOYMENT_TARGET,
  applyPodDeploymentTarget,
  resolveDeploymentTarget,
  compareVersions,
}
