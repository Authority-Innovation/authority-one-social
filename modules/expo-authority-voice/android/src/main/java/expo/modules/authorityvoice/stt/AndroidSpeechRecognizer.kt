package expo.modules.authorityvoice.stt

import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.speech.RecognitionListener
import android.speech.RecognizerIntent
import android.speech.SpeechRecognizer

/**
 * Android STT backend built on `android.speech.SpeechRecognizer`. The Android recognizer
 * is single-shot by design (it fires exactly one `onResults`/`onError` per session and then
 * stops), so to match the iOS "stream until stop()" contract we run it CONTINUOUSLY: every
 * time a session ends we destroy the recognizer and start a fresh one, until `stop()` is
 * called. Volatile `onPartialResults` map to non-final `TranscriptUpdate`s and `onResults`
 * to final ones, giving the JS layer the same partial+final stream the iOS backend emits
 * (which is what powers barge-in and the silence endpointer).
 *
 * All SpeechRecognizer interaction happens on the main thread (a hard platform requirement).
 */
class AndroidSpeechRecognizer(private val context: Context) : SpeechRecognizing {
  private val main = Handler(Looper.getMainLooper())
  private var recognizer: SpeechRecognizer? = null

  private var listening = false
  private var localeId = "en-US"
  private var onUpdate: ((TranscriptUpdate) -> Unit)? = null
  private var onError: ((String) -> Unit)? = null

  /** Restart delay after a transient end (silence/busy) so we don't spin in a tight loop. */
  private val restartDelayMs = 250L

  override val backend: SpeechBackend
    get() {
      // Static availability checks are safe off the main thread (no recognizer instance yet).
      val onDevice =
        Build.VERSION.SDK_INT >= Build.VERSION_CODES.S &&
          SpeechRecognizer.isOnDeviceRecognitionAvailable(context)
      return if (onDevice || SpeechRecognizer.isRecognitionAvailable(context)) {
        SpeechBackend.ANDROID_SPEECH
      } else {
        SpeechBackend.UNAVAILABLE
      }
    }

  override fun start(
    localeId: String,
    onUpdate: (TranscriptUpdate) -> Unit,
    onError: (String) -> Unit,
  ) {
    main.post {
      this.localeId = localeId
      this.onUpdate = onUpdate
      this.onError = onError
      this.listening = true
      startSession()
    }
  }

  override fun stop() {
    main.post {
      listening = false
      main.removeCallbacksAndMessages(null)
      destroyRecognizer()
    }
  }

  // MARK: - internals (main thread only)

  private fun startSession() {
    if (!listening) return
    destroyRecognizer()

    val rec = createRecognizer()
    if (rec == null) {
      onError?.invoke("No on-device STT backend available.")
      listening = false
      return
    }
    rec.setRecognitionListener(listener)
    recognizer = rec
    try {
      rec.startListening(buildIntent())
    } catch (e: Exception) {
      // A failed start is transient (service not yet bound); retry while listening.
      scheduleRestart()
    }
  }

  private fun createRecognizer(): SpeechRecognizer? =
    try {
      if (
        Build.VERSION.SDK_INT >= Build.VERSION_CODES.S &&
        SpeechRecognizer.isOnDeviceRecognitionAvailable(context)
      ) {
        SpeechRecognizer.createOnDeviceSpeechRecognizer(context)
      } else if (SpeechRecognizer.isRecognitionAvailable(context)) {
        SpeechRecognizer.createSpeechRecognizer(context)
      } else {
        null
      }
    } catch (e: Exception) {
      null
    }

  private fun buildIntent(): Intent =
    Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply {
      putExtra(
        RecognizerIntent.EXTRA_LANGUAGE_MODEL,
        RecognizerIntent.LANGUAGE_MODEL_FREE_FORM,
      )
      putExtra(RecognizerIntent.EXTRA_LANGUAGE, localeId)
      putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true)
      // Prefer on-device recognition (privacy + offline); the on-device recognizer honours
      // this and the network one falls back gracefully.
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
        putExtra(RecognizerIntent.EXTRA_PREFER_OFFLINE, true)
      }
      putExtra(context.packageName + ".EXTRA_CALLING_PACKAGE", context.packageName)
    }

  private fun destroyRecognizer() {
    recognizer?.let {
      try {
        it.stopListening()
      } catch (_: Exception) {}
      try {
        it.cancel()
      } catch (_: Exception) {}
      try {
        it.destroy()
      } catch (_: Exception) {}
    }
    recognizer = null
  }

  private fun scheduleRestart() {
    if (!listening) return
    main.postDelayed({ startSession() }, restartDelayMs)
  }

  private fun firstResult(results: Bundle?): String? {
    val list = results?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)
    return list?.firstOrNull()?.takeIf { it.isNotEmpty() }
  }

  private val listener =
    object : RecognitionListener {
      override fun onReadyForSpeech(params: Bundle?) {}

      override fun onBeginningOfSpeech() {}

      override fun onRmsChanged(rmsdB: Float) {}

      override fun onBufferReceived(buffer: ByteArray?) {}

      override fun onEndOfSpeech() {
        // The session will end with onResults or onError next; restart is handled there.
      }

      override fun onPartialResults(partialResults: Bundle?) {
        firstResult(partialResults)?.let { onUpdate?.invoke(TranscriptUpdate(it, isFinal = false)) }
      }

      override fun onResults(results: Bundle?) {
        firstResult(results)?.let { onUpdate?.invoke(TranscriptUpdate(it, isFinal = true)) }
        // Continuous mode: immediately begin the next session so the mic stays open.
        scheduleRestart()
      }

      override fun onError(error: Int) {
        when (error) {
          // Transient / expected in continuous mode (silence, rapid restart, busy service):
          // keep listening and just start a fresh session.
          SpeechRecognizer.ERROR_NO_MATCH,
          SpeechRecognizer.ERROR_SPEECH_TIMEOUT,
          SpeechRecognizer.ERROR_CLIENT,
          SpeechRecognizer.ERROR_RECOGNIZER_BUSY,
          -> scheduleRestart()

          // Genuine, non-recoverable failures: surface to JS (which stops the mic).
          SpeechRecognizer.ERROR_INSUFFICIENT_PERMISSIONS ->
            reportFatal("Microphone permission not granted.")
          SpeechRecognizer.ERROR_AUDIO ->
            reportFatal("Audio recording error.")
          else -> {
            // Network/server/other: in continuous mode, try to recover rather than
            // killing the session, but back off with the same restart delay.
            scheduleRestart()
          }
        }
      }

      override fun onEvent(eventType: Int, params: Bundle?) {}
    }

  private fun reportFatal(message: String) {
    listening = false
    destroyRecognizer()
    onError?.invoke(message)
  }
}
