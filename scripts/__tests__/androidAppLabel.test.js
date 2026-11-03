// @ts-check
// Community (Signature rollout D2): Android's label under the icon is the brand
// displayName, not the store name in expo.name.
const {setAppLabel} = require('../../plugins/withAndroidAppLabelPlugin')

describe('withAndroidAppLabelPlugin', () => {
  it('sets app_name to the label, replacing what Expo derived from expo.name', () => {
    const xml = {
      resources: {string: [{$: {name: 'app_name'}, _: 'Signature Community'}]},
    }
    const out = setAppLabel(xml, 'Community')
    const appName = out.resources.string.filter(s => s.$.name === 'app_name')
    expect(appName).toHaveLength(1)
    expect(appName[0]._).toBe('Community')
  })
  it('adds app_name when absent', () => {
    const out = setAppLabel({resources: {}}, 'Community')
    expect(out.resources.string.find(s => s.$.name === 'app_name')._).toBe(
      'Community',
    )
  })
})
