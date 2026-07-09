import {type KnowledgeFileToUpload} from '#/lib/agent-runtime'

/** Web supports picking a local text file via a hidden <input type="file">. */
export const KNOWLEDGE_PICKER_SUPPORTED = true

function guessMime(name: string): string {
  const n = name.toLowerCase()
  if (n.endsWith('.csv')) return 'text/csv'
  if (n.endsWith('.md') || n.endsWith('.markdown')) return 'text/markdown'
  return 'text/plain'
}

/**
 * Open the browser file picker for a single text document and resolve the picked
 * file as raw bytes (a Blob) plus its name/mime/size. Resolves null if the user
 * cancels. Accepts .txt/.md/.csv (the formats the runtime ingests today); the
 * runtime re-validates the type, so this is only a first-pass filter.
 */
export function pickTextFile(): Promise<KnowledgeFileToUpload | null> {
  return new Promise(resolve => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.txt,.md,.markdown,.csv,text/plain,text/markdown,text/csv'
    let settled = false
    const done = (v: KnowledgeFileToUpload | null) => {
      if (settled) return
      settled = true
      resolve(v)
    }
    input.onchange = () => {
      const file = input.files?.[0]
      if (!file) return done(null)
      done({
        blob: file,
        name: file.name,
        mime: file.type || guessMime(file.name),
        size: file.size,
      })
    }
    // Modern browsers fire `cancel` when the dialog is dismissed with no selection.
    input.oncancel = () => done(null)
    input.click()
  })
}
