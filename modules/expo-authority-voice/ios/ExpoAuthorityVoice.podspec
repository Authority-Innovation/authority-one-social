Pod::Spec.new do |s|
  s.name           = 'ExpoAuthorityVoice'
  s.version        = '1.0.0'
  s.summary        = 'On-device speech-to-text and text-to-speech for Authority One.'
  s.description    = 'STT (Apple SpeechAnalyzer on iOS 26+, WhisperKit fallback on iOS 17-25) and TTS (AVSpeechSynthesizer) bridged to React Native via Expo Modules.'
  s.author         = 'Authority Innovation'
  s.homepage       = 'https://authority-one.com'
  # iOS 17 floor: WhisperKit fallback path requires iOS 16+, SpeechAnalyzer path is gated to iOS 26 at runtime.
  s.platforms      = { :ios => '17.0' }
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  # Swift/Objective-C compatibility
  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'SWIFT_COMPILATION_MODE' => 'wholemodule'
  }

  s.source_files = "**/*.{h,m,mm,swift,hpp,cpp}"
end
