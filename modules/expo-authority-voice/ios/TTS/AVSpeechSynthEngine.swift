import AVFoundation
import Foundation

/// v1 TTS backend: Apple's built-in AVSpeechSynthesizer. On-device, free, no model download.
/// Implements `SpeechSynthesizing` so it can be swapped for a neural/cloud backend later
/// without changing any call site.
final class AVSpeechSynthEngine: NSObject, SpeechSynthesizing, AVSpeechSynthesizerDelegate {
  weak var delegate: SpeechSynthesizingDelegate?

  private let synthesizer = AVSpeechSynthesizer()
  // AVSpeechUtterance has no id of its own, so we map identity -> our utteranceId.
  private var idByUtterance: [ObjectIdentifier: String] = [:]

  override init() {
    super.init()
    synthesizer.delegate = self
  }

  func availableVoices() -> [[String: String]] {
    AVSpeechSynthesisVoice.speechVoices().map { voice in
      [
        "id": voice.identifier,
        "name": voice.name,
        "language": voice.language,
      ]
    }
  }

  func speak(text: String, utteranceId: String, options: SynthesisOptions) {
    let utterance = AVSpeechUtterance(string: text)

    if let voiceId = options.voiceId, let voice = AVSpeechSynthesisVoice(identifier: voiceId) {
      utterance.voice = voice
    } else if let localeId = options.localeId {
      utterance.voice = AVSpeechSynthesisVoice(language: localeId)
    }

    // Map normalized 0...1 rate onto AVSpeechUtterance's min...max range.
    if let rate = options.rate {
      let lo = AVSpeechUtteranceMinimumSpeechRate
      let hi = AVSpeechUtteranceMaximumSpeechRate
      utterance.rate = lo + (hi - lo) * max(0, min(1, rate))
    } else {
      utterance.rate = AVSpeechUtteranceDefaultSpeechRate
    }

    if let pitch = options.pitch {
      utterance.pitchMultiplier = max(0.5, min(2.0, pitch))
    }

    idByUtterance[ObjectIdentifier(utterance)] = utteranceId

    // Keep playback working alongside the record session used by STT (barge-in).
    configureSessionForPlayback()
    synthesizer.speak(utterance)
  }

  func stop() {
    // .immediate cuts off mid-word — exactly what barge-in wants.
    synthesizer.stopSpeaking(at: .immediate)
  }

  func pause() {
    synthesizer.pauseSpeaking(at: .word)
  }

  func resume() {
    synthesizer.continueSpeaking()
  }

  private func configureSessionForPlayback() {
    let session = AVAudioSession.sharedInstance()
    // If STT already activated .playAndRecord we leave it; otherwise set a playback-friendly
    // category. .duckOthers + .mixWithOthers keeps us polite about background audio.
    if session.category != .playAndRecord {
      try? session.setCategory(.playback, mode: .spokenAudio, options: [.duckOthers])
      try? session.setActive(true, options: [])
    }
  }

  // MARK: - AVSpeechSynthesizerDelegate

  func speechSynthesizer(_ s: AVSpeechSynthesizer, didStart utterance: AVSpeechUtterance) {
    if let id = idByUtterance[ObjectIdentifier(utterance)] {
      delegate?.synthDidStart(utteranceId: id)
    }
  }

  func speechSynthesizer(_ s: AVSpeechSynthesizer, didFinish utterance: AVSpeechUtterance) {
    let key = ObjectIdentifier(utterance)
    if let id = idByUtterance[key] {
      delegate?.synthDidFinish(utteranceId: id)
    }
    idByUtterance[key] = nil
  }

  func speechSynthesizer(_ s: AVSpeechSynthesizer, didCancel utterance: AVSpeechUtterance) {
    let key = ObjectIdentifier(utterance)
    if let id = idByUtterance[key] {
      delegate?.synthDidCancel(utteranceId: id)
    }
    idByUtterance[key] = nil
  }
}
