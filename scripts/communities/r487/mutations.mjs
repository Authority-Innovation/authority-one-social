/**
 * Breaks one line at a time and checks the dependency-free tests notice. Every
 * file is put back byte for byte afterwards, also on failure. Exits 1 if a
 * mutation survives.
 *
 *   node scripts/communities/r487/mutations.mjs
 */
import {spawnSync} from 'node:child_process'
import {readFileSync, writeFileSync} from 'node:fs'

const JOIN = 'src/screens/Community/JoinConsent.tsx'
const DESCRIPTOR = 'src/screens/Community/descriptor.ts'
const ACCESS = 'src/screens/Community/access.ts'

const MUTATIONS = [
  {
    name: 'C9: the handler drops its gate check',
    file: JOIN,
    from: "if (!consented || pending || gate.kind !== 'ok') return",
    to: 'if (!consented || pending) return',
  },
  {
    name: 'C9: the screen builds an always-ok gate',
    file: JOIN,
    from: 'const gate = consentGateFor(joinInfo)',
    to: "const gate = {kind: 'ok', version: '2'}",
  },
  {
    name: 'C10: the unsupported state is never shown',
    file: JOIN,
    from: ") : gate.kind === 'unsupported' ? (",
    to: ') : false ? (',
  },
  {
    name: 'C10: a missing version no longer shows the load error',
    file: JOIN,
    from: ") : isError || !joinInfo || gate.kind === 'missing' ? (",
    to: ') : isError || !joinInfo ? (',
  },
  {
    name: 'C11: isMember always true',
    file: DESCRIPTOR,
    from: 'isMember: doorStatesMembership(community) || joined,',
    to: 'isMember: true,',
  },
  {
    name: 'A1: the join record is ignored (the original bug)',
    file: DESCRIPTOR,
    from: 'isMember: doorStatesMembership(community) || joined,',
    to: 'isMember: doorStatesMembership(community),',
  },
  {
    name: 'A1: a failed list reads as a non-member',
    file: ACCESS,
    from: 'if (!mine.ok) {',
    to: 'if (!mine.ok) return {ok: true, data: toDescriptor(id, community.data)}\n  if (false) {',
  },
  {
    name: 'A1: a failed list passes through, so a 404 reads as a refusal',
    file: ACCESS,
    from: 'if (!mine.ok) {',
    to: 'if (!mine.ok) return mine\n  if (false) {',
  },
  {
    name: 'A1: any entry on the list counts as this community',
    file: ACCESS,
    from: 'mine.data.some(c => c?.id === id)',
    to: 'mine.data.length > 0',
  },
]

function runTests() {
  const res = spawnSync(
    process.execPath,
    [
      '--import',
      './scripts/communities/r474/register.mjs',
      '--test',
      'scripts/communities/r487/*.test.mjs',
    ],
    {encoding: 'utf8'},
  )
  const count = label =>
    Number(new RegExp(`^. ${label} (\\d+)$`, 'm').exec(res.stdout)?.[1] ?? NaN)
  return {tests: count('tests'), pass: count('pass'), fail: count('fail')}
}

const base = runTests()
console.log(`unmutated: ${base.pass} of ${base.tests} pass`)
let survived = base.fail !== 0

for (const {name, file, from, to} of MUTATIONS) {
  const original = readFileSync(file)
  const text = original.toString('utf8')
  if (!text.includes(from)) throw new Error(`${name}: line not found in ${file}`)
  let result
  try {
    writeFileSync(file, text.replace(from, () => to))
    result = runTests()
  } finally {
    writeFileSync(file, original)
  }
  if (!(result.fail > 0)) survived = true
  console.log(`${result.fail} of ${result.tests} fail | ${name}`)
}

process.exit(survived ? 1 : 0)
