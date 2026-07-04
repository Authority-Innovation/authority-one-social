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
export const threadMembersUrl = (id: string) =>
  `${THREADS_ENDPOINT}/${encodeURIComponent(id)}/members`
// Creator-only group admin (a parallel runtime session implements these routes).
export const threadRenameUrl = (id: string) =>
  `${THREADS_ENDPOINT}/${encodeURIComponent(id)}/rename`
export const threadRemoveMemberUrl = (id: string) =>
  `${THREADS_ENDPOINT}/${encodeURIComponent(id)}/members/remove`
export const threadDeleteUrl = (id: string) =>
  `${THREADS_ENDPOINT}/${encodeURIComponent(id)}/delete`

/**
 * Owner's selectable AGENTS endpoint (owner-scoped). GET /app/agents returns the agent
 * identities this owner may CHOOSE to add to a group chat — resolved server-side from the
 * owner's DID via the owner→agents-set index. `{agents:[{handle, displayName, avatar}]}`.
 * Read-only; degrades to an empty list when unreachable / not deployed.
 */
export const AGENTS_ENDPOINT = `${AGENT_RUNTIME_BASE_URL}/app/agents`

/**
 * Pause/unpause one of the owner's agents. POST {agent?, paused:boolean} ->
 * {ok, agent, paused}. `agent` is the FULL handle from a GET /app/agents row;
 * omitted = the owner's token-mapped agent.
 */
export const AGENTS_PAUSE_ENDPOINT = `${AGENT_RUNTIME_BASE_URL}/app/agents/pause`

/**
 * Agent PDS profile editor. POST {agent, displayName?, description?, avatarUrl?,
 * bannerUrl?} — merge semantics per field: string=set, null/""=clear, absent=keep;
 * at least one field required. Image urls must be HOSTED https urls (from
 * /app/media/upload or /app/media/generate). Nothing writes to the PDS until this
 * call.
 */
export const AGENTS_PROFILE_ENDPOINT = `${AGENT_RUNTIME_BASE_URL}/app/agents/profile`

/**
 * Chat image upload endpoint (owner-scoped). The app POSTs the RAW image bytes with an
 * image `Content-Type` header; the runtime hosts them in R2 (the same `putRawImage` path
 * the inbound SMS/MMS media uses) and returns the public URL, which the app then sends
 * with the chat turn so the existing vision pipeline processes it. The runtime route is
 * `/app/media/upload` and it reads `request.arrayBuffer()` + validates the Content-Type
 * (it does NOT parse multipart/form-data). See MEDIA-IN-CHAT-SCOPE.md.
 */
export const CHAT_IMAGE_UPLOAD_ENDPOINT = `${AGENT_RUNTIME_BASE_URL}/app/media/upload`

/**
 * Server-side AI image generation. POST {prompt, references?:[url]} -> {url,
 * contentType} — the runtime generates and HOSTS the image, returning a public url
 * usable anywhere a hosted image url is accepted (e.g. the agent profile editor).
 * 400 missing prompt; 503 when no provider is configured.
 */
export const MEDIA_GENERATE_ENDPOINT = `${AGENT_RUNTIME_BASE_URL}/app/media/generate`

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
/** Full persona detail (identity + knowledge base + fiction). The list endpoint is now
 *  light (id/name/voiceId only), so the editor loads detail from here. */
export const PERSONAS_GET_ENDPOINT = `${AGENT_RUNTIME_BASE_URL}/app/personas/get`
export const PERSONAS_UPDATE_ENDPOINT = `${AGENT_RUNTIME_BASE_URL}/app/personas/update`
export const PERSONAS_DELETE_ENDPOINT = `${AGENT_RUNTIME_BASE_URL}/app/personas/delete`
export const PERSONAS_ACTIVE_ENDPOINT = `${AGENT_RUNTIME_BASE_URL}/app/personas/active`
export const VOICES_ENDPOINT = `${AGENT_RUNTIME_BASE_URL}/app/voices`
/** DELETE /app/voices/:id — remove a custom voice from the library. */
export const voiceDeleteUrl = (id: string) =>
  `${VOICES_ENDPOINT}/${encodeURIComponent(id)}`

/**
 * Social-autonomy config endpoint (owner-scoped, agent-scoped like the persona
 * routes). GET ?agent= returns the agent's resolved config.autoSocial + today's
 * spend; POST {agent?, ...patch} applies a targeted per-section merge and echoes
 * the resolved config. Everything the config produces is APPROVE-EACH in the
 * runtime — this endpoint only shapes what gets drafted.
 */
export const SOCIAL_AUTONOMY_ENDPOINT = `${AGENT_RUNTIME_BASE_URL}/app/social-autonomy`

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
 * POI proxy (owner-scoped). The runtime resolves the nearest NAMED place for a coordinate
 * (self-hosted OSM/Overpass behind the proxy, per CONTEXT-COMPANION-GUARDIAN-SCOPE.md), so
 * the app can label outdoor stops (trailheads/falls/parks) the bare reverse-geocoder can't.
 * GET /app/poi/nearby?lat=&lon=&radius= -> {places:[{name,category,distanceM,...}], resolvedAt}.
 */
export const POI_NEARBY_ENDPOINT = `${AGENT_RUNTIME_BASE_URL}/app/poi/nearby`
export const poiNearbyUrl = (lat: number, lon: number, radiusM: number) =>
  `${POI_NEARBY_ENDPOINT}?lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(
    lon,
  )}&radius=${encodeURIComponent(radiusM)}`

/**
 * Scene-tag vision proxy (owner-scoped). The "small vision call" for Photo Context: the
 * app POSTs RAW image bytes (same shape as /app/media/upload) for an EXPLICITLY-captured
 * photo and gets back coarse scene tags (forest/trail/rocks/indoor…). The passive EXIF
 * photo sampler never sends bytes — only this explicit path does.
 * POST /app/vision/scene (image bytes) -> {tags:[string,...]}.
 */
export const SCENE_TAGS_ENDPOINT = `${AGENT_RUNTIME_BASE_URL}/app/vision/scene`

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
