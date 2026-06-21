import Foundation

/// Which on-device STT backend is in use.
enum SpeechBackend: String {
  /// Apple SpeechAnalyzer / SpeechTranscriber. Streaming, on-device. iOS 26+.
  case speechAnalyzer
  /// WhisperKit (Argmax) via Core ML / Neural Engine. iOS 17-25 fallback.
  case whisperKit
  /// No on-device backend available on this device/OS.
  case unavailable
}

/// A single transcription update emitted by a backend.
struct TranscriptUpdate {
  let text: String
  /// `true` once the backend has committed this segment (no longer volatile).
  let isFinal: Bool
}

/// Common surface every STT backend implements so call sites never branch on OS version.
/// Backends stream `TranscriptUpdate`s; partial (volatile) results are required for barge-in.
protocol SpeechRecognizing: AnyObject {
  var backend: SpeechBackend { get }

  /// Request mic + speech-recognition authorization. Completion is called on an arbitrary queue.
  func requestAuthorization(_ completion: @escaping (Bool) -> Void)

  /// Begin streaming transcription for `localeId` (BCP-47, e.g. "en-US").
  /// `onUpdate` fires for every volatile/final segment; `onError` fires once on failure.
  func start(
    localeId: String,
    onUpdate: @escaping (TranscriptUpdate) -> Void,
    onError: @escaping (String) -> Void
  )

  /// Stop streaming and finalize. Safe to call when not running.
  func stop()
}
