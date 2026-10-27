/**
 * Which chip is selected in the Home community switcher.
 *
 * This is client-only UI state. It is never sent to the runtime as authority:
 * the runtime re-checks membership on every read, so a stale or forged value
 * here can only ever select a feed the server then refuses.
 *
 * The value is a Home feed descriptor name: `communities` for the "All" chip,
 * or `community|<id>` for a single community. The feed work that reads these
 * descriptors lands separately, so for now nothing outside the switcher reads
 * this state and the real Home selected feed is left untouched.
 */
import {createContext, useContext, useState} from 'react'

export type CommunityFeedDescriptor = 'communities' | `community|${string}`

export const ALL_COMMUNITIES_FEED: CommunityFeedDescriptor = 'communities'

/** The state key, also used in the report and by later tasks. */
export const SELECTED_COMMUNITY_FEED_KEY = 'selectedCommunityFeed'

export function communityFeedDescriptor(id: string): CommunityFeedDescriptor {
  return `community|${id}`
}

type SetContext = (v: CommunityFeedDescriptor) => void

const stateContext =
  createContext<CommunityFeedDescriptor>(ALL_COMMUNITIES_FEED)
stateContext.displayName = 'SelectedCommunityFeedStateContext'
const setContext = createContext<SetContext>(() => {})
setContext.displayName = 'SelectedCommunityFeedSetContext'

export function Provider({children}: React.PropsWithChildren<{}>) {
  const [state, setState] =
    useState<CommunityFeedDescriptor>(ALL_COMMUNITIES_FEED)

  return (
    <stateContext.Provider value={state}>
      <setContext.Provider value={setState}>{children}</setContext.Provider>
    </stateContext.Provider>
  )
}

export function useSelectedCommunityFeed() {
  return useContext(stateContext)
}

export function useSetSelectedCommunityFeed() {
  return useContext(setContext)
}
