package expo.modules.authorityvoice.tts

import android.content.Context
import android.speech.tts.TextToSpeech
import android.speech.tts.UtteranceProgressListener
import android.speech.tts.Voice
import java.util.Locale

/**
 * v1 Android TTS backend: the platform `android.speech.TextToSpeech`. On-device, free, no
 * model download. Implements `SpeechSynthesizing` so it can be swapped for a neural/cloud
 * backend later without changing any call site (Android analogue of `AVSpeechSynthEngine`).
 *
 * TextToSpeech binds its service asynchronously, so a `speak()` that arrives before the
 * engine is ready is queued and flushed on init. Utterance lifecycle is bridged to the
 * shared `SpeechSynthesizingDelegate` (onStart/Done/Cancel/Error) keyed by utteranceId,
 * so JS treats on-device and remote (clip) voices uniformly.
 */
class AndroidTtsEngine(context: Context) : SpeechSynthesizing {
  override var delegate: SpeechSynthesizingDelegate? = null

  @Volatile private var ready = false
  private val pending = ArrayList<Runnable>()
  private val lock = Any()

  private val tts: TextToSpeech =
    TextToSpeech(context.applicationContext) { status ->
      if (status == TextToSpeech.SUCCESS) {
        ready = true
        val queued: List<Runnable>
        synchronized(lock) {
          queued = ArrayList(pending)
          pending.clear()
        }
        queued.forEach { it.run() }
      } else {
        // Engine failed to initialize: drain any queued utterances as errors so the JS
        // clip->on-device fallback / state machine settles instead of hanging.
        val queued: List<Runnable>
        synchronized(lock) {
          queued = ArrayList(pending)
          pending.clear()
        }
        queued.forEach { it.run() } // runnables self-check `ready` and report the error
      }
    }

  init {
    tts.setOnUtteranceProgressListener(
      object : UtteranceProgressListener() {
        override fun onStart(utteranceId: String?) {
          utteranceId?.let { delegate?.synthDidStart(it) }
        }

        override fun onDone(utteranceId: String?) {
          utteranceId?.let { delegate?.synthDidFinish(it) }
        }

        // Fires when an utterance is flushed by QUEUE_FLUSH or by stop() (barge-in) -
        // report it as a cancel so the JS state machine settles, matching iOS didCancel.
        override fun onStop(
          utteranceId: String?,
          interrupted: Boolean,
        ) {
          utteranceId?.let { delegate?.synthDidCancel(it) }
        }

        @Deprecated("Deprecated in Java", ReplaceWith("onError(utteranceId, -1)"))
        override fun onError(utteranceId: String?) {
          utteranceId?.let { delegate?.synthDidError(it, "TTS synthesis error") }
        }

        override fun onError(
          utteranceId: String?,
          errorCode: Int,
        ) {
          utteranceId?.let { delegate?.synthDidError(it, "TTS synthesis error ($errorCode)") }
        }
      },
    )
  }

  override fun availableVoices(): List<Map<String, String>> {
    if (!ready) return emptyList()
    val voices: Set<Voice> =
      try {
        tts.voices ?: emptySet()
      } catch (e: Exception) {
        emptySet()
      }
    return voices.map { v ->
      mapOf(
        "id" to v.name,
        "name" to v.name,
        "language" to v.locale.toLanguageTag(),
      )
    }
  }

  override fun speak(
    text: String,
    utteranceId: String,
    options: SynthesisOptions,
  ) {
    val task = Runnable {
      if (!ready) {
        delegate?.synthDidError(utteranceId, "TTS engine unavailable")
        return@Runnable
      }
      applyOptions(options)
      // QUEUE_FLUSH supersedes any in-flight utterance (its onStop -> cancel), matching the
      // iOS backend where a new speak replaces the current one.
      val result = tts.speak(text, TextToSpeech.QUEUE_FLUSH, null, utteranceId)
      if (result != TextToSpeech.SUCCESS) {
        delegate?.synthDidError(utteranceId, "TTS failed to enqueue utterance")
      }
    }
    if (ready) {
      task.run()
    } else {
      synchronized(lock) { pending.add(task) }
    }
  }

  private fun applyOptions(options: SynthesisOptions) {
    // Language / voice.
    val voiceSet = options.voiceId?.let { id -> applyVoice(id) } ?: false
    if (!voiceSet) {
      val locale =
        options.localeId?.let { runCatching { Locale.forLanguageTag(it) }.getOrNull() }
          ?: Locale.getDefault()
      // LANG_MISSING_DATA / LANG_NOT_SUPPORTED just leave the engine on its default voice.
      runCatching { tts.language = locale }
    }

    // Rate: JS sends a normalized 0..1; map onto Android's 0.5..2.0 (1.0 == normal).
    // Absent -> engine default (1.0).
    options.rate?.let { r ->
      val clamped = r.coerceIn(0f, 1f)
      tts.setSpeechRate(0.5f + (2.0f - 0.5f) * clamped)
    } ?: tts.setSpeechRate(1.0f)

    // Pitch: 0.5..2.0 (same range as iOS pitchMultiplier). Absent -> 1.0.
    options.pitch?.let { p -> tts.setPitch(p.coerceIn(0.5f, 2.0f)) } ?: tts.setPitch(1.0f)
  }

  /** Try to select a voice by its `Voice.name` (the id we hand JS in availableVoices()). */
  private fun applyVoice(voiceId: String): Boolean {
    val match =
      try {
        tts.voices?.firstOrNull { it.name == voiceId }
      } catch (e: Exception) {
        null
      } ?: return false
    return tts.setVoice(match) == TextToSpeech.SUCCESS
  }

  override fun stop() {
    // .stop() flushes the queue; the current utterance surfaces via onStop -> cancel.
    runCatching { tts.stop() }
  }

  // TextToSpeech has no pause/resume. These are no-ops so the shared interface stays
  // uniform; the clip player (AudioClipPlayer) is what actually supports pause/resume.
  override fun pause() {}

  override fun resume() {}

  override fun shutdown() {
    runCatching { tts.stop() }
    runCatching { tts.shutdown() }
  }
}
