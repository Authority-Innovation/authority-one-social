import {AGENT_RUNTIME_SERVICE} from '#/lib/constants'

/**
 * Base URL of the agent runtime (Cloudflare Worker). Overridable at build time via
 * EXPO_PUBLIC_AGENT_RUNTIME_URL so dev/staging/prod can repoint without code changes.
 */
export const AGENT_RUNTIME_BASE_URL =
  process.env.EXPO_PUBLIC_AGENT_RUNTIME_URL ?? AGENT_RUNTIME_SERVICE

/** Streaming chat endpoint. */
export const CHAT_ENDPOINT = `${AGENT_RUNTIME_BASE_URL}/app/chat`

/** Default agent handle to converse with when the caller doesn't specify one. */
export const DEFAULT_AGENT = 'ada'
