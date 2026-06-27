// WhisperKit STT backend — REMOVED for the first TestFlight build.
//
// Authority One dropped the WhisperKit (iOS 17–25) fallback. The owner's target
// device is iPhone 17 Pro Max on iOS 26, which uses Apple's on-device
// SpeechAnalyzer / SpeechTranscriber path (AnalyzerTranscriber.swift). Removing
// WhisperKit also eliminates the Swift Package Manager linkage / `Ld` build
// problems that the optional package caused.
//
// On iOS < 26 with WhisperKit absent, STT now reports `.unavailable` (see
// AuthoritySpeechModule.detectBackend / makeRecognizer, which keep a
// `#if canImport(WhisperKit)` guard so the module still compiles with or without
// the package).
//
// To re-enable the WhisperKit fallback later:
//   1. Add the WhisperKit SwiftPM package to the app target in Xcode
//      (https://github.com/argmaxinc/WhisperKit).
//   2. Restore the `WhisperKitTranscriber` implementation in this file (it
//      conformed to `SpeechRecognizing` and wrapped WhisperKit's
//      `AudioStreamTranscriber`; see git history for the original).
//   3. Re-point AuthoritySpeechModule.makeRecognizer's `.whisperKit` case at it.
//
// This file is intentionally left as a placeholder (no code) so the module
// builds with no WhisperKit dependency present.
