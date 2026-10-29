# Task 70c327d4 - eas.json "development-communities" profile

Base: worktree HEAD 0e9a11931 (descendant of communities/integration e743c2cfd; the two extra commits are docs/chore only, eas.json untouched).

Change commit: f7056e13d - adds ONE profile, `development-communities`, a verbatim copy of `development`
(extends base, developmentClient, internal, channel development, iOS simulator) with:

- EXPO_PUBLIC_COMMUNITIES_ENABLED = "true"
- EXPO_PUBLIC_COMMUNITY_SWITCHER = "false"
- EXPO_PUBLIC_LOCKED_COMMUNITY = ""

`git diff --stat`: `eas.json | 28 ++++++++++++++++++++++++++++` (1 file, 28 insertions, 0 deletions)

## grep counts

| pattern | before | after |
| --- | --- | --- |
| `"EXPO_PUBLIC_COMMUNITIES_ENABLED": "false"` | 7 | 7 |
| `"EXPO_PUBLIC_COMMUNITIES_ENABLED": "true"` | 0 | 1 (line 67, new profile only) |
| any `"false"` line | 14 | 15 |

The total `"false"` count rises by one because the new profile carries its own
`EXPO_PUBLIC_COMMUNITY_SWITCHER: "false"` (as required). COMMUNITIES_ENABLED "false" is unchanged at 7.

## JSON parse

`node -e "JSON.parse(require('fs').readFileSync('eas.json','utf8'))"` - OK. Per-profile env:

```
base false "false" ""
development false "false" ""
development-communities true "false" ""
preview false "false" ""
production false "false" ""
production-apk false "false" ""
testflight false "false" ""
testflight-android false "false" ""
```

Nothing was built or submitted. No tests run (config-only change).
