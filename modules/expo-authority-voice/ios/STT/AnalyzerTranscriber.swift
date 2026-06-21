import AVFoundation
import Foundation
import Speech

/// Primary STT backend: Apple's SpeechAnalyzer + SpeechTranscriber (WWDC25, iOS 26+).
/// Fully on-device, streaming, emits volatile (partial) results needed for barge-in.
///
/// Availability is gated at runtime by the factory in `AuthoritySpeechModule`; this type
/// is only instantiated when `#available(iOS 26.0, *)` and the model is installable.
@available(iOS 26.0, *)
final class AnalyzerTranscriber: SpeechRecognizing {
  let backend: SpeechBackend = .speechAnalyzer

  private let mic = MicrophoneTap()
  private var analyzer: SpeechAnalyzer?
  private var transcriber: SpeechTranscriber?
  private var inputBuilder: AsyncStream<AnalyzerInput>.Continuation?
  private var analyzerFormat: AVAudioFormat?
  private var converter: AVAudioConverter?
  private var resultsTask: Task<Void, Never>?
  private var isRunning = false

  func requestAuthorization(_ completion: @escaping (Bool) -> Void) {
    SFSpeechRecognizer.requestAuthorization { status in
      let speechOK = status == .authorized
      // Mic permission is requested lazily by AVAudioSession; ask explicitly so the
      // prompt fires before we try to start the engine.
      AVAudioApplication.requestRecordPermission { micOK in
        completion(speechOK && micOK)
      }
    }
  }

  func start(
    localeId: String,
    onUpdate: @escaping (TranscriptUpdate) -> Void,
    onError: @escaping (String) -> Void
  ) {
    guard !isRunning else { return }
    isRunning = true

    Task {
      do {
        let locale = Locale(identifier: localeId)

        // `.volatileResults` is what gives us live partials for barge-in.
        let transcriber = SpeechTranscriber(
          locale: locale,
          transcriptionOptions: [],
          reportingOptions: [.volatileResults],
          attributeOptions: []
        )
        self.transcriber = transcriber

        // Ensure the on-device model for this locale is present, downloading if needed.
        try await Self.ensureModel(for: transcriber, locale: locale)

        let analyzer = SpeechAnalyzer(modules: [transcriber])
        self.analyzer = analyzer

        // The analyzer dictates the audio format it wants; we convert mic buffers to it.
        guard
          let bestFormat = await SpeechAnalyzer.bestAvailableAudioFormat(
            compatibleWith: [transcriber]
          )
        else {
          throw NSError(
            domain: "AuthorityVoice", code: -10,
            userInfo: [NSLocalizedDescriptionKey: "No compatible analyzer audio format."]
          )
        }
        self.analyzerFormat = bestFormat

        // Pipe converted buffers into the analyzer via an AsyncStream.
        let (stream, continuation) = AsyncStream<AnalyzerInput>.makeStream()
        self.inputBuilder = continuation

        try await analyzer.start(inputSequence: stream)

        // Consume results off the transcriber's async sequence.
        self.resultsTask = Task {
          do {
            for try await result in transcriber.results {
              let text = String(result.text.characters)
              onUpdate(TranscriptUpdate(text: text, isFinal: result.isFinal))
            }
          } catch {
            onError("Transcriber results failed: \(error.localizedDescription)")
          }
        }

        try self.startMic(onError: onError)
      } catch {
        self.isRunning = false
        onError("SpeechAnalyzer start failed: \(error.localizedDescription)")
      }
    }
  }

  private func startMic(onError: @escaping (String) -> Void) throws {
    try mic.activateSession()
    let hwFormat = mic.inputFormat

    if let target = analyzerFormat, hwFormat != target {
      converter = AVAudioConverter(from: hwFormat, to: target)
    }

    try mic.start { [weak self] buffer, _ in
      guard let self, let continuation = self.inputBuilder else { return }
      if let converter = self.converter, let target = self.analyzerFormat {
        guard let converted = Self.convert(buffer, using: converter, to: target) else { return }
        continuation.yield(AnalyzerInput(buffer: converted))
      } else {
        continuation.yield(AnalyzerInput(buffer: buffer))
      }
    }
  }

  func stop() {
    isRunning = false
    mic.stop()
    inputBuilder?.finish()
    inputBuilder = nil
    resultsTask?.cancel()
    resultsTask = nil
    let analyzer = self.analyzer
    Task { try? await analyzer?.finalizeAndFinishThroughEndOfInput() }
    self.analyzer = nil
    self.transcriber = nil
  }

  // MARK: - Helpers

  /// Reserve + install the on-device locale model if it isn't already present.
  private static func ensureModel(for transcriber: SpeechTranscriber, locale: Locale) async throws {
    let installed = await Set(SpeechTranscriber.supportedLocales)
      .contains { $0.identifier(.bcp47) == locale.identifier(.bcp47) }
    if installed { return }
    if let request = try await AssetInventory.assetInstallationRequest(supporting: [transcriber]) {
      try await request.downloadAndInstall()
    }
  }

  private static func convert(
    _ buffer: AVAudioPCMBuffer,
    using converter: AVAudioConverter,
    to format: AVAudioFormat
  ) -> AVAudioPCMBuffer? {
    let ratio = format.sampleRate / buffer.format.sampleRate
    let capacity = AVAudioFrameCount(Double(buffer.frameLength) * ratio + 1024)
    guard let out = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: capacity) else { return nil }
    var consumed = false
    var err: NSError?
    converter.convert(to: out, error: &err) { _, status in
      if consumed {
        status.pointee = .noDataNow
        return nil
      }
      consumed = true
      status.pointee = .haveData
      return buffer
    }
    if err != nil { return nil }
    return out
  }
}
