// Plain node test (node --test), not jest: the transform has no dependencies and
// the PC worktree has no node_modules. The .mjs extension keeps jest from picking
// it up. Ruby is not available on the PC, so the injected Ruby is checked
// structurally and its comparison is pinned via the JS twin resolveDeploymentTarget.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import {createRequire} from 'node:module'
import path from 'node:path'
import {test} from 'node:test'
import {fileURLToPath} from 'node:url'

const require = createRequire(import.meta.url)
const {
  MIN_POD_IOS_DEPLOYMENT_TARGET,
  applyPodDeploymentTarget,
  resolveDeploymentTarget,
} = require('../podfileTransform.js')

const here = path.dirname(fileURLToPath(import.meta.url))
const PODFILE = fs.readFileSync(
  path.join(here, '__fixtures__', 'Podfile.sdk54'),
  'utf8',
)

// Pod targets as CocoaPods would expose them in installer.pods_project.
const POD_TARGETS = [
  {name: 'LegacyPod', IPHONEOS_DEPLOYMENT_TARGET: '13.0'},
  {name: 'FloorPod', IPHONEOS_DEPLOYMENT_TARGET: '15.0'},
  {name: 'ModernPod', IPHONEOS_DEPLOYMENT_TARGET: '17.0'},
  {name: 'PatchPod', IPHONEOS_DEPLOYMENT_TARGET: '15.0.1'},
  {name: 'OldPod', IPHONEOS_DEPLOYMENT_TARGET: '9.0'},
  {name: 'InheritsPod', IPHONEOS_DEPLOYMENT_TARGET: undefined},
]

test('floor is 15.0', () => {
  assert.equal(MIN_POD_IOS_DEPLOYMENT_TARGET, '15.0')
})

test('pod targets: 13.0 -> 15.0, 15.0 unchanged, higher unchanged', () => {
  const out = Object.fromEntries(
    POD_TARGETS.map(t => [t.name, resolveDeploymentTarget(t.IPHONEOS_DEPLOYMENT_TARGET)]),
  )
  assert.deepEqual(out, {
    LegacyPod: '15.0',
    FloorPod: '15.0',
    ModernPod: '17.0',
    PatchPod: '15.0.1',
    OldPod: '15.0',
    InheritsPod: undefined,
  })
})

test('Podfile transform injects the block at the end of post_install', () => {
  const out = applyPodDeploymentTarget(PODFILE)
  const lines = out.split('\n')
  const hook = lines.indexOf('  post_install do |installer|')
  const rnCallEnd = lines.indexOf('    )', hook)
  const begin = lines.indexOf('    # @generated begin ao-pod-deployment-target')
  const end = lines.indexOf('    # @generated end ao-pod-deployment-target')
  assert.ok(hook >= 0 && rnCallEnd > hook, 'fixture has the RN post_install call')
  assert.ok(begin > rnCallEnd, 'block runs after react_native_post_install')
  assert.equal(lines[end + 1], '  end', 'block is the last thing in post_install')

  const block = lines.slice(begin, end + 1).join('\n')
  assert.match(block, /installer\.pods_project\.targets\.each do \|pod_target\|/)
  assert.match(block, /next if current\.nil\? \|\| current\.to_s\.empty\?/)
  assert.match(
    block,
    /if Gem::Version\.new\(current\.to_s\) < Gem::Version\.new\('15\.0'\)\n\s+build_config\.build_settings\['IPHONEOS_DEPLOYMENT_TARGET'\] = '15\.0'/,
  )
  // Only pod targets: no user project / aggregate target / app target edits.
  assert.doesNotMatch(block, /aggregate_targets|user_project|native_targets/)

  // Everything else in the Podfile is untouched.
  const withoutBlock = [...lines.slice(0, begin), ...lines.slice(end + 1)].join('\n')
  assert.equal(withoutBlock, PODFILE)
  // The app platform line is not modified.
  assert.match(out, /platform :ios, podfile_properties\['ios\.deploymentTarget'\] \|\| '15\.1'/)
})

test('Podfile transform is idempotent', () => {
  const once = applyPodDeploymentTarget(PODFILE)
  assert.equal(applyPodDeploymentTarget(once), once)
  assert.equal(once.split('@generated begin ao-pod-deployment-target').length - 1, 1)
})

test('Podfile transform fails loudly without a post_install hook', () => {
  assert.throws(
    () => applyPodDeploymentTarget("target 'X' do\nend\n"),
    /post_install/,
  )
})
