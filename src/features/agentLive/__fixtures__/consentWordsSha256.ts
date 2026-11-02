/**
 * The runtime's SHA-256 of the one-app-v1 consent words, per kind, copied
 * from its table (pilot-agent-runtime src/live/consent/texts.js at ba7b6f0,
 * CONSENT_TEXT_SHA256). The sheet's English words must hash to these, or the
 * runtime refuses the consent (text_mismatch).
 */
export const RUNTIME_ONE_APP_V1_SHA256: Record<string, string> = {
  ai_process:
    '3c36832ae3d064c70fa57c4f3e2ae6071c00385378af672bb78646632a631084',
  record_audio:
    '3e4d728c2073c1ee1107e5c75a75597f2890c6feb506ad2d8eb711932738e25a',
  record_video:
    'cc414c5eaa96c137896b14a76bbbd8d3d23ef741aacedc5a5a9ab4fab7efcc61',
  transcribe:
    '95d32035c3437de7fc3ace72ed9b1bf446305694427f7cea5739e25e876da807',
  remember: '9c9c4ef89989554f382820ba1d22291d7c54ae96944630dcee071bf21e8fb3a6',
  retain_extended:
    '83aafc4742de5c6eb85f08abab3c6bca863baa4a19dac358d36d9983060ff5f0',
  export_publish:
    'a9f25c87b4d7ec6ac5779fb9d3dd2e41c6da0d72252f0da20e1ab17446e32e07',
}
