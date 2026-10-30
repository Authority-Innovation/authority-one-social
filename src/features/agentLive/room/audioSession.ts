/**
 * The iOS AVAudioSession policy for a live session, handed to LiveKit's
 * `setupIOSAudioManagement` (applied natively as the audio engine starts and
 * stops). Kept free of SDK imports so the build gate's "only the binding
 * imports LiveKit" rule holds and the config test can read it.
 *
 * Background-safe: the category is playAndRecord in every engine state. The
 * SDK default drops to `playback` while only the agent is talking (mic off);
 * flipping back to playAndRecord to unmute is a category change, and iOS will
 * not start recording from the background after one. Staying in playAndRecord
 * (with 'audio' in UIBackgroundModes, plugins/agentLive) keeps the session
 * alive and the mic usable while the phone is locked.
 *
 * No `mixWithOthers`: a call-style session should be the primary audio and
 * receive interruptions (a phone call, Siri) rather than mix with other apps.
 */
type AppleAudioConfig = {
  audioCategory: 'playAndRecord'
  audioCategoryOptions: Array<
    | 'allowBluetooth'
    | 'allowBluetoothA2DP'
    | 'allowAirPlay'
    | 'defaultToSpeaker'
  >
  audioMode: 'videoChat' | 'default'
}

const OPTIONS: AppleAudioConfig['audioCategoryOptions'] = [
  'allowBluetooth',
  'allowBluetoothA2DP',
  'allowAirPlay',
  // The stage is full screen, so voice comes out of the speaker, not the
  // earpiece.
  'defaultToSpeaker',
]

export const LIVE_IOS_AUDIO_POLICY: {
  recording: AppleAudioConfig
  recordingWithoutVoiceProcessing: AppleAudioConfig
  playout: AppleAudioConfig
  deactivateOnStop: boolean
} = {
  // videoChat: the speaker-routed voice mode with Apple voice processing
  // (echo cancellation), as the SDK's own speaker preset uses.
  recording: {
    audioCategory: 'playAndRecord',
    audioCategoryOptions: OPTIONS,
    audioMode: 'videoChat',
  },
  // Without voice processing the chat modes play remote audio quieter; the SDK
  // uses `default` mode here for the same reason.
  recordingWithoutVoiceProcessing: {
    audioCategory: 'playAndRecord',
    audioCategoryOptions: OPTIONS,
    audioMode: 'default',
  },
  // Mic off, agent talking: still playAndRecord (see above).
  playout: {
    audioCategory: 'playAndRecord',
    audioCategoryOptions: OPTIONS,
    audioMode: 'default',
  },
  deactivateOnStop: true,
}
