import {AGENT_RUNTIME_SERVICE} from '#/lib/constants'

/**
 * Base URL of the agent runtime (Cloudflare Worker). Overridable at build time via
 * EXPO_PUBLIC_AGENT_RUNTIME_URL so dev/staging/prod can repoint without code changes.
 */
export const AGENT_RUNTIME_BASE_URL =
  process.env.EXPO_PUBLIC_AGENT_RUNTIME_URL ?? AGENT_RUNTIME_SERVICE

/** Streaming chat endpoint. */
export const CHAT_ENDPOINT = `${AGENT_RUNTIME_BASE_URL}/app/chat`

/**
 * Multi-chat (threads + groups) endpoints. Owner-scoped, same /app auth pattern. The
 * collection endpoint lists/creates threads; per-thread sub-paths are built from the id.
 */
export const THREADS_ENDPOINT = `${AGENT_RUNTIME_BASE_URL}/app/threads`
export const threadMessagesUrl = (id: string) =>
  `${THREADS_ENDPOINT}/${encodeURIComponent(id)}/messages`
export const threadSendUrl = (id: string) =>
  `${THREADS_ENDPOINT}/${encodeURIComponent(id)}/send`
export const threadGroupUrl = (id: string) =>
  `${THREADS_ENDPOINT}/${encodeURIComponent(id)}/group`

/**
 * Chat image upload endpoint (owner-scoped). The app uploads a picked image here;
 * the runtime hosts it in R2 (the same `putRawImage` path the inbound SMS/MMS media
 * uses) and returns the public URL, which the app then sends with the chat turn so
 * the existing vision pipeline processes it. See MEDIA-IN-CHAT-SCOPE.md.
 */
export const CHAT_IMAGE_UPLOAD_ENDPOINT = `${AGENT_RUNTIME_BASE_URL}/app/chat/image`

/**
 * History read-back endpoint. GET returns the last ~50 turns of the owner's rolling
 * (cross-channel) conversation window so the chat screen can repopulate after the user
 * navigates away and back (messages otherwise live only in transient React state). See
 * pilot-agent-runtime APP-CHANNEL.md.
 */
export const HISTORY_ENDPOINT = `${AGENT_RUNTIME_BASE_URL}/app/history`

/**
 * Text-to-speech proxy endpoint. The runtime holds the ElevenLabs API key and
 * returns spoken audio (the branded "Bob" voice) for a reply. The app NEVER calls
 * ElevenLabs directly. See pilot-agent-runtime/src/tts.js.
 */
export const TTS_ENDPOINT = `${AGENT_RUNTIME_BASE_URL}/app/tts`

/**
 * Persona/avatar endpoints (owner-scoped from the bearer). The runtime owns the
 * persona list, the active selection, the available voices, and folds each
 * persona's `personality` into the system prompt server-side — the client only
 * reads/sets. See the persona contract in the runtime.
 */
export const PERSONAS_ENDPOINT = `${AGENT_RUNTIME_BASE_URL}/app/personas`
export const PERSONAS_UPDATE_ENDPOINT = `${AGENT_RUNTIME_BASE_URL}/app/personas/update`
export const PERSONAS_DELETE_ENDPOINT = `${AGENT_RUNTIME_BASE_URL}/app/personas/delete`
export const PERSONAS_ACTIVE_ENDPOINT = `${AGENT_RUNTIME_BASE_URL}/app/personas/active`
export const VOICES_ENDPOINT = `${AGENT_RUNTIME_BASE_URL}/app/voices`

/**
 * "For You" engagement endpoints (owner-scoped). `signals` ingests batched
 * per-item engagement events; `profile` returns the learned interest weights used
 * to rank the feed. See the M2 contract in the runtime.
 */
export const FEED_SIGNALS_ENDPOINT = `${AGENT_RUNTIME_BASE_URL}/app/feed/signals`
export const FEED_PROFILE_ENDPOINT = `${AGENT_RUNTIME_BASE_URL}/app/feed/profile`

/**
 * Context Engine (Phase 1, location-only) endpoints. Owner-scoped; the client
 * uploads only DERIVED conclusions (never raw coordinates). Sync is optional —
 * everything works locally if these aren't deployed yet.
 */
export const CONTEXT_EVENTS_ENDPOINT = `${AGENT_RUNTIME_BASE_URL}/app/context/events`
export const CONTEXT_RECENT_ENDPOINT = `${AGENT_RUNTIME_BASE_URL}/app/context/recent`
export const CONTEXT_DELETE_ENDPOINT = `${AGENT_RUNTIME_BASE_URL}/app/context/delete`

/**
 * ElevenLabs voice id for spoken replies. Configurable at build time via
 * EXPO_PUBLIC_BOB_VOICE_ID; the default is "Bob v3" (iM3OrSmZmAzd2Lk50nop), the
 * same voice the runtime defaults to. Sending it from the app is OPTIONAL — the
 * runtime has its own default (env ELEVENLABS_BOB_VOICE_ID); set this only to
 * override per-build. Never a secret (just an id).
 */
export const BOB_VOICE_ID =
  process.env.EXPO_PUBLIC_BOB_VOICE_ID ?? 'iM3OrSmZmAzd2Lk50nop'

/** Default agent handle to converse with when the caller doesn't specify one. */
export const DEFAULT_AGENT = 'ada'

// NOTE: the agent's UI display name is no longer a hardcoded constant. It is
// resolved client-side from the agent's atproto profile displayName (falling back
// to the routing handle) by `useAgentDisplayName` in #/screens/AgentChat. The
// chosen persona name (runtime identity.name) is not exposed by any /app/*
// response, so the profile is the cleanest client-side source.
