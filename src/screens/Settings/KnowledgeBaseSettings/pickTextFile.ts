import * as DocumentPicker from 'expo-document-picker'

import {type KnowledgeFileToUpload} from '#/lib/agent-runtime'

/** Native (iOS/Android) supports picking a text document via expo-document-picker. */
export const KNOWLEDGE_PICKER_SUPPORTED = true

function guessMime(name: string): string {
  const n = name.toLowerCase()
  if (n.endsWith('.pdf')) return 'application/pdf'
  if (n.endsWith('.csv')) return 'text/csv'
  if (n.endsWith('.md') || n.endsWith('.markdown')) return 'text/markdown'
  return 'text/plain'
}

/**
 * Read a local document URI into a Blob. Uses XMLHttpRequest rather than `fetch()`
 * because Android's `fetch()` cannot read `file://` URIs (same reason as
 * `readImageBlob` in `#/lib/agent-runtime/imageUploadClient`). Works for file://
 * and content:// URIs on iOS and Android.
 */
function readFileBlob(uri: string): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.onload = () => resolve(xhr.response as Blob)
    xhr.onerror = () => reject(new Error('Failed to read picked file'))
    xhr.responseType = 'blob'
    xhr.open('GET', uri, true)
    xhr.send(null)
  })
}

/**
 * Open the system document picker for a single document and resolve it as raw
 * bytes (a Blob) plus its name/mime/size — the same contract as the web picker.
 * Resolves null if the user cancels. The MIME filter is a first-pass only
 * (Android content resolvers are loose about .md/.csv types, so `text/*` keeps
 * real text files pickable); the runtime re-validates format and content.
 * PDFs are supported and travel as raw binary (never decoded to text).
 */
export async function pickTextFile(): Promise<KnowledgeFileToUpload | null> {
  const result = await DocumentPicker.getDocumentAsync({
    type: [
      'text/plain',
      'text/markdown',
      'text/csv',
      'text/*',
      'application/pdf',
    ],
    multiple: false,
    // Copy content:// documents into our cache so the XHR read below always
    // has a directly readable URI (Android SAF URIs can be single-use).
    copyToCacheDirectory: true,
  })
  if (result.canceled || result.assets.length === 0) return null
  const asset = result.assets[0]
  const blob = await readFileBlob(asset.uri)
  const mime =
    asset.mimeType && asset.mimeType !== 'application/octet-stream'
      ? asset.mimeType
      : guessMime(asset.name)
  return {
    blob,
    name: asset.name,
    mime,
    size: asset.size ?? blob.size,
  }
}
