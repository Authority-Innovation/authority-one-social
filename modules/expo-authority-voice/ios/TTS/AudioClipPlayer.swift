import AVFoundation
import Foundation

/// Plays already-synthesized audio clips (e.g. the ElevenLabs "Bob" voice fetched
/// via the runtime proxy and handed down from JS as base64 MP3). It is NOT a
/// `SpeechSynthesizing` backend — it doesn't synthesize; it plays bytes — but it
/// emits the SAME lifecycle callbacks (`SpeechSynthesizingDelegate`) so the JS layer
/// treats remote (ElevenLabs) and on-device (AVSpeechSynthesizer) voices uniformly,
/// including barge-in via `stop()`.
///
/// The ElevenLabs API key never reaches the device: the bytes are produced by the
/// Worker's `/app/tts` proxy and only the resulting audio is decoded+played here.
final class AudioClipPlayer: NSObject, AVAudioPlayerDelegate {
  weak var delegate: SpeechSynthesizingDelegate?

  private var player: AVAudioPlayer?
  private var currentUtteranceId: String?

  /// Decode a base64 audio clip and play it. Emits onStart immediately on success;
  /// onError if the clip can't be decoded/played (the JS layer then falls back to
  /// the on-device synthesizer).
  func play(base64: String, utteranceId: String) {
    // A new clip supersedes any in-flight one (treat the old as canceled).
    stop()

    guard let data = Data(base64Encoded: base64, options: [.ignoreUnknownCharacters]),
          !data.isEmpty else {
      delegate?.synthDidError(utteranceId: utteranceId, message: "invalid audio clip")
      return
    }

    configureSessionForPlayback()

    do {
      let p = try AVAudioPlayer(data: data)
      p.delegate = self
      currentUtteranceId = utteranceId
      player = p
      if p.play() {
        delegate?.synthDidStart(utteranceId: utteranceId)
      } else {
        player = nil
        currentUtteranceId = nil
        delegate?.synthDidError(utteranceId: utteranceId, message: "audio player failed to start")
      }
    } catch {
      player = nil
      currentUtteranceId = nil
      delegate?.synthDidError(utteranceId: utteranceId, message: error.localizedDescription)
    }
  }

  /// Stop immediately (barge-in). Safe to call when idle. Reports a cancel for the
  /// clip that was playing so the JS state machine settles.
  func stop() {
    guard let p = player else { return }
    p.stop()
    player = nil
    let id = currentUtteranceId
    currentUtteranceId = nil
    if let id = id {
      delegate?.synthDidCancel(utteranceId: id)
    }
  }

  var isPlaying: Bool { player?.isPlaying ?? false }

  private func configureSessionForPlayback() {
    let session = AVAudioSession.sharedInstance()
    // If STT already activated .playAndRecord (continuous mode keeps the mic open
    // for barge-in) we leave it; otherwise set a playback-friendly category.
    if session.category != .playAndRecord {
      try? session.setCategory(.playback, mode: .spokenAudio, options: [.duckOthers])
      try? session.setActive(true, options: [])
    }
  }

  // MARK: - AVAudioPlayerDelegate

  func audioPlayerDidFinishPlaying(_ p: AVAudioPlayer, successfully flag: Bool) {
    let id = currentUtteranceId
    player = nil
    currentUtteranceId = nil
    guard let id = id else { return }
    if flag {
      delegate?.synthDidFinish(utteranceId: id)
    } else {
      delegate?.synthDidError(utteranceId: id, message: "audio playback ended with an error")
    }
  }

  func audioPlayerDecodeErrorDidOccur(_ p: AVAudioPlayer, error: Error?) {
    let id = currentUtteranceId
    player = nil
    currentUtteranceId = nil
    if let id = id {
      delegate?.synthDidError(utteranceId: id, message: error?.localizedDescription ?? "decode error")
    }
  }
}
