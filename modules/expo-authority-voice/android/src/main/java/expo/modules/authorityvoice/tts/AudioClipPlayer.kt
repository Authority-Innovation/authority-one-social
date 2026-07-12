package expo.modules.authorityvoice.tts

import android.media.AudioAttributes
import android.media.MediaDataSource
import android.media.MediaPlayer
import android.os.Handler
import android.os.Looper
import android.util.Base64

/**
 * Plays already-synthesized audio clips (the ElevenLabs "Bob" voice fetched via the runtime
 * `/app/tts` proxy and handed down from JS as base64 MP3). It is NOT a `SpeechSynthesizing`
 * backend - it doesn't synthesize, it plays bytes - but it emits the SAME lifecycle callbacks
 * (`SpeechSynthesizingDelegate`) so the JS layer treats remote (ElevenLabs) and on-device
 * (TextToSpeech) voices uniformly, including barge-in via `stop()`.
 *
 * The ElevenLabs API key never reaches the device: the bytes are produced server-side and
 * only the resulting audio is decoded + played here. Android analogue of the iOS
 * `AudioClipPlayer` (AVAudioPlayer).
 */
class AudioClipPlayer {
  var delegate: SpeechSynthesizingDelegate? = null

  private val main = Handler(Looper.getMainLooper())
  private var player: MediaPlayer? = null
  private var currentUtteranceId: String? = null

  /**
   * Decode a base64 audio clip and play it. Emits onStart once playback begins; onError if
   * the clip can't be decoded/played (the JS layer then falls back to the on-device engine).
   */
  fun play(
    base64: String,
    utteranceId: String,
  ) {
    main.post {
      // A new clip supersedes any in-flight one (treat the old as canceled).
      stopInternal(cancel = true)

      val data =
        try {
          Base64.decode(base64, Base64.DEFAULT)
        } catch (e: IllegalArgumentException) {
          null
        }
      if (data == null || data.isEmpty()) {
        delegate?.synthDidError(utteranceId, "invalid audio clip")
        return@post
      }

      val mp = MediaPlayer()
      try {
        mp.setAudioAttributes(
          // USAGE_MEDIA + CONTENT_TYPE_SPEECH: supported on the whole minSdk-24 range
          // (USAGE_ASSISTANT is API 26+) and routes a spoken reply like normal playback.
          AudioAttributes.Builder()
            .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
            .setUsage(AudioAttributes.USAGE_MEDIA)
            .build(),
        )
        mp.setDataSource(ByteArrayMediaDataSource(data))
        mp.setOnPreparedListener { p ->
          // Guard against a stop() that raced in before prepare completed.
          if (player !== p) {
            p.release()
            return@setOnPreparedListener
          }
          p.start()
          delegate?.synthDidStart(utteranceId)
        }
        mp.setOnCompletionListener { p ->
          val id = currentUtteranceId
          if (player === p) {
            player = null
            currentUtteranceId = null
          }
          p.release()
          id?.let { delegate?.synthDidFinish(it) }
        }
        mp.setOnErrorListener { p, _, _ ->
          val id = currentUtteranceId
          if (player === p) {
            player = null
            currentUtteranceId = null
          }
          runCatching { p.release() }
          id?.let { delegate?.synthDidError(it, "audio playback error") }
          true
        }
        currentUtteranceId = utteranceId
        player = mp
        mp.prepareAsync()
      } catch (e: Exception) {
        runCatching { mp.release() }
        if (player === mp) {
          player = null
          currentUtteranceId = null
        }
        delegate?.synthDidError(utteranceId, e.message ?: "audio player failed to start")
      }
    }
  }

  /** Stop immediately (barge-in). Safe to call when idle. Reports a cancel for the clip
   * that was playing so the JS state machine settles. */
  fun stop() {
    main.post { stopInternal(cancel = true) }
  }

  fun pause() {
    main.post {
      player?.let { if (it.isPlaying) runCatching { it.pause() } }
    }
  }

  fun resume() {
    main.post {
      player?.let { if (!it.isPlaying) runCatching { it.start() } }
    }
  }

  val isPlaying: Boolean
    get() = player?.isPlaying ?: false

  // Main thread only.
  private fun stopInternal(cancel: Boolean) {
    val p = player ?: return
    val id = currentUtteranceId
    player = null
    currentUtteranceId = null
    runCatching { if (p.isPlaying) p.stop() }
    runCatching { p.release() }
    if (cancel && id != null) {
      delegate?.synthDidCancel(id)
    }
  }

  /**
   * In-memory MediaPlayer source so we never touch disk for a short spoken clip.
   * `MediaDataSource` requires API 23; the app floor is 24.
   */
  private class ByteArrayMediaDataSource(private val data: ByteArray) : MediaDataSource() {
    override fun readAt(
      position: Long,
      buffer: ByteArray,
      offset: Int,
      size: Int,
    ): Int {
      if (position >= data.size) return -1
      val end = minOf(data.size.toLong(), position + size)
      val count = (end - position).toInt()
      System.arraycopy(data, position.toInt(), buffer, offset, count)
      return count
    }

    override fun getSize(): Long = data.size.toLong()

    override fun close() {}
  }
}
