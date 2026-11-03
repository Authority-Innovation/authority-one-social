/**
 * Agent Live is dark unless the build sets EXPO_PUBLIC_AGENT_LIVE_ENABLED to
 * exactly `true`. Only the `development-live` EAS profile does. The same flag
 * keeps the LiveKit SDK out of the native build and the JS bundle (see
 * plugins/agentLive).
 */
export const AGENT_LIVE_ENABLED: boolean =
  process.env.EXPO_PUBLIC_AGENT_LIVE_ENABLED === 'true'
