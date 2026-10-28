/* eslint-disable import-x/no-nodejs-modules -- Node-side source-scanning test */
import {readdirSync, readFileSync, statSync} from 'node:fs'
import path from 'node:path'

import {describe, expect, it} from '@jest/globals'

// The runtime-bearer getter's NO-URL default means "the agent runtime" (the
// AO session may ride it). This pins that every call site either builds its
// URLs from the agent-runtime config (AGENT_RUNTIME_BASE_URL, which the
// Signature config pins to the AO runtime origin) or passes its target URL.
const root = path.resolve(__dirname, '../../../..')
const CALL = /get(?:Supabase|AgentRuntime)AccessToken\(([^)]*)\)/g

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = path.join(dir, name)
    if (
      name === '__tests__' ||
      name === '__fixtures__' ||
      name === 'node_modules'
    )
      continue
    if (statSync(p).isDirectory()) walk(p, out)
    else if (/\.(ts|tsx)$/.test(name)) out.push(p)
  }
  return out
}

/** Source with comments removed (a URL in a doc comment is not a target). */
function code(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
}

const sites = walk(path.join(root, 'src'))
  .map(file => ({
    file: path.relative(root, file),
    src: code(readFileSync(file, 'utf8')),
  }))
  .filter(
    f => f.file !== path.join('src', 'lib', 'agent-runtime', 'authToken.ts'),
  )
  .map(f => ({...f, calls: [...f.src.matchAll(CALL)].map(m => m[1].trim())}))
  .filter(f => f.calls.length > 0)

describe('runtime-bearer call sites', () => {
  it('finds the known call sites (the scan is not vacuous)', () => {
    expect(sites.length).toBeGreaterThanOrEqual(20)
    expect(sites.map(s => s.file)).toContain(
      path.join('src', 'screens', 'GameRoom', 'createMatch.ts'),
    )
  })

  it('every NO-URL call lives in a client built on the agent-runtime config', () => {
    const bad = sites
      .filter(s => s.calls.some(arg => arg === ''))
      .filter(
        s =>
          // URLs come from the agent-runtime config module…
          !/from '(?:\.\/config|#\/lib\/agent-runtime\/config|#\/lib\/agent-runtime)'/.test(
            s.src,
          ) ||
          // …and from nowhere else: no literal hosts, no other base env.
          /['"`]https?:\/\//.test(s.src) ||
          /process\.env\.EXPO_PUBLIC_/.test(s.src) ||
          /GAME_SERVER_BASE_URL/.test(s.src),
      )
      .map(s => s.file)
    expect(bad).toEqual([])
  })

  it('a client on another base (the game server) passes its target URL', () => {
    const game = sites.find(s =>
      s.file.endsWith(path.join('GameRoom', 'createMatch.ts')),
    )
    expect(game?.calls.every(arg => arg !== '')).toBe(true)
  })
})
