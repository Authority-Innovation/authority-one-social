/**
 * Devtest credentials. Provisioned by a human OUTSIDE any repo, in a fixed
 * per-user file, and looked up in this order:
 *
 * 1. the file named by DEVTEST_ENV_FILE, if set (an override for tests and CI);
 * 2. otherwise the per-user file `<home>/.ao/devtest.env`
 *    (%USERPROFILE%\.ao\devtest.env on Windows, ~/.ao/devtest.env on POSIX);
 * 3. the process environment, key by key, for anything the file does not set
 *    (so the whole credential when the file is absent).
 *
 * The file is parsed in memory and never written or copied. Nothing in this
 * module logs or returns a secret in printable form: callers get the values
 * for the browser and `describe()` for anything a human or an artifact will
 * see.
 */
const fs = require('fs')
const os = require('os')
const path = require('path')

const OVERRIDE_VAR = 'DEVTEST_ENV_FILE'

/**
 * The per-user credential file. `homedir` and `pathImpl` are injectable so the
 * tests can assert the computed path on both platforms without reading it.
 */
function userCredFile({homedir = os.homedir(), pathImpl = path} = {}) {
  return pathImpl.join(homedir, '.ao', 'devtest.env')
}

/**
 * The file to read: the DEVTEST_ENV_FILE override, else the per-user file. An
 * override never falls through to the per-user file, so a test pointing it at
 * a missing path cannot pick up a real credential.
 */
function resolveCredFile(env = process.env, opts = {}) {
  const override = env[OVERRIDE_VAR]
  if (typeof override === 'string' && override.trim()) {
    return path.resolve(override.trim())
  }
  return userCredFile(opts)
}

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
 * @param {{env?: Record<string, string|undefined>, homedir?: string, readFile?: (f: string) => Record<string,string>}} [opts]
 */
function loadCredentials(opts = {}) {
  const env = opts.env || process.env
  const file = resolveCredFile(env, {homedir: opts.homedir})
  const fileVals = (opts.readFile || readEnvFile)(file)
  const pick = key => {
    const fromFile = fileVals[key]
    if (typeof fromFile === 'string' && fromFile.trim()) {
      return {value: fromFile.trim(), source: 'file'}
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

/**
 * The secrets an Authorization header carries: the whole header and the bare
 * token, since an error message can quote either.
 */
function authSecrets(auth) {
  if (!auth) return []
  const token = String(auth).replace(/^Bearer\s+/i, '')
  return [...new Set([auth, token].filter(Boolean))]
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
  OVERRIDE_VAR,
  userCredFile,
  resolveCredFile,
  KEYS,
  parseDotEnv,
  loadCredentials,
  describe,
  secretsOf,
  authSecrets,
  redact,
}
