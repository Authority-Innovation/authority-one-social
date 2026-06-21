import ExpoModulesCore
import Speech

/// JS-facing STT module. Picks the best on-device backend at runtime
/// (SpeechAnalyzer on iOS 26+, WhisperKit on iOS 17-25) and streams transcripts
/// to JS as events. Partial (volatile) results power barge-in.
public class AuthoritySpeechModule: Module {
  private var recognizer: SpeechRecognizing?

  public func definition() -> ModuleDefinition {
    Name("AuthoritySpeechModule")

    Events(
      "onPartialTranscript", // volatile, may change — drives barge-in
      "onFinalTranscript",   // committed segment
      "onError"
    )

    /// Report which backend would be used, without starting capture.
    /// JS uses this to show the right UI / decide whether to prompt for WhisperKit model download.
    Function("getCapabilities") { () -> [String: Any] in
      let backend = Self.detectBackend()
      return [
        "backend": backend.rawValue,
        "available": backend != .unavailable,
        "supportsPartialResults": backend != .unavailable,
        "osVersion": UIDevice.current.systemVersion,
      ]
    }

    /// Request mic + speech-recognition permission. Resolves true only if both granted.
    AsyncFunction("requestPermissions") { (promise: Promise) in
      let backend = Self.detectBackend()
      guard let rec = Self.makeRecognizer(for: backend) else {
        promise.resolve(false)
        return
      }
      self.recognizer = rec
      rec.requestAuthorization { granted in
        promise.resolve(granted)
      }
    }

    /// Begin streaming transcription. `localeId` is BCP-47, e.g. "en-US".
    Function("start") { (localeId: String) in
      // Reuse the recognizer created during requestPermissions, or make one now.
      let rec = self.recognizer ?? Self.makeRecognizer(for: Self.detectBackend())
      guard let rec else {
        self.sendEvent("onError", ["message": "No on-device STT backend available."])
        return
      }
      self.recognizer = rec

      rec.start(
        localeId: localeId,
        onUpdate: { [weak self] update in
          guard let self else { return }
          let name = update.isFinal ? "onFinalTranscript" : "onPartialTranscript"
          self.sendEvent(name, ["text": update.text])
        },
        onError: { [weak self] message in
          self?.sendEvent("onError", ["message": message])
        }
      )
    }

    /// Stop streaming and finalize.
    Function("stop") {
      self.recognizer?.stop()
    }

    OnDestroy {
      self.recognizer?.stop()
      self.recognizer = nil
    }
  }

  // MARK: - Backend selection

  static func detectBackend() -> SpeechBackend {
    if #available(iOS 26.0, *) {
      // SpeechTranscriber is the modern on-device path.
      return .speechAnalyzer
    }
    #if canImport(WhisperKit)
    return .whisperKit
    #else
    return .unavailable
    #endif
  }

  static func makeRecognizer(for backend: SpeechBackend) -> SpeechRecognizing? {
    switch backend {
    case .speechAnalyzer:
      if #available(iOS 26.0, *) {
        return AnalyzerTranscriber()
      }
      return nil
    case .whisperKit:
      #if canImport(WhisperKit)
      return WhisperKitTranscriber()
      #else
      return nil
      #endif
    case .unavailable:
      return nil
    }
  }
}
