package expo.modules.authorityvoice.tts

import android.content.Context
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * JS-facing TTS module (Android). Two voices behind one event stream:
 *   - `speak`     -> on-device TextToSpeech (the `SpeechSynthesizing` backend).
 *   - `playClip`  -> remote ElevenLabs "Bob" audio (base64 from the runtime proxy),
 *                    played by `AudioClipPlayer` (MediaPlayer).
 *
 * Both emit the SAME lifecycle events and are silenced by the SAME `stop()` (barge-in), so
 * JS treats premium and on-device voices identically. This is the Android counterpart of the
 * iOS `AuthorityTtsModule`; the JS contract (`src/TTS/index.native.ts`) is identical:
 *
 *   getVoices() -> [{ id, name, language }]
 *   speak(text, utteranceId, options)    -> utteranceId
 *   playClip(base64, utteranceId, options) -> utteranceId
 *   stop() / pause() / resume()
 *
 * To swap the on-device engine for a streaming-neural/cloud voice later, change only the
 * `makeBackend()` factory.
 */
class AuthorityTtsModule : Module(), SpeechSynthesizingDelegate {
  // Built lazily on first use (first speak/getVoices/playClip), never at module-create time,
  // so we don't bind the TextToSpeech service before the app is really using voice.
  private var backendField: SpeechSynthesizing? = null
  private var clipPlayerField: AudioClipPlayer? = null

  override fun definition() =
    ModuleDefinition {
      Name("AuthorityTtsModule")

      Events("onSpeechStart", "onSpeechDone", "onSpeechCanceled", "onSpeechError")

      Function("getVoices") {
        backend()?.availableVoices() ?: emptyList<Map<String, String>>()
      }

      // Speak text. Returns the utteranceId so JS can correlate lifecycle events.
      Function("speak") { text: String, utteranceId: String, options: Map<String, Any?>? ->
        backend()?.speak(text, utteranceId, parseOptions(options))
        utteranceId
      }

      // Play a base64-encoded audio clip (ElevenLabs "Bob" voice from the runtime proxy).
      // Emits the SAME lifecycle events as `speak`. Returns the utteranceId.
      Function("playClip") { base64: String, utteranceId: String, _options: Map<String, Any?>? ->
        clipPlayer().play(base64, utteranceId)
        utteranceId
      }

      // Barge-in: stop immediately. Cuts BOTH the on-device engine AND any remote clip.
      Function("stop") {
        backendField?.stop()
        clipPlayerField?.stop()
      }

      Function("pause") {
        backendField?.pause()
        clipPlayerField?.pause()
      }

      Function("resume") {
        backendField?.resume()
        clipPlayerField?.resume()
      }

      OnDestroy {
        clipPlayerField?.stop()
        backendField?.shutdown()
        clipPlayerField = null
        backendField = null
      }
    }

  // MARK: - lazy backend + clip player

  private fun backend(): SpeechSynthesizing? {
    if (backendField == null) {
      val ctx = appContext.reactContext ?: return null
      backendField = makeBackend(ctx.applicationContext).also { it.delegate = this }
    }
    return backendField
  }

  private fun clipPlayer(): AudioClipPlayer {
    val existing = clipPlayerField
    if (existing != null) return existing
    return AudioClipPlayer().also {
      it.delegate = this
      clipPlayerField = it
    }
  }

  // The swap point: v1 uses the built-in TextToSpeech engine.
  private fun makeBackend(context: Context): SpeechSynthesizing = AndroidTtsEngine(context)

  private fun parseOptions(options: Map<String, Any?>?): SynthesisOptions =
    SynthesisOptions(
      localeId = options?.get("localeId") as? String,
      voiceId = options?.get("voiceId") as? String,
      rate = (options?.get("rate") as? Number)?.toFloat(),
      pitch = (options?.get("pitch") as? Number)?.toFloat(),
    )

  // MARK: - SpeechSynthesizingDelegate -> JS events

  override fun synthDidStart(utteranceId: String) {
    sendEvent("onSpeechStart", mapOf("utteranceId" to utteranceId))
  }

  override fun synthDidFinish(utteranceId: String) {
    sendEvent("onSpeechDone", mapOf("utteranceId" to utteranceId))
  }

  override fun synthDidCancel(utteranceId: String) {
    sendEvent("onSpeechCanceled", mapOf("utteranceId" to utteranceId))
  }

  override fun synthDidError(
    utteranceId: String,
    message: String,
  ) {
    sendEvent("onSpeechError", mapOf("utteranceId" to utteranceId, "message" to message))
  }
}
