// Agent Live (task 69138168): the LiveKit native modules are autolinked only
// when EXPO_PUBLIC_AGENT_LIVE_ENABLED=true. See plugins/agentLive.
const {agentLiveRNDependencies} = require('./plugins/agentLive')

module.exports = {
  dependencies: agentLiveRNDependencies(),
}
