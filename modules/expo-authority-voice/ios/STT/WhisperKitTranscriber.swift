import AVFoundation
import Foundation

// WhisperKit is added by the app owner via Swift Package Manager (Argmax/WhisperKit).
// We guard the entire dependency behind `canImport` so this module compiles and the app
// builds even before the package is added — the factory simply reports `.unavailable`.
#if canImport(WhisperKit)
import WhisperKit

/// Fallback STT backend for iOS 17-25: WhisperKit running Core ML on the Neural Engine.
/// Uses WhisperKit's `AudioStreamTranscriber` to emit live partial hypotheses, which we
/// surface as volatile updates so barge-in behaves the same as the SpeechAnalyzer path.
final class WhisperKitTranscriber: SpeechRecognizing {
  let backend: SpeechBackend = .whisperKit

  /// Default model. "base" balances latency/accuracy on A15 (iPhone 13). The owner can
  /// pin a different variant (e.g. "small", "base.en") — see README.
  private let modelName: String
  private var whisperKit: WhisperKit?
  private var streamTranscriber: AudioStreamTranscriber?
  private var streamTask: Task<Void, Never>?
  private var isRunning = false

  init(modelName: String = "base") {
    self.modelName = modelName
  }

  func requestAuthorization(_ completion: @escaping (Bool) -> Void) {
    AVAudioApplication.requestRecordPermission { micOK in
      completion(micOK)
    }
  }

  func start(
    localeId: String,
    onUpdate: @escaping (TranscriptUpdate) -> Void,
    onError: @escaping (String) -> Void
  ) {
    guard !isRunning else { return }
    isRunning = true

    streamTask = Task {
      do {
        let config = WhisperKitConfig(model: modelName)
        let kit = try await WhisperKit(config)
        self.whisperKit = kit

        guard
          let tokenizer = kit.tokenizer,
          let audioProcessor = kit.audioProcessor as? AudioProcessor
        else {
          throw NSError(
            domain: "AuthorityVoice", code: -20,
            userInfo: [NSLocalizedDescriptionKey: "WhisperKit not fully initialized."]
          )
        }

        var decodeOptions = DecodingOptions()
        decodeOptions.language = String(localeId.prefix(2)) // "en-US" -> "en"
        decodeOptions.usePrefillPrompt = true

        // The stream transcriber reports a rolling confirmed + hypothesis text. We map
        // hypothesis text to volatile updates and confirmed text to finals.
        let transcriber = AudioStreamTranscriber(
          audioEncoder: kit.audioEncoder,
          featureExtractor: kit.featureExtractor,
          segmentSeeker: kit.segmentSeeker,
          textDecoder: kit.textDecoder,
          tokenizer: tokenizer,
          audioProcessor: audioProcessor,
          decodingOptions: decodeOptions
        ) { _, newState in
          let confirmed = newState.confirmedText
          let hypothesis = newState.currentText
          if !confirmed.isEmpty {
            onUpdate(TranscriptUpdate(text: confirmed, isFinal: true))
          }
          if !hypothesis.isEmpty {
            onUpdate(TranscriptUpdate(text: confirmed + hypothesis, isFinal: false))
          }
        }
        self.streamTranscriber = transcriber

        try await transcriber.startStreamTranscription()
      } catch is CancellationError {
        // normal stop
      } catch {
        self.isRunning = false
        onError("WhisperKit start failed: \(error.localizedDescription)")
      }
    }
  }

  func stop() {
    guard isRunning else { return }
    isRunning = false
    Task { await streamTranscriber?.stopStreamTranscription() }
    streamTask?.cancel()
    streamTask = nil
    streamTranscriber = nil
    whisperKit = nil
  }
}
#endif
