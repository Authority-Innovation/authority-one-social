import ExpoModulesCore

/// JS-facing TTS module. Delegates to a `SpeechSynthesizing` backend (AVSpeechSynthesizer
/// today) and forwards lifecycle events to JS. To swap in Orca/ElevenLabs later, change
/// only the `makeBackend()` factory — JS and the rest of the app are unaffected.
public class AuthorityTtsModule: Module, SpeechSynthesizingDelegate {
  private lazy var backend: SpeechSynthesizing = Self.makeBackend()

  public func definition() -> ModuleDefinition {
    Name("AuthorityTtsModule")

    Events("onSpeechStart", "onSpeechDone", "onSpeechCanceled", "onSpeechError")

    OnCreate {
      self.backend.delegate = self
    }

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

    /// Barge-in: stop immediately.
    Function("stop") {
      self.backend.stop()
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
