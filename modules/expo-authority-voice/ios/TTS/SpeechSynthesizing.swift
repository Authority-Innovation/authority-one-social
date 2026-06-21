import Foundation

/// Options for a single utterance. Backends map these onto their own API.
struct SynthesisOptions {
  let localeId: String?     // BCP-47, e.g. "en-US". nil = system default.
  let voiceId: String?      // backend-specific voice identifier. nil = default voice.
  let rate: Float?          // 0.0...1.0 normalized; backend scales to its own range.
  let pitch: Float?         // 0.5...2.0 (AVSpeechSynthesizer range). nil = 1.0.
}

/// Callbacks a backend emits over the life of an utterance.
protocol SpeechSynthesizingDelegate: AnyObject {
  func synthDidStart(utteranceId: String)
  func synthDidFinish(utteranceId: String)
  func synthDidCancel(utteranceId: String)
  func synthDidError(utteranceId: String, message: String)
}

/// Common surface every TTS backend implements. This is the seam that lets a streaming
/// neural engine (Picovoice Orca / Argmax TTSKit) or a cloud premium voice (ElevenLabs)
/// drop in later WITHOUT touching JS call sites or the Expo module — only the factory
/// in `AuthorityTtsModule` changes.
protocol SpeechSynthesizing: AnyObject {
  var delegate: SpeechSynthesizingDelegate? { get set }

  /// List available voices as [id, name, language] for UI pickers.
  func availableVoices() -> [[String: String]]

  /// Speak `text`. `utteranceId` is echoed back in delegate callbacks so JS can correlate.
  func speak(text: String, utteranceId: String, options: SynthesisOptions)

  /// Stop immediately (barge-in). Safe to call when idle.
  func stop()

  /// Pause/resume (optional; AVSpeechSynthesizer supports it natively).
  func pause()
  func resume()
}
