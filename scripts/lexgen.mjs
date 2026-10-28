#!/usr/bin/env node
/**
 * Lexicon codegen for the com.authorityone.* lexicons in /lexicons.
 *
 *   pnpm lexgen         regenerate src/lib/lexicon/generated
 *   pnpm lexgen:check   regenerate into a temp dir and fail if it differs
 *                       from what is committed (CI-style drift check)
 *
 * Runs `lex gen-api` from @atproto/lex-cli over every JSON file in /lexicons.
 * Our lexicons reference app.bsky.* and com.atproto.* defs that we do not
 * vendor; lex-cli emits relative imports for those, so this script writes a
 * small type-only shim per external module that re-exports the matching
 * namespace members from @atproto/api. That keeps the generated types pinned
 * to the same @atproto/api version the app already uses.
 */
import {spawnSync} from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {fileURLToPath} from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const LEXICON_DIR = path.join(ROOT, 'lexicons')
const OUT_DIR = path.join(ROOT, 'src', 'lib', 'lexicon', 'generated')

function listFiles(dir, ext) {
  const out = []
  for (const entry of fs.readdirSync(dir, {withFileTypes: true})) {
    const p = path.join(dir, entry.name)
    if (entry.isDirectory()) out.push(...listFiles(p, ext))
    else if (entry.name.endsWith(ext)) out.push(p)
  }
  return out.sort()
}

function lexCliBin() {
  // The package's `exports` hides package.json, so read it off disk.
  const pkgDir = path.join(ROOT, 'node_modules', '@atproto', 'lex-cli')
  const pkg = JSON.parse(
    fs.readFileSync(path.join(pkgDir, 'package.json'), 'utf8'),
  )
  return path.join(pkgDir, pkg.bin.lex)
}

function generate(outDir) {
  fs.rmSync(outDir, {recursive: true, force: true})
  const lexicons = listFiles(LEXICON_DIR, '.json')
  const res = spawnSync(
    process.execPath,
    [lexCliBin(), 'gen-api', '--yes', outDir, ...lexicons],
    {cwd: ROOT, encoding: 'utf8'},
  )
  // lex-cli logs invalid lexicons and carries on, so treat any "Invalid
  // lexicon" output as fatal rather than silently dropping a file.
  const output = `${res.stdout}\n${res.stderr}`
  if (res.status !== 0 || /Invalid lexicon/.test(output)) {
    process.stderr.write(output)
    throw new Error('lex gen-api failed')
  }
  writeExternalShims(outDir)
  writeTypesIndex(outDir, lexicons)
}

/**
 * Replace lex-cli's index.ts (a full XrpcClient with createRecord/putRecord
 * helpers that also needs the com.atproto.repo.* lexicons) with a barrel that
 * only re-exports the per-lexicon modules. Reads and writes keep going through
 * the app's existing agent.
 */
function writeTypesIndex(outDir, lexicons) {
  const ids = lexicons
    .map(f => JSON.parse(fs.readFileSync(f, 'utf8')).id)
    .sort()
  const lines = [
    '/**',
    ' * GENERATED CODE - DO NOT MODIFY',
    ' * Written by scripts/lexgen.mjs: per-lexicon modules generated from',
    ' * /lexicons. Run `pnpm lexgen` to regenerate.',
    ' */',
    ...ids.map(id => {
      const ns = id
        .split('.')
        .map(p => p[0].toUpperCase() + p.slice(1))
        .join('')
      return `export * as ${ns} from './types/${id.split('.').join('/')}.js'`
    }),
    '',
  ]
  fs.writeFileSync(path.join(outDir, 'index.ts'), lines.join('\n'))
}

/**
 * For every relative import in the generated code that does not resolve to a
 * generated file, write a shim that re-exports the used members from the
 * corresponding @atproto/api namespace (e.g. AppBskyFeedDefs.FeedViewPost).
 */
function writeExternalShims(outDir) {
  const files = listFiles(outDir, '.ts')
  const importRe = /import type \* as (\w+) from '(\.[^']+)\.js'/g
  const shims = new Map()

  for (const file of files) {
    const src = fs.readFileSync(file, 'utf8')
    for (const [, ns, rel] of src.matchAll(importRe)) {
      const target = path.resolve(path.dirname(file), `${rel}.ts`)
      if (fs.existsSync(target)) continue
      const members = shims.get(target)?.members ?? new Set()
      for (const [, member] of src.matchAll(
        new RegExp(`\\b${ns}\\.(\\w+)`, 'g'),
      )) {
        members.add(member)
      }
      shims.set(target, {ns, members})
    }
  }

  for (const [target, {ns, members}] of [...shims].sort(([a], [b]) =>
    a.localeCompare(b),
  )) {
    const lines = [
      '/**',
      ' * GENERATED CODE - DO NOT MODIFY',
      ' * Written by scripts/lexgen.mjs: type-only re-export from @atproto/api',
      ' * for a lexicon that is referenced but not vendored in /lexicons.',
      ' */',
      `import type { ${ns} } from '@atproto/api'`,
      '',
      ...[...members].sort().map(m => `export type ${m} = ${ns}.${m}`),
      '',
    ]
    fs.mkdirSync(path.dirname(target), {recursive: true})
    fs.writeFileSync(target, lines.join('\n'))
  }
}

function readTree(dir) {
  const tree = new Map()
  if (!fs.existsSync(dir)) return tree
  for (const file of listFiles(dir, '')) {
    tree.set(
      path.relative(dir, file).split(path.sep).join('/'),
      fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n'),
    )
  }
  return tree
}

function check() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lexgen-'))
  try {
    const fresh = path.join(tmp, 'generated')
    generate(fresh)
    const want = readTree(fresh)
    const have = readTree(OUT_DIR)
    const drift = []
    for (const [name, content] of want) {
      if (!have.has(name)) drift.push(`missing: ${name}`)
      else if (have.get(name) !== content) drift.push(`changed: ${name}`)
    }
    for (const name of have.keys()) {
      if (!want.has(name)) drift.push(`extra: ${name}`)
    }
    if (drift.length) {
      console.error(
        `Generated lexicon code is out of date. Run \`pnpm lexgen\`.\n  ${drift.join('\n  ')}`,
      )
      process.exitCode = 1
    } else {
      console.log('Generated lexicon code is up to date.')
    }
  } finally {
    fs.rmSync(tmp, {recursive: true, force: true})
  }
}

if (process.argv.includes('--check')) {
  check()
} else {
  generate(OUT_DIR)
  console.log('Generated src/lib/lexicon/generated')
}
