package expo.modules.authorityvoice.stt

/**
 * Which on-device STT backend is in use. Mirrors the iOS `SpeechBackend` and the JS
 * `SpeechBackend` union; the raw string is what JS reads in `getCapabilities().backend`.
 */
enum class SpeechBackend(val value: String) {
  /** android.speech.SpeechRecognizer (on-device where available). Android. */
  ANDROID_SPEECH("androidSpeechRecognizer"),

  /** No on-device backend available on this device/OS. */
  UNAVAILABLE("unavailable"),
}

/** A single transcription update emitted by a backend. */
data class TranscriptUpdate(
  val text: String,
  /** `true` once the backend has committed this segment (no longer volatile). */
  val isFinal: Boolean,
)

/**
 * Common surface every STT backend implements so call sites never branch on how the
 * platform recognizer works. Backends stream `TranscriptUpdate`s; partial (volatile)
 * results are required for barge-in. This is the Android analogue of the iOS
 * `SpeechRecognizing` protocol.
 */
interface SpeechRecognizing {
  val backend: SpeechBackend

  /**
   * Begin streaming transcription for `localeId` (BCP-47, e.g. "en-US").
   * `onUpdate` fires for every volatile/final segment; `onError` fires on a genuine,
   * non-transient failure (normal end-of-utterance silence does NOT surface as an error).
   */
  fun start(
    localeId: String,
    onUpdate: (TranscriptUpdate) -> Unit,
    onError: (String) -> Unit,
  )

  /** Stop streaming and finalize. Safe to call when not running. */
  fun stop()
}
