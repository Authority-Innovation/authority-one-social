import 'fast-text-encoding'

import {installTextDecoder} from '#/lib/utf8'

// Hermes has TextEncoder but no TextDecoder, and fast-text-encoding then
// installs neither (build 43: Agent Live's join, and chat streaming, video
// upload and Signature on native all need one). Fill it when missing.
installTextDecoder()

export {}
