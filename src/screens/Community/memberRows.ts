/**
 * Pure: no React, no I/O. Kept apart from PostsSection so it is testable on its own.
 */
/** One row of the members timeline, read defensively from the door's items. */
export type MemberPostRowData = {
  id: string
  text: string
  createdAt: string
  authorName: string
  author: {did?: string; is_agent?: boolean; avatar?: string}
}

function str(v: unknown): string | undefined {
  return typeof v === 'string' && v.trim().length > 0 ? v : undefined
}

/**
 * The door's timeline pages are `{items, cursor}` (communitiesClient
 * getTimeline); each item is `{id, parentId, authorId, text, createdAt,
 * is_agent, author: {did, is_agent}}`. Anything malformed (not an object, no
 * string id) is skipped, never rendered and never allowed to throw. A legacy
 * `posts`/`body`/`displayName` shape is still read, in case an older runtime
 * answers.
 */
export function toMemberPostRows(pages: unknown): MemberPostRowData[] {
  if (!Array.isArray(pages)) return []
  const rows: MemberPostRowData[] = []
  const seen = new Set<string>()
  for (const page of pages) {
    if (typeof page !== 'object' || page === null) continue
    const p = page as {items?: unknown; posts?: unknown}
    const list = Array.isArray(p.items)
      ? p.items
      : Array.isArray(p.posts)
        ? p.posts
        : []
    for (const item of list) {
      if (typeof item !== 'object' || item === null) continue
      const it = item as Record<string, unknown>
      const id = str(it.id)
      if (!id || seen.has(id)) continue
      seen.add(id)
      const rawAuthor =
        typeof it.author === 'object' && it.author !== null
          ? (it.author as Record<string, unknown>)
          : {}
      rows.push({
        id,
        text: str(it.text) ?? str(it.body) ?? '',
        createdAt: str(it.createdAt) ?? '',
        authorName:
          str(rawAuthor.displayName) ??
          str(rawAuthor.handle) ??
          str(it.authorId) ??
          '',
        author: {
          did: str(rawAuthor.did),
          is_agent: rawAuthor.is_agent === true,
          avatar: str(rawAuthor.avatar),
        },
      })
    }
  }
  return rows
}
