/**
 * Run artifacts: e2e/clickthrough/artifacts/<runId>/ with the step
 * screenshots, summary.json and REPORT.md. Every string that goes into an
 * artifact passes through `redact` first.
 */
const fs = require('fs')
const path = require('path')

const {redact} = require('./creds')

const ARTIFACTS_ROOT = path.join(__dirname, '..', 'artifacts')

function newRunId(now = new Date()) {
  return now.toISOString().replace(/[:.]/g, '-')
}

function runDir(runId) {
  return path.join(ARTIFACTS_ROOT, runId)
}

function screenshotName(index, step) {
  const nn = String(index).padStart(2, '0')
  return `${nn}-${String(step).replace(/[^a-z0-9-]+/gi, '-')}.png`
}

/**
 * @param {{runId: string, result: string, steps: object[], consoleErrors: object[], notes?: string[], secrets?: string[]}} run
 */
function writeArtifacts(run) {
  const dir = runDir(run.runId)
  fs.mkdirSync(dir, {recursive: true})
  const secrets = run.secrets || []
  const clean = v => JSON.parse(redact(JSON.stringify(v), secrets))

  const summary = clean({
    runId: run.runId,
    result: run.result,
    steps: run.steps,
    consoleErrors: run.consoleErrors,
    notes: run.notes || [],
  })
  fs.writeFileSync(
    path.join(dir, 'summary.json'),
    JSON.stringify(summary, null, 2) + '\n',
  )
  fs.writeFileSync(path.join(dir, 'REPORT.md'), renderReport(summary))
  return dir
}

function renderReport(summary) {
  const lines = []
  lines.push(`# Clickthrough report - ${summary.runId}`, '')
  lines.push(`**Result:** ${summary.result}`, '')
  if (summary.notes.length) {
    for (const n of summary.notes) lines.push(`- ${n}`)
    lines.push('')
  }
  lines.push('## Steps', '')
  if (!summary.steps.length) {
    lines.push('No steps ran.', '')
  } else {
    lines.push('| # | Step | Result | Reason | Time |', '|---|---|---|---|---|')
    summary.steps.forEach((s, i) => {
      const reason = (s.reason || '').replace(/\|/g, '\\|').replace(/\n/g, ' ')
      lines.push(
        `| ${i} | ${s.step} | ${s.status} | ${reason} | ${s.timestamp} |`,
      )
    })
    lines.push('')
  }
  lines.push('## Console errors', '')
  if (!summary.consoleErrors.length) {
    lines.push('None.', '')
  } else {
    for (const e of summary.consoleErrors) {
      lines.push(
        `- [${e.step}] ${e.kind}: ${String(e.text).replace(/\n/g, ' ')}`,
      )
    }
    lines.push('')
  }
  lines.push('## Screenshots', '')
  const shots = summary.steps.filter(s => s.screenshot)
  if (!shots.length) {
    lines.push('None.', '')
  } else {
    for (const s of shots) lines.push(`- ${s.screenshot}`)
    lines.push('')
  }
  return lines.join('\n')
}

module.exports = {
  ARTIFACTS_ROOT,
  newRunId,
  runDir,
  screenshotName,
  writeArtifacts,
  renderReport,
}
