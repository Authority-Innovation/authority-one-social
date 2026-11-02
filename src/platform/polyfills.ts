import 'fast-text-encoding'

import {installTextDecoder} from '#/lib/utf8'
import {installWeakRef} from '#/lib/weakRef'

// Hermes has no TextDecoder, and fast-text-encoding's throws on `fatal` and
// `stream` (livekit-client asks for {fatal: true}; chat streams with
// {stream: true}). Install a full one unless the platform has it.
installTextDecoder()
// Hermes has no WeakRef either, and livekit-client 2.23.0 uses it unguarded
// in `new Room()` (Agent Live "(code: room-setup)", builds 43 and 44).
installWeakRef()

export {}
