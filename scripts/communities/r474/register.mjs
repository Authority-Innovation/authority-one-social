/**
 * Dependency-free loader for the round 474 regression tests. node_modules is
 * not available to the builder (installs are not approved), so these run on
 * Node's own test runner and type stripping:
 *
 *   node --import ./scripts/communities/r474/register.mjs --test "scripts/communities/r474/*.test.mjs"
 *
 * It resolves the `#/` alias and extensionless relative imports to .ts files,
 * and stubs the few modules that would otherwise pull in React Native. The
 * .mjs extension keeps these out of jest's testMatch.
 */
import {existsSync} from 'node:fs'
import {registerHooks} from 'node:module'
import {dirname, join, resolve as resolvePath} from 'node:path'
import {fileURLToPath, pathToFileURL} from 'node:url'

const SRC = resolvePath(dirname(fileURLToPath(import.meta.url)), '../../../src')

const STUBS = {
  // Pulls in @atproto/api. Only the public tier reads it, and that stays refused.
  [join(SRC, 'lib/communities/groupPostBinding')]: `export function isWellFormedGroupPostBinding() { return false }`,
  [join(SRC, 'logger')]: `export const logger = {warn() {}, error() {}, info() {}, debug() {}}`,
  [join(SRC, 'lib/agent-runtime/authToken')]: `export async function getAgentRuntimeAccessToken() { return globalThis.__r474Token === undefined ? 'test-token' : globalThis.__r474Token }`,
  [join(SRC, 'lib/agent-runtime/config')]: `export const AGENT_RUNTIME_BASE_URL = 'https://runtime.invalid'`,
}

function fileFor(base) {
  for (const suffix of ['.ts', '/index.ts', '']) {
    const candidate = base + suffix
    if (suffix === '' ? /\.(ts|json|mjs)$/.test(candidate) && existsSync(candidate) : existsSync(candidate)) {
      return candidate
    }
  }
  return undefined
}

registerHooks({
  resolve(specifier, context, nextResolve) {
    let base
    if (specifier.startsWith('#/')) {
      base = join(SRC, specifier.slice(2))
    } else if (
      specifier.startsWith('.') &&
      context.parentURL?.startsWith('file:') &&
      context.parentURL.endsWith('.ts')
    ) {
      base = resolvePath(dirname(fileURLToPath(context.parentURL)), specifier)
    }
    if (!base) return nextResolve(specifier, context)
    if (STUBS[base] !== undefined) {
      return {
        shortCircuit: true,
        url: `data:text/javascript,${encodeURIComponent(STUBS[base])}`,
      }
    }
    const file = fileFor(base)
    if (!file) return nextResolve(specifier, context)
    return {shortCircuit: true, url: pathToFileURL(file).href}
  },
})
