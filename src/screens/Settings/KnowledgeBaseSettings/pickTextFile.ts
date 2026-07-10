import {type KnowledgeFileToUpload} from '#/lib/agent-runtime'

/**
 * Native fallback. The app has no document picker dependency yet (only
 * expo-image-picker, which is image/video-only), so uploading a text file into the
 * knowledge base is web-only for v1. The screen reads KNOWLEDGE_PICKER_SUPPORTED and
 * shows an honest "use the web app for now" notice on native instead of a dead button.
 * FOLLOW-UP: add expo-document-picker and implement a native picker here.
 */
export const KNOWLEDGE_PICKER_SUPPORTED = false

export function pickTextFile(): Promise<KnowledgeFileToUpload | null> {
  return Promise.resolve(null)
}
