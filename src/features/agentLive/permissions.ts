/**
 * Mic and camera access for a live session, asked BEFORE anything is created
 * on the runtime (no session for a person who said no) and before the camera
 * token is requested. The system prompt shows once; after a "don't allow" the
 * screen offers Settings instead.
 */
import {Camera} from 'expo-camera'

export type MediaAccess = 'granted' | 'denied'

export async function requestMicAccess(): Promise<MediaAccess> {
  try {
    const r = await Camera.requestMicrophonePermissionsAsync()
    return r.granted ? 'granted' : 'denied'
  } catch {
    return 'denied'
  }
}

export async function requestCameraAccess(): Promise<MediaAccess> {
  try {
    const r = await Camera.requestCameraPermissionsAsync()
    return r.granted ? 'granted' : 'denied'
  } catch {
    return 'denied'
  }
}
