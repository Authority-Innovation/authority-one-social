import {useCallback, useEffect, useRef, useState} from 'react'

import {postPhotoContext} from '#/lib/agent-runtime'
import {
  derivePhotoConclusion,
  localDayKey,
  shouldReadPhotos,
  summarizePhotos,
} from '#/lib/photoContext/derive'
import {
  type PhotoContextConclusion,
  type PhotoContextPrefs,
} from '#/lib/photoContext/types'
import {logger} from '#/logger'
import {useSession} from '#/state/session'
import {IS_NATIVE} from '#/env'
import {
  getPhotoPermission,
  photoMediaSupported,
  type PhotoPermission,
  queryTodaysPhotoMeta,
  requestPhotoPermission,
  resolvePlace,
} from './mediaQuery'
import {
  adoptLegacyPhotoData,
  DEFAULT_PHOTO_PREFS,
  loadLastConclusion,
  loadPhotoPrefs,
  saveLastConclusion,
  savePhotoPrefs,
} from './store'

let idSeq = 0
function newId(): string {
  return `ph_${Date.now().toString(36)}_${idSeq++}`
}

export interface UsePhotoContext {
  prefs: PhotoContextPrefs
  supported: boolean
  permission: PhotoPermission
  permissionGranted: boolean
  /** Enabled + permission — drives the active indicator and the read gate. */
  active: boolean
  scanning: boolean
  lastConclusion: PhotoContextConclusion | null
  setEnabled: (on: boolean) => void
  scanNow: () => void
}

/**
 * Photo Context controller. Owns the opt-in pref + last conclusion, requests LIMITED
 * photo permission on opt-in, and runs a scan (today's photo METADATA -> conclusion ->
 * local store + best-effort sync). Strictly gated: nothing is read unless enabled AND
 * permitted. Resilient: a missing endpoint / denied permission degrades gracefully.
 */
export function usePhotoContext(): UsePhotoContext {
  // SOC-01: all Photo Context data is scoped to the signed-in account. Screens using
  // this hook live under the per-DID keyed subtree, so they remount on a switch.
  const did = useSession().currentAccount?.did
  const [prefs, setPrefs] = useState<PhotoContextPrefs>(DEFAULT_PHOTO_PREFS)
  const [permission, setPermission] = useState<PhotoPermission>('unavailable')
  const [lastConclusion, setLastConclusion] =
    useState<PhotoContextConclusion | null>(null)
  const [scanning, setScanning] = useState(false)

  const supported = IS_NATIVE && photoMediaSupported()
  const permissionGranted = permission === 'granted' || permission === 'limited'
  const active = shouldReadPhotos({enabled: prefs.enabled, permissionGranted})

  // Latest values for async callbacks (no stale closures).
  const prefsRef = useRef(prefs)
  useEffect(() => {
    prefsRef.current = prefs
  }, [prefs])
  const permRef = useRef(permission)
  useEffect(() => {
    permRef.current = permission
  }, [permission])
  const scanningRef = useRef(false)

  const scanNow = useCallback(() => {
    void (async () => {
      const granted =
        permRef.current === 'granted' || permRef.current === 'limited'
      // THE GATE: nothing is read unless enabled AND permitted.
      if (
        !shouldReadPhotos({
          enabled: prefsRef.current.enabled,
          permissionGranted: granted,
        })
      ) {
        return
      }
      if (scanningRef.current) return
      scanningRef.current = true
      setScanning(true)
      try {
        const photos = await queryTodaysPhotoMeta()
        const summary = summarizePhotos(photos)
        let place
        let placeRef
        if (summary.centroid) {
          const resolved = await resolvePlace(summary.centroid)
          place = resolved?.place
          placeRef = resolved?.placeRef
        }
        const conclusion = derivePhotoConclusion({
          photos,
          dayKey: localDayKey(new Date()),
          id: newId(),
          place,
          placeRef,
        })
        if (conclusion) {
          setLastConclusion(conclusion)
          await saveLastConclusion(did, conclusion)
          void postPhotoContext(conclusion) // best-effort sync; no-ops if unreachable
        }
      } catch (e) {
        logger.warn('photoContext: scan failed', {safeMessage: String(e)})
      } finally {
        scanningRef.current = false
        setScanning(false)
      }
    })()
  }, [did])

  // Mount: load prefs + last conclusion; check permission; auto-scan when active.
  useEffect(() => {
    let cancelled = false
    void (async () => {
      await adoptLegacyPhotoData(did)
      const [p, last] = await Promise.all([
        loadPhotoPrefs(did),
        loadLastConclusion(did),
      ])
      if (cancelled) return
      setPrefs(p)
      setLastConclusion(last)
      if (supported && p.enabled) {
        const perm = await getPhotoPermission()
        if (cancelled) return
        setPermission(perm)
      }
    })()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount-only
  }, [])

  const setEnabled = useCallback(
    (on: boolean) => {
      void (async () => {
        if (on && supported) {
          const perm = await requestPhotoPermission()
          setPermission(perm)
        }
        const next: PhotoContextPrefs = {enabled: on}
        setPrefs(next)
        await savePhotoPrefs(did, next)
        if (on) scanNow() // scan right after enabling
      })()
    },
    [did, supported, scanNow],
  )

  return {
    prefs,
    supported,
    permission,
    permissionGranted,
    active,
    scanning,
    lastConclusion,
    setEnabled,
    scanNow,
  }
}
