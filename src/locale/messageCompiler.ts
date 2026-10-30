import {i18n} from '@lingui/core'
import {compileMessage} from '@lingui/message-utils/compileMessage'

/*
 * Lingui only registers its runtime message compiler outside production. In a
 * Release build, a message that is not yet in the compiled catalog (new strings
 * land in the catalog with the nightly extract) falls back to its raw source
 * text, so a placeholder renders literally, e.g. "run by {sponsorName}".
 * Registering the compiler in every environment makes those
 * fallbacks interpolate like compiled messages do. This is what dev builds
 * already do, so Release now renders strings the way dev does.
 */
export function registerMessageCompiler() {
  i18n.setMessagesCompiler(compileMessage)
}

registerMessageCompiler()
