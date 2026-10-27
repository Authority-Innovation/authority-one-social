/* eslint-disable import-x/no-nodejs-modules -- Node-side source-reading test */
import {existsSync, readdirSync, readFileSync} from 'fs'
import {join} from 'path'

import {
  DEFAULT_SKIN_ID,
  legacyThemePackFromSkinId,
  skinIdFromLegacyThemePack,
} from '#/lib/skins/ids'
import {selectableSkins} from '#/lib/skins/selectable'
import {type SkinDefinition} from '#/lib/skins/types'

// Same constraint as skins.test.ts: the registry and skin DEFINITIONS pull the
// `#/alf` -> Layout -> native chain, which jest-expo cannot evaluate, so the
// registry CONTENT is guarded at the source level. `selectableSkins` is pure
// and tested directly.

const SKINS_DIR = join(__dirname, '..')
const REPO_ROOT = join(SKINS_DIR, '..', '..', '..')
// Normalise line endings so source checks behave the same on Windows checkouts.
const read = (path: string) => readFileSync(path, 'utf8').replace(/\r\n/g, '\n')

function stub(id: string, pending?: boolean): SkinDefinition {
  return {
    id,
    displayName: id,
    swatch: {background: '#fff', accent: '#000'},
    pending,
  }
}

describe('selectableSkins (pure)', () => {
  it('drops pending skins and keeps order', () => {
    const skins = [
      stub('default'),
      stub('authority'),
      stub('hurricanes', false),
      stub('afterpride', true),
    ]
    expect(selectableSkins(skins).map(s => s.id)).toEqual([
      'default',
      'authority',
      'hurricanes',
    ])
  })

  it('treats a missing pending flag as live', () => {
    expect(selectableSkins([stub('x')]).map(s => s.id)).toEqual(['x'])
  })

  it('returns an empty list when every skin is pending', () => {
    expect(selectableSkins([stub('a', true), stub('b', true)])).toEqual([])
  })
})

describe('registry lists afterpride as pending (source-level)', () => {
  const registry = read(join(SKINS_DIR, 'registry.ts'))
  const src = read(join(SKINS_DIR, 'afterpride.ts'))

  it('imports and registers afterprideSkin', () => {
    expect(registry).toMatch(
      /import \{afterprideSkin\} from '#\/lib\/skins\/afterpride'/,
    )
  })

  it("defines id 'afterpride' with pending: true", () => {
    expect(src).toMatch(/id:\s*'afterpride'/)
    expect(src).toMatch(/pending:\s*true/)
    expect(src).not.toMatch(/pending:\s*false/)
  })

  it('says it is a placeholder', () => {
    expect(src).toContain('Placeholder skin. Brand colours and font pending.')
  })

  it('has a plain-literal display name (proper noun, no Lingui macro)', () => {
    expect(src).toMatch(/displayName:\s*'After Pride'/)
    expect(src).not.toMatch(/msg`/)
  })

  it('builds both an ALF and a legacy theme set', () => {
    expect(src).toMatch(/alfThemes:\s*afterprideAlfThemes/)
    expect(src).toMatch(/legacyThemes:\s*afterprideLegacyThemes/)
    expect(src).toMatch(/createThemes\(/)
  })
})

describe('afterpride adds no icon, font asset or app config', () => {
  const src = read(join(SKINS_DIR, 'afterpride.ts'))

  it('never touches the app icon', () => {
    expect(src).toMatch(/alternateIconName:\s*undefined/)
    expect(src).not.toMatch(/skin_afterpride/)
  })

  it('has no heading font override', () => {
    expect(src).toMatch(/headingFont:\s*undefined/)
  })

  it('has no app.config.js entry', () => {
    const config = read(join(REPO_ROOT, 'app.config.js'))
    expect(config.toLowerCase()).not.toMatch(/after_?pride/)
  })

  it('has no asset files', () => {
    const assets = join(REPO_ROOT, 'assets')
    if (!existsSync(assets)) return
    const names = readdirSync(assets, {recursive: true}).map(String)
    expect(names.filter(n => /after_?pride/i.test(n))).toEqual([])
  })
})

describe('picker never offers a pending skin', () => {
  const picker = read(
    join(REPO_ROOT, 'src', 'screens', 'Settings', 'SkinPicker.tsx'),
  )

  it('renders selectableSkins(listSkins()), not the raw registry list', () => {
    expect(picker).toMatch(/const skins = selectableSkins\(listSkins\(\)\)/)
    expect(picker).not.toMatch(/const skins = listSkins\(\)/)
  })
})

describe('default and existing skins are unchanged (N3)', () => {
  const registry = read(join(SKINS_DIR, 'registry.ts'))

  it('keeps the base display order and appends only afterpride', () => {
    const order = registry
      .match(/SKIN_LIST[^=]*=\s*\[([^\]]*)\]/)?.[1]
      ?.split(',')
      .map(s => s.trim())
      .filter(Boolean)
    expect(order).toEqual([
      'defaultSkin',
      'authoritySkin',
      'hurricanesSkin',
      'afterprideSkin',
    ])
  })

  it('keeps the default skin definition byte-identical to the base', () => {
    expect(registry).toContain(`const defaultSkin: SkinDefinition = {
  id: DEFAULT_SKIN_ID,
  displayName: 'Default',
  // No overlays -> base ALF + legacy themes + default font are used.
  alfThemes: undefined,
  legacyThemes: undefined,
  headingFont: undefined,
  // Selecting the default skin resets to the primary bundled app icon.
  alternateIconName: null,
  swatch: {
    // The base app already ships the One orange ramp on neutral surfaces.
    background: '#FFFFFF',
    accent: '#E8431F',
  },
}`)
  })

  it('keeps the default skin id and the unknown-id fallback', () => {
    expect(DEFAULT_SKIN_ID).toBe('default')
    expect(registry).toMatch(
      /return \(id && SKINS\[id\]\) \|\| SKINS\[DEFAULT_SKIN_ID\]/,
    )
  })

  it('never resolves afterpride from the legacy themePack seed', () => {
    for (const pack of [undefined, 'default', 'authorityOne', 'afterpride']) {
      expect(skinIdFromLegacyThemePack(pack)).not.toBe('afterpride')
    }
    expect(legacyThemePackFromSkinId('afterpride')).toBe('default')
  })
})
