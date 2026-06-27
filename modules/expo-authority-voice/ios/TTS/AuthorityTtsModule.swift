import ExpoModulesCore

/// JS-facing TTS module. Two voices behind one event stream:
///   • `speak`     → on-device AVSpeechSynthesizer (the `SpeechSynthesizing` backend).
///   • `playClip`  → remote ElevenLabs "Bob" audio (base64 from the runtime proxy),
///                   played by `AudioClipPlayer`.
/// Both emit the SAME lifecycle events and are silenced by the SAME `stop()` (barge-in),
/// so JS treats premium and on-device voices identically. To swap the on-device engine
/// for Orca/streaming-neural later, change only the `makeBackend()` factory.
public class AuthorityTtsModule: Module, SpeechSynthesizingDelegate {
  // Built lazily on FIRST USE (first speak/getVoices/etc.), never at module-create time.
  // Constructing the backend eagerly (e.g. from OnCreate) instantiates AVSpeechSynthesizer
  // during native module registration — before the JS thread exists — which crashes with
  // "This method must not be called before the JS thread is created." The delegate is wired
  // here, inside the lazy initializer, so it's set exactly when the backend is first created.
  private lazy var backend: SpeechSynthesizing = {
    let engine = Self.makeBackend()
    engine.delegate = self
    return engine
  }()

  // Plays remote (ElevenLabs "Bob") audio clips handed down from JS as base64 MP3.
  // Lazy for the same reason as `backend` — no AVFoundation construction at
  // module-create time (before the JS thread exists).
  private lazy var clipPlayer: AudioClipPlayer = {
    let p = AudioClipPlayer()
    p.delegate = self
    return p
  }()

  public func definition() -> ModuleDefinition {
    Name("AuthorityTtsModule")

    Events("onSpeechStart", "onSpeechDone", "onSpeechCanceled", "onSpeechError")

    Function("getVoices") { () -> [[String: String]] in
      self.backend.availableVoices()
    }

    /// Speak text. Returns the utteranceId so JS can correlate lifecycle events.
    Function("speak") {
      (text: String, utteranceId: String, options: [String: Any]?) -> String in
      let opts = SynthesisOptions(
        localeId: options?["localeId"] as? String,
        voiceId: options?["voiceId"] as? String,
        rate: (options?["rate"] as? Double).map { Float($0) },
        pitch: (options?["pitch"] as? Double).map { Float($0) }
      )
      self.backend.speak(text: text, utteranceId: utteranceId, options: opts)
      return utteranceId
    }

    /// Play a base64-encoded audio clip (ElevenLabs "Bob" voice from the runtime
    /// proxy). Emits the SAME lifecycle events as `speak`. Returns the utteranceId.
    Function("playClip") {
      (base64: String, utteranceId: String, _options: [String: Any]?) -> String in
      self.clipPlayer.play(base64: base64, utteranceId: utteranceId)
      return utteranceId
    }

    /// Barge-in: stop immediately. Cuts BOTH the on-device synthesizer AND any
    /// remote clip currently playing, so a single stop() always silences Bob.
    Function("stop") {
      self.backend.stop()
      self.clipPlayer.stop()
    }

    Function("pause") {
      self.backend.pause()
    }

    Function("resume") {
      self.backend.resume()
    }
  }

  // MARK: - Backend factory (the swap point)

  static func makeBackend() -> SpeechSynthesizing {
    // v1: built-in synthesizer. Replace with OrcaSynthEngine / ElevenLabsSynthEngine here.
    return AVSpeechSynthEngine()
  }

  // MARK: - SpeechSynthesizingDelegate -> JS events

  func synthDidStart(utteranceId: String) {
    sendEvent("onSpeechStart", ["utteranceId": utteranceId])
  }

  func synthDidFinish(utteranceId: String) {
    sendEvent("onSpeechDone", ["utteranceId": utteranceId])
  }

  func synthDidCancel(utteranceId: String) {
    sendEvent("onSpeechCanceled", ["utteranceId": utteranceId])
  }

  func synthDidError(utteranceId: String, message: String) {
    sendEvent("onSpeechError", ["utteranceId": utteranceId, "message": message])
  }
}
