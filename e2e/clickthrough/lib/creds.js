/**
 * Devtest credentials. Read from e2e/clickthrough/.env.local (gitignored),
 * falling back to the process environment, key by key. Nothing in this module
 * logs or returns a secret in printable form: callers get the values for the
 * browser and `describe()` for anything a human or an artifact will see.
 */
const fs = require('fs')
const path = require('path')

const ENV_FILE = path.join(__dirname, '..', '.env.local')

const KEYS = {
  handle: 'DEVTEST_HANDLE',
  appPassword: 'DEVTEST_APP_PASSWORD',
  adminHandle: 'DEVTEST_ADMIN_HANDLE',
  adminAppPassword: 'DEVTEST_ADMIN_APP_PASSWORD',
}

/** Minimal KEY=VALUE parser: comments, blank lines, `export`, quotes. */
function parseDotEnv(text) {
  const out = {}
  for (const rawLine of String(text).split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) continue
    const m = /^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line)
    if (!m) continue
    let value = m[2].trim()
    if (
      value.length >= 2 &&
      ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'")))
    ) {
      value = value.slice(1, -1)
    } else {
      // An unquoted value ends at an inline comment.
      value = value.replace(/\s+#.*$/, '')
    }
    out[m[1]] = value
  }
  return out
}

function readEnvFile(file) {
  try {
    return parseDotEnv(fs.readFileSync(file, 'utf8'))
  } catch {
    return {}
  }
}

/**
 * @param {{env?: Record<string, string|undefined>, envFile?: string, readFile?: (f: string) => Record<string,string>}} [opts]
 */
function loadCredentials(opts = {}) {
  const env = opts.env || process.env
  const fileVals = (opts.readFile || readEnvFile)(opts.envFile || ENV_FILE)
  const pick = key => {
    const fromFile = fileVals[key]
    if (typeof fromFile === 'string' && fromFile.trim()) {
      return {value: fromFile.trim(), source: 'env-file'}
    }
    const fromEnv = env[key]
    if (typeof fromEnv === 'string' && fromEnv.trim()) {
      return {value: fromEnv.trim(), source: 'process-env'}
    }
    return null
  }

  const handle = pick(KEYS.handle)
  const appPassword = pick(KEYS.appPassword)
  const adminHandle = pick(KEYS.adminHandle)
  const adminAppPassword = pick(KEYS.adminAppPassword)

  const devtest =
    handle && appPassword
      ? {
          handle: handle.value,
          appPassword: appPassword.value,
          source:
            handle.source === appPassword.source ? handle.source : 'mixed',
        }
      : null
  const admin =
    adminHandle && adminAppPassword
      ? {handle: adminHandle.value, appPassword: adminAppPassword.value}
      : null

  return {devtest, admin}
}

/** What may be printed about the credentials: presence and source only. */
function describe(creds) {
  return {
    devtest: creds.devtest ? `present (${creds.devtest.source})` : 'absent',
    admin: creds.admin ? 'present' : 'absent',
  }
}

/**
 * Every credential value, for scrubbing artifacts. Handles are included: they
 * come from the same file, and the artifacts must not carry its values.
 */
function secretsOf(creds) {
  const out = []
  for (const c of [creds.devtest, creds.admin]) {
    if (!c) continue
    if (c.appPassword) out.push(c.appPassword)
    if (c.handle) out.push(c.handle, c.handle.replace(/^@/, ''))
  }
  // Longest first, so a handle is not half-replaced by a shorter value.
  return [...new Set(out.filter(Boolean))].sort((x, y) => y.length - x.length)
}

/** Replaces every occurrence of each secret in `text` with a marker. */
function redact(text, secrets) {
  let out = String(text)
  for (const s of secrets) {
    if (!s) continue
    out = out.split(s).join('[REDACTED]')
  }
  return out
}

module.exports = {
  ENV_FILE,
  KEYS,
  parseDotEnv,
  loadCredentials,
  describe,
  secretsOf,
  redact,
}
