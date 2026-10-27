# Community switcher (Home header)

A row of chips in the Home header: "All", then one chip per community the
signed-in person belongs to.

- **Flags:** shown only when `EXPO_PUBLIC_COMMUNITIES_ENABLED` and
  `EXPO_PUBLIC_COMMUNITY_SWITCHER` are both on, and the build is not locked to
  one community (`EXPO_PUBLIC_LOCKED_COMMUNITY` empty). Both default off. With
  the flags off, the membership list is never requested.
- **Data:** `useMyCommunitiesQuery` calls `communitiesClient.listMyCommunities()`.
  Any client error returns an empty list (fail closed). Malformed or duplicate
  entries are dropped. A community the person has left is gone on the next
  fetch, and a selection pointing at it falls back to "All".
- **State:** the selected chip is client state in
  `#/state/shell/selected-community` (key `selectedCommunityFeed`). Values are
  Home feed descriptor names: `communities` ("All") or `community|<id>`. It is
  never sent as authority; the runtime re-checks membership on every read.
  Selecting a chip makes no network call.
- **Feed:** the descriptors are not yet wired into the real Home selected feed
  (`#/state/shell/selected-feed`). That is the combined-feed task (T10), which
  should read `useSelectedCommunityFeed()`.
- **Long-press:** opens `CommunitySheet`, modelled on `SwitchAccountDialog`:
  "Show in Home", "Open community" (`/c/:id`), "Close".
- **Accent (N3):** a community's accent (hex colours only) is drawn on its chip
  and on the header row's bottom border while it is selected. The app theme is
  never changed.
