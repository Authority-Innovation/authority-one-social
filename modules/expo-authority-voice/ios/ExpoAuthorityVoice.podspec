Pod::Spec.new do |s|
  s.name           = 'ExpoAuthorityVoice'
  s.version        = '1.0.0'
  s.summary        = 'On-device speech-to-text and text-to-speech for Authority One.'
  s.description    = 'STT (Apple SpeechAnalyzer on iOS 26+) and TTS (AVSpeechSynthesizer) bridged to React Native via Expo Modules. The WhisperKit fallback was removed for the first TestFlight build; STT reports unavailable on iOS < 26.'
  s.author         = 'Authority Innovation'
  s.homepage       = 'https://authority-one.com'
  # iOS 17 floor for the Expo module; the SpeechAnalyzer STT path is gated to iOS 26 at runtime.
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
