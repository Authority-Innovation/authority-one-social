# Authority One — in-app brand theme (additive)

Adds a **selectable "Authority One" app theme** to the One fork, keyed to the
live marketing site **https://authority-one.com**. It ships *alongside* the
existing light/dark/dim themes — not as a replacement — with an in-app switcher
in **Settings → Appearance → App theme** that reskins the running app **live, no
restart**. Reverting = pick "Default" in that same control (or check out a
different branch).

- Branch: **`feat/authority-one-theme`** (off `spike`). No commits, no push, no merge.
- ⚠️ **Needs build 4 to see on the phone** — native bundle change (new theme
  module + Appearance UI). The switcher itself is pure JS/state, but it only
  ships to the device on a fresh native build.

---

## STEP 1 — Extracted design tokens (exact values + source)

**Source:** `https://authority-one.com` is a Lovable/React (Tailwind + shadcn)
site. Colors live as **oklch CSS custom properties** in the compiled stylesheet.
A plain text fetch returned only prose, so the values below were read from the
**computed `:root` and `.dark` CSS custom properties via Claude-in-Chrome**, then
resolved oklch → sRGB hex with a canvas paint (bulletproof conversion), on
**2026-06-22**. The site renders the `:root` (light "paper") scope by default;
the `.dark` scope is fully defined for dark mode.

### Palette — LIGHT (warmed "paper" — derived from `:root`)

> **WARMING PASS (2026-06-23).** On a real phone the site's literal `--background`
> (`#F4F0E8`) read as *white*. The light scope was deepened toward honey/tan so
> it reads like real paper, keeping black-ink contrast and the terracotta accent
> pop. The **in-app** light values are the "Warmed" column; the site's original
> tokens are kept for provenance. Dark/dim scope unchanged (already warm). Accent
> + text tokens unchanged.

| Role | Site hex (orig) | **Warmed (in-app)** | Notes |
|------|-----------------|---------------------|-------|
| Background (`contrast_0`) | `#F4F0E8` | **`#ECE2CD`** | honey paper; clearly off-white |
| Raised surface (`contrast_25`) | `#FAF6EF`/`#EFEADE` | **`#E7DCC4`** | subtle elevation (ALF darkens for elevation in light mode) |
| Secondary / muted surface (`contrast_50`) | `#E9E4DA` | **`#E1D5BB`** | |
| Input / border-low (`contrast_100`) | `#DDD6CE` | **`#D8C9AC`** | |
| Border / border-med (`contrast_200`) | `#CCC2B8` | **`#C8B89A`** | |
| Border-high (`contrast_300`) | `#B8AC9F` | **`#B4A484`** | |
| Rule / text-low (`contrast_400`) | `#A79D91` | **`#9E8E76`** | |
| Muted text / text-med (`contrast_700`) | `#5E534A` | **`#5A4E40`** | ≈6.3:1 on bg (AA) |
| Text / foreground (`contrast_975`) | `#1A1511` | `#1A1511` | unchanged |
| Text near-black (`contrast_1000`) | `#14110E` | `#14110E` | unchanged; ≈14.6:1 on bg (AAA) |
| **Accent (terracotta)** (`primary_500`) | `#C25F40` | `#C25F40` | unchanged; ≈3.3:1 on bg, white-on-accent ≈4.2:1 |
| Destructive (`negative_500`) | `#CC2827` | `#CC2827` | unchanged |
| Radius (`--radius`) | `0.25rem` | `0.25rem` | unchanged |

### Palette — DARK (`.dark`)

| Role | Hex |
|------|-----|
| Background | `#110C09` |
| Card / surface | `#1A1512` |
| Secondary / muted surface | `#29231E` |
| Text / foreground | `#F2EEE6` |
| Muted text | `#A79D91` |
| **Accent (terracotta orange)** | **`#D86B49`** |
| Border | `#38322D` |
| Input | `#2D2823` |
| Rule | `#4E4640` |
| Destructive | `#EA3D38` |

### Typography (from `document.fonts` + computed styles)

- **Display / headline:** **Fraunces** (serif), weights 300/400/500 + 400 italic.
  Headings render `font-family: Fraunces, "Times New Roman", serif; weight 400`.
- **Body / UI:** **Inter** (`body { font-family: Inter, system-ui, sans-serif }`).
- Also loaded: JetBrains Mono (code), Manrope (minor).

**Font handling (STEP 2 requirement) — UPDATED 2026-06-23: Fraunces bundled for real.**
- **Body = Inter is an exact match** — the One app already bundles Inter as its
  "theme" font (`assets/fonts/inter`), so AO body type is faithful out of the box.
- **Display = Fraunces is now BUNDLED + APPLIED to headline/name text** (not the
  old Georgia substitute). ALF's UI font is still global (`src/alf/fonts.ts`), so
  rather than swap the global body font to a serif, Fraunces is applied **per
  Text node** to the specific headline/title components, and only under the AO
  theme:
  - `src/alf/fonts-authority-one.ts` — `useAuthorityOneHeadingFont()` returns the
    `Fraunces` family when `themePack === 'authorityOne'`, else `undefined`.
  - `src/components/Typography.tsx` `Text` gained an inert `fontFamilyOverride`
    prop, applied *after* the global font pass (which would otherwise clobber any
    caller-set family) — no-op unless a caller passes it.
  - Applied at: the **profile display name** (`ProfileHeaderDisplayName`) and the
    shared **screen/section header title** (`Layout/Header` `TitleText`). The
    legacy `title-*` typography in `src/lib/themes-authority-one.ts` also points
    at `Fraunces`.
  - Registration: `expo-font` plugin in `app.config.js`, conditionally including
    `assets/fonts/fraunces/Fraunces.ttf` **only if present** (build-safe).
  - ⚠️ **The `.ttf` is NOT committed** — it could not be downloaded in the build
    sandbox (npm, GitHub, Google Fonts CDN all blocked). Drop the file in per
    `assets/fonts/fraunces/README.md` (Google Fonts → variable file → rename to
    `Fraunces.ttf`). Until then headlines fall back to system/serif; nothing
    breaks. Family name referenced: `Fraunces` (iOS PostScript family / Android
    file basename both resolve to `Fraunces`).

---

## STEP 2 / 3 — How it's wired (architecture)

The fork's ALF theme system only knows three `ThemeName`s (`light|dark|dim`,
fixed in the `@bsky.app/alf` package). Rather than patch `node_modules` or break
that contract, Authority One is a **brand pack overlay**: a new persisted pref
`themePack: 'default' | 'authorityOne'`. When `authorityOne` is active, the app
passes branded theme objects to the existing providers via the already-supported
`themesOverride` prop — so light/dark/dim still drive light/dark/dim, but render
with the AO palette. This is fully additive and reverts by flipping one pref.

```
themePack pref (persisted)
   │
   ├─ ALF provider   <Alf themesOverride={authorityOneThemes}>      ← src/alf/themes-authority-one.ts
   ├─ legacy provider <ThemeProvider themePack={themePack}>          ← src/lib/themes-authority-one.ts
   └─ web <html>      themepack--authorityOne class + theme-color    ← useColorModeTheme.ts
```

Switching is live because the pref flows through React context → re-render. No
restart, no reload.

---

## EXISTS-vs-CHANGED map

| Area | Status | Notes |
|------|--------|-------|
| `src/alf/themes.ts` (base light/dark/dim) | **EXISTS, untouched** | Base themes kept fully intact (incl. the earlier orange primary from the `spike` rebrand). Not reverted, not modified. |
| `@bsky.app/alf` package / `ThemeName` union | **EXISTS, untouched** | No node_modules patching. |
| `src/alf/themes-authority-one.ts` | **NEW** | AO ALF palettes + `createTheme` light/dark/dim, keyed to extracted tokens. |
| `src/lib/themes-authority-one.ts` | **NEW** | AO variants of the legacy `ThemeContext` themes (covers older `usePalette` consumers) + serif title substitution. |
| `src/alf/__tests__/themes-authority-one.test.ts` | **NEW** | Token-presence + additivity tests. |
| `src/state/persisted/schema.ts` | **CHANGED (+3)** | Added optional `themePack` enum + default `'default'`. |
| `src/state/shell/color-mode.tsx` | **CHANGED** | Added `themePack` state, `setThemePack`, persisted read/write/subscribe. |
| `src/lib/ThemeContext.tsx` | **CHANGED** | `ThemeProvider` accepts optional `themePack`; returns AO legacy themes when active. |
| `src/App.web.tsx` / `src/App.native.tsx` | **CHANGED** | Read `themePack`; pass `themesOverride` (ALF) + `themePack` (legacy) to providers. |
| `src/alf/util/useColorModeTheme.ts` | **CHANGED** | Threads `themePack` into the web `<html>` class + `theme-color` meta + bg resolution. |
| `src/screens/Settings/AppearanceSettings.tsx` | **CHANGED** | New "App theme: Default / Authority One" toggle at top of Appearance. |
| `src/alf/themes-authority-one.ts` (light scope) | **CHANGED (2026-06-23)** | Light palette warmed to honey/tan paper (bg `#ECE2CD`); dark/dim untouched. |
| `src/alf/fonts-authority-one.ts` | **NEW (2026-06-23)** | `useAuthorityOneHeadingFont()` — Fraunces family when AO theme active, else undefined. |
| `src/components/Typography.tsx` | **CHANGED (2026-06-23)** | `Text` gained inert `fontFamilyOverride` prop, applied after the global font pass. |
| `src/alf/typography.tsx` | **CHANGED (2026-06-23)** | `TextProps` gained optional `fontFamilyOverride`. |
| `src/screens/Profile/Header/DisplayName.tsx` | **CHANGED (2026-06-23)** | Profile display name uses Fraunces under AO theme. |
| `src/components/Layout/Header/index.tsx` | **CHANGED (2026-06-23)** | Shared header `TitleText` uses Fraunces under AO theme. |
| `src/lib/themes-authority-one.ts` (title typography) | **CHANGED (2026-06-23)** | Legacy `title-*` font → `Fraunces` (was Georgia/serif substitute). |
| `app.config.js` (expo-font) | **CHANGED (2026-06-23)** | Conditionally registers `assets/fonts/fraunces/Fraunces.ttf` if present. |
| `assets/fonts/fraunces/README.md` | **NEW (2026-06-23)** | Drop-in instructions for the (uncommitted) Fraunces `.ttf`. |

All existing themes, the appearance color-mode/dark-theme controls, fonts, and
font-scale controls are unchanged and keep working. The Fraunces application is
opt-in per Text node and gated on the AO theme, so the default theme renders
exactly as before.

---

## Files changed (this branch vs `spike`)

NEW:
- `src/alf/themes-authority-one.ts`
- `src/lib/themes-authority-one.ts`
- `src/alf/__tests__/themes-authority-one.test.ts`
- `AUTHORITY-ONE-THEME-TOKENS.md` (this doc)

MODIFIED:
- `src/state/persisted/schema.ts`
- `src/state/shell/color-mode.tsx`
- `src/lib/ThemeContext.tsx`
- `src/App.web.tsx`
- `src/App.native.tsx`
- `src/alf/util/useColorModeTheme.ts`
- `src/screens/Settings/AppearanceSettings.tsx`

---

## Tests — pass/fail

| Check | Result |
|-------|--------|
| `tsc --project tsconfig.check.json` on changed/new files | **PASS** — 0 errors in any AO file. (8 pre-existing errors remain, all in `src/lib/agent-runtime/__tests__/{approvals,tts}.test.ts` — fetch-mock typing, unrelated to this work.) |
| Jest `themes-authority-one.test.ts` (7 cases) | **PASS 7 / 7** — light/dark/dim present; warmed-light bg `#ECE2CD` + warm-paper guard; text/accent/border tokens; base themes not mutated. |
| Switcher option present | **PASS** — `AppearanceSettings` renders an "App theme" group with `default` + `authorityOne` items bound to `themePack`/`setThemePack`. |
| `app.config.js` loads + font filter | **PASS** — config evaluates; Fraunces filter returns `[]` when the `.ttf` is absent (build-safe). |
| WCAG contrast (warmed light) | **PASS (WCAG-ish)** — near-black text/bg ≈14.6:1 (AAA); muted text/bg ≈6.3:1 (AA); accent/bg ≈3.3:1 (large/UI, parity with site terracotta-on-cream); white/accent ≈4.2:1. |
| On-device visual + Fraunces face | **Not run — needs a native iOS build** (and the `.ttf` dropped in). Both changes are native-bundle changes. |

> Note: `npm run typecheck` uses `tsgo` (TypeScript native preview), whose binary
> isn't available in this Linux sandbox, so the standard `tsc` was used against
> the same `tsconfig.check.json`.

---

## How to demo

1. Build 4 → install on phone (or run web).
2. Settings → Appearance → **App theme → Authority One**. Chrome reskins live:
   warm paper/charcoal surfaces, terracotta accent on buttons/links/tabs.
3. Toggle **Color mode** light/dark to show the branded light & dark variants.
4. Flip back to **Default** to revert instantly.
