/**
 * Dev-only guard. Runs before anything touches the network: it reads URLs out
 * of the environment and parses them, nothing else. A run is allowed only
 * when the agent runtime is the Dev runtime and the web build under test is
 * served from this machine (a local build made with the
 * development-communities flags).
 */

const DEV_RUNTIME_HOST = 'authority-one-agent-runtime-dev.e-479.workers.dev'
const DEV_RUNTIME_URL = `https://${DEV_RUNTIME_HOST}`
const DEFAULT_BASE_URL = 'http://localhost:19006'
const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]', '::1'])

function parseUrl(raw) {
  try {
    return new URL(raw)
  } catch {
    return null
  }
}

/**
 * @param {{baseURL?: string, runtimeURL?: string}} targets
 * @returns {{ok: true, baseURL: string, runtimeURL: string} | {ok: false, reason: string}}
 */
function checkTargets({baseURL, runtimeURL}) {
  const base = parseUrl(baseURL || '')
  if (!base) {
    return {ok: false, reason: `base URL is not a URL: ${String(baseURL)}`}
  }
  if (base.protocol !== 'http:' && base.protocol !== 'https:') {
    return {ok: false, reason: `base URL must be http(s): ${base.href}`}
  }
  if (!LOOPBACK_HOSTS.has(base.hostname)) {
    return {
      ok: false,
      reason: `base URL host ${base.hostname} is not the local Dev web build (localhost); refusing to run`,
    }
  }

  const runtime = parseUrl(runtimeURL || '')
  if (!runtime) {
    return {
      ok: false,
      reason: `runtime URL is not a URL: ${String(runtimeURL)}`,
    }
  }
  if (runtime.protocol !== 'https:' || runtime.hostname !== DEV_RUNTIME_HOST) {
    return {
      ok: false,
      reason: `runtime host ${runtime.hostname} is not the Dev runtime (${DEV_RUNTIME_HOST}); refusing to run`,
    }
  }

  return {ok: true, baseURL: base.origin, runtimeURL: runtime.origin}
}

/** The targets a run would use, from the environment, with Dev defaults. */
function targetsFromEnv(env) {
  return {
    baseURL: env.CLICKTHROUGH_BASE_URL || DEFAULT_BASE_URL,
    runtimeURL: env.EXPO_PUBLIC_AGENT_RUNTIME_URL || DEV_RUNTIME_URL,
  }
}

module.exports = {
  DEV_RUNTIME_HOST,
  DEV_RUNTIME_URL,
  DEFAULT_BASE_URL,
  checkTargets,
  targetsFromEnv,
}
