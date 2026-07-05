import {type ChatMessage} from '#/lib/agent-runtime'

/**
 * Was this GROUP-thread row sent by the CURRENT VIEWER? PURE + unit-tested.
 *
 * STRICT identity match only: the row's stamped senderId must be one of the
 * viewer's own identity strings (DID or handle, lowercased). Role NEVER decides
 * — treating every `role:'user'` row as the viewer's own is exactly the reported
 * bug where another member's messages render as "You" on the right. A row with
 * no senderId is NOT the viewer (the runtime attributes every group row; the
 * local echo of the viewer's own send is stamped with their DID at creation).
 *
 * Drives BOTH the "You" label and the right-alignment of group bubbles, so the
 * two can never disagree. 1:1 chat does not use this — there the only human is
 * the viewer and role-based alignment stays correct.
 */
export function isSelfSender(
  m: Pick<ChatMessage, 'senderId'>,
  selfIds: ReadonlySet<string>,
): boolean {
  return !!m.senderId && selfIds.has(m.senderId.toLowerCase())
}

/**
 * Attribution caption for one GROUP-thread message. PURE + unit-tested.
 *
 * "You" requires a STRICT identity match: the row's stamped senderId must be one
 * of the viewer's own identity strings (DID or handle). Role alone never decides
 * — labeling every `role:'user'` row "You" is exactly the reported bug where
 * another member's messages read as the viewer's own.
 *
 * A non-self USER row is another human: their stamped name, else a roster
 * lookup by senderId, else a neutral "Member" — never the agent's name. An
 * AGENT row keeps the runtime-supplied sender name (roster lookup, then the
 * thread's agent name once settled); a PENDING agent placeholder stays unnamed
 * until the runtime says who is replying.
 */
export function groupSenderLabel(
  m: Pick<ChatMessage, 'role' | 'senderId' | 'senderName' | 'pending'>,
  {
    selfIds,
    rosterName,
    agentName,
  }: {
    /** The viewer's identity strings (DID + handle), lowercased. */
    selfIds: ReadonlySet<string>
    /** Resolve a display name from the group roster by sender identity. */
    rosterName: (senderId?: string) => string | undefined
    /** The thread's resolved agent name (settled agent-row fallback). */
    agentName: string
  },
): string | undefined {
  if (isSelfSender(m, selfIds)) return 'You'
  if (m.role === 'user') {
    return m.senderName ?? rosterName(m.senderId) ?? 'Member'
  }
  if (m.pending && !m.senderName) return undefined
  return m.senderName ?? rosterName(m.senderId) ?? agentName
}
