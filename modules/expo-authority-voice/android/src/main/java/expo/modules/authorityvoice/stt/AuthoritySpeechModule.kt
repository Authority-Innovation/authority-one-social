package expo.modules.authorityvoice.stt

import android.Manifest
import android.os.Build
import expo.modules.interfaces.permissions.PermissionsStatus
import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * JS-facing STT module (Android). Streams live transcripts from
 * `android.speech.SpeechRecognizer` to JS as events. This is the Android counterpart of
 * the iOS `AuthoritySpeechModule` (Apple SpeechAnalyzer) and honours the exact same JS
 * contract from `src/STT/index.native.ts`:
 *
 *   getCapabilities()  -> { backend, available, supportsPartialResults, osVersion }
 *   requestPermissions() (async) -> Boolean (true only if RECORD_AUDIO granted)
 *   start(localeId)    -> streams onPartialTranscript / onFinalTranscript / onError
 *   stop()
 *
 * Partial (volatile) results power barge-in in the shared `useVoice` hook.
 */
class AuthoritySpeechModule : Module() {
  private var recognizer: AndroidSpeechRecognizer? = null

  override fun definition() =
    ModuleDefinition {
      Name("AuthoritySpeechModule")

      Events(
        "onPartialTranscript", // volatile, may change - drives barge-in
        "onFinalTranscript", // committed segment
        "onError",
      )

      // Report which backend would be used, without starting capture. JS uses `available`
      // to decide whether to show the mic affordance.
      Function("getCapabilities") {
        val backend = ensureRecognizer()?.backend ?: SpeechBackend.UNAVAILABLE
        mapOf(
          "backend" to backend.value,
          "available" to (backend != SpeechBackend.UNAVAILABLE),
          "supportsPartialResults" to (backend != SpeechBackend.UNAVAILABLE),
          "osVersion" to Build.VERSION.RELEASE,
        )
      }

      // Request microphone permission. Resolves true only if RECORD_AUDIO is granted
      // (the iOS side resolves true only if BOTH mic + speech recognition are granted;
      // Android has no separate speech-recognition permission, so RECORD_AUDIO is it).
      AsyncFunction("requestPermissions") { promise: Promise ->
        val manager = appContext.permissions
        if (manager == null) {
          promise.resolve(false)
          return@AsyncFunction
        }
        manager.askForPermissions(
          { result ->
            val granted =
              result[Manifest.permission.RECORD_AUDIO]?.status == PermissionsStatus.GRANTED
            promise.resolve(granted)
          },
          Manifest.permission.RECORD_AUDIO,
        )
      }

      // Begin streaming transcription. `localeId` is BCP-47, e.g. "en-US".
      Function("start") { localeId: String ->
        val rec = ensureRecognizer()
        if (rec == null || rec.backend == SpeechBackend.UNAVAILABLE) {
          sendEvent("onError", mapOf("message" to "No on-device STT backend available."))
          return@Function
        }
        rec.start(
          localeId = localeId,
          onUpdate = { update ->
            val name = if (update.isFinal) "onFinalTranscript" else "onPartialTranscript"
            sendEvent(name, mapOf("text" to update.text))
          },
          onError = { message ->
            sendEvent("onError", mapOf("message" to message))
          },
        )
      }

      Function("stop") {
        recognizer?.stop()
      }

      OnDestroy {
        recognizer?.stop()
        recognizer = null
      }
    }

  private fun ensureRecognizer(): AndroidSpeechRecognizer? {
    if (recognizer == null) {
      val ctx = appContext.reactContext ?: return null
      recognizer = AndroidSpeechRecognizer(ctx.applicationContext)
    }
    return recognizer
  }
}
