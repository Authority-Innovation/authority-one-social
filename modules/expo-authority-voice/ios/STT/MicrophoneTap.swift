import AVFoundation

/// Thin wrapper over AVAudioEngine that installs a tap on the input node and
/// forwards raw PCM buffers to a sink. Both STT backends share this so the
/// capture/teardown logic lives in one place.
final class MicrophoneTap {
  private let engine = AVAudioEngine()
  private var installed = false

  /// The hardware input format. Backends that need a specific format (e.g. 16 kHz
  /// mono Float32 for WhisperKit) should convert from this.
  var inputFormat: AVAudioFormat {
    engine.inputNode.outputFormat(forBus: 0)
  }

  /// Configure the shared audio session for record + playback so TTS can duck/continue
  /// and barge-in works while audio is playing. Throws on failure.
  func activateSession() throws {
    let session = AVAudioSession.sharedInstance()
    // .playAndRecord + .duckOthers lets us listen while TTS is speaking (barge-in),
    // .defaultToSpeaker keeps output on the speaker rather than the earpiece.
    try session.setCategory(
      .playAndRecord,
      mode: .spokenAudio,
      options: [.duckOthers, .defaultToSpeaker, .allowBluetooth]
    )
    try session.setActive(true, options: [])
  }

  /// Start capturing. `onBuffer` is called on the audio render thread — do minimal work there.
  func start(onBuffer: @escaping (AVAudioPCMBuffer, AVAudioTime) -> Void) throws {
    let input = engine.inputNode
    // ECHO CANCELLATION for continuous voice chat: enabling Apple's voice-processing
    // I/O makes the input node cancel our own TTS playback out of the captured signal,
    // so Bob's spoken reply doesn't false-trigger barge-in while the mic stays open.
    // Best-effort (iOS 13+); ignore if unsupported so capture still works without AEC.
    if #available(iOS 13.0, *) {
      try? input.setVoiceProcessingEnabled(true)
    }
    let format = input.outputFormat(forBus: 0)
    input.installTap(onBus: 0, bufferSize: 4096, format: format) { buffer, when in
      onBuffer(buffer, when)
    }
    installed = true
    engine.prepare()
    try engine.start()
  }

  func stop() {
    if installed {
      engine.inputNode.removeTap(onBus: 0)
      installed = false
    }
    if engine.isRunning {
      engine.stop()
    }
  }
}
