Pod::Spec.new do |s|
  s.name           = 'ExpoAOAuthSession'
  s.version        = '1.0.0'
  s.summary        = 'ASWebAuthenticationSession with a claimed https callback (Signature sign-in).'
  s.description    = 'Runs the Janus authorize leg in ASWebAuthenticationSession and completes on an exact https host + path (ASWebAuthenticationSession.Callback.https, iOS 17.4+). Used only when the Signature lane is armed with the claimed callback.'
  s.author         = 'Authority Innovation'
  s.homepage       = 'https://authority-one.com'
  # Same floor as the app's dark builds (17.0) so a dark build still compiles
  # and links this pod; the https callback itself is gated to iOS 17.4 at
  # runtime, and an ARMED https build raises the app target to 17.4
  # (app.config.js aoSignatureHttpsCallbackHost).
  s.platforms      = { :ios => '17.0' }
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'SWIFT_COMPILATION_MODE' => 'wholemodule'
  }

  s.source_files = "**/*.{h,m,swift}"
end
