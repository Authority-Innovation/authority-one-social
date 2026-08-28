package expo.modules.authorityvoice.tts

/** Options for a single utterance. Backends map these onto their own API. */
data class SynthesisOptions(
  val localeId: String?, // BCP-47, e.g. "en-US". null = system default.
  val voiceId: String?, // backend-specific voice identifier. null = default voice.
  val rate: Float?, // 0.0..1.0 normalized; backend scales to its own range.
  val pitch: Float?, // 0.5..2.0. null = 1.0.
)

/** Callbacks a backend emits over the life of an utterance. Mirrors the iOS protocol. */
interface SpeechSynthesizingDelegate {
  fun synthDidStart(utteranceId: String)

  fun synthDidFinish(utteranceId: String)

  fun synthDidCancel(utteranceId: String)

  fun synthDidError(
    utteranceId: String,
    message: String,
  )
}

/**
 * Common surface every TTS backend implements. This is the seam that lets a streaming
 * neural engine or a cloud premium voice drop in later WITHOUT touching JS call sites or
 * the Expo module - only the factory in `AuthorityTtsModule` changes. Android analogue of
 * the iOS `SpeechSynthesizing` protocol.
 */
interface SpeechSynthesizing {
  var delegate: SpeechSynthesizingDelegate?

  /** List available voices as [id, name, language] maps for UI pickers. */
  fun availableVoices(): List<Map<String, String>>

  /** Speak `text`. `utteranceId` is echoed back in delegate callbacks so JS can correlate. */
  fun speak(
    text: String,
    utteranceId: String,
    options: SynthesisOptions,
  )

  /** Stop immediately (barge-in). Safe to call when idle. */
  fun stop()

  /** Pause/resume (optional; may be a no-op where the backend can't pause). */
  fun pause()

  fun resume()

  /** Release native resources. */
  fun shutdown()
}
