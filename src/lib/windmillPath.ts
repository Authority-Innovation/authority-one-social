/**
 * Authority One brand mark — the black ink-brush WINDMILL.
 *
 * Single fillable path (4 sub-paths: hill, sails+hub, upper-right sail, tower),
 * authored on a 0 0 64 64 grid. Auto-traced from the source artwork
 * (assets/app-icons brush windmill) via cv2 contour trace on 2026-06-23, then
 * normalized + simplified. Replaces the leftover Bluesky butterfly / the interim
 * varsity "1" mark.
 *
 * Render with a single `fill` (it takes the icon color); transparent background
 * so it sits on any surface. The raster brush artwork is used for the app icon
 * and splash images where full brush fidelity matters; this vector is used where
 * the mark must scale and take a theme color (nav, headers, loading, the splash
 * bloom). NOTE: a future hand-refined SVG (smoother brush edges) can drop in
 * here without touching call sites.
 */
export const WINDMILL_VIEWBOX = '0 0 64 64'

export const WINDMILL_PATH =
  'M3.42 56.52 L30.74 51.77 L49.33 53.28 L46.25 52.27 L60.58 55.13 L49.61 51.54 L35 49.97 L34.32 42.86 L31.69 43.48 L31.47 49.97 L25.48 50.37 L29.06 35.02 L28.5 31.33 L24.24 50.48Z M18.76 9.04 L18.7 10.44 L32.03 22.87 L32.14 25 L22.12 33.74 L22.01 32.56 L18.37 35.08 L19.65 34.52 L21.45 37.82 L32.53 25.56 L35 25.39 L44.51 36.09 L42.33 34.8 L44.68 37.99 L47.82 36.7 L35.33 25.22 L35.05 22.48 L32.31 22.37 L23.8 11.34 L29.23 16.32 L22.51 7.87Z M47.76 10.05 L46.98 10.5 L46.92 10.05 L37.01 19.18 L35.33 21.03 L36 21.42 L35.72 21.87 L36.34 21.87 L46.64 14.03 L45.8 15.48 L48.32 13.52 L48.88 13.41 L48.49 13.91 L49.44 13.69 L48.83 13.13 L49.05 12.57 L48.43 12.63 L48.43 11.06 L46.81 11.73 L47.2 11.17 L46.87 10.95Z M37.29 30.82 L37.91 36.76 L40.54 48.8 L41.32 49.41 L41.21 46.45 L42.11 49.58 L39.14 34.8Z'
