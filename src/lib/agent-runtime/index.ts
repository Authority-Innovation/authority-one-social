export {postApprovalDecision} from './approvals'
export {
  getSupabaseAccessToken,
  setSupabaseTokenProvider,
  type TokenProvider,
} from './authToken'
export {AgentAuthError, streamChat, type StreamHandlers} from './chatClient'
export {
  AGENT_RUNTIME_BASE_URL,
  BOB_VOICE_ID,
  CHAT_ENDPOINT,
  DEFAULT_AGENT,
  HISTORY_ENDPOINT,
  TTS_ENDPOINT,
} from './config'
export {
  deleteContextEvent,
  fetchRecentContext,
  normalizeContextEvents,
  postContextEvents,
} from './contextClient'
export {
  type FeedProfileWeights,
  type FeedSignalEvent,
  fetchFeedProfile,
  normalizeFeedProfile,
  postFeedSignals,
} from './feedClient'
export {fetchHistory, type HistoryResult} from './historyClient'
export {
  createPersona,
  deletePersona,
  fetchPersonas,
  fetchVoices,
  normalizePersonasResponse,
  type Persona,
  type PersonasResult,
  type PersonasState,
  type PersonaVoice,
  type PersonaWriteResult,
  pickActiveVoiceId,
  pickAgentHeaderName,
  setActivePersona,
  updatePersona,
} from './personasClient'
export {bytesToBase64, fetchBobAudioBase64} from './tts'
export * from './types'
