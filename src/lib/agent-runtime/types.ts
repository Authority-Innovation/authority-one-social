// Wire types for the agent runtime's POST /app/chat endpoint.
//
// AUTHORITATIVE SOURCE: pilot-agent-runtime/APP-CHANNEL.md. The runtime speaks two
// shapes from the SAME route:
//
//   SSE (Accept: text/event-stream) — the event NAME is on the SSE `event:` line and
//   the `data:` line is a bare JSON object WITHOUT a `type` field:
//       event: chunk
//       data: {"delta":"First sentence. "}
//       event: done
//       data: {"message":"…full reply…","status":"drafted","pending":[…],"mediaUrls":[]}
//
//   JSON (default) — one object: {message, status, pending, mediaUrls}.
//
// NB: an earlier version of this file ASSUMED each `data:` line carried its own
// `{type:'text'|'done'|…}` discriminator. The runtime never sends that, which is why
// the parser matched nothing and the assistant bubble rendered empty. Keyed on the
// `event:` name now.

export type ChatRole = 'user' | 'assistant'

/**
 * Origin channel a stored turn came in on (runtime `mem:conversation` tag, surfaced
 * by GET /app/history). The window is cross-channel, so a turn may have originated on
 * SMS/WhatsApp/voice rather than in-app text. 'app' = in-app text (renders with NO
 * badge). Unknown/missing tags are treated as 'app' by the runtime before they reach
 * here, but the union stays open (string) so a new runtime channel never breaks parse.
 */
export type ChatChannel =
  | 'app'
  | 'sms'
  | 'whatsapp'
  | 'voice'
  | 'imessage'
  | (string & {})

/** Terminal status of a turn, from the runtime's `done`/JSON payload. */
export type ChatTurnStatus =
  | 'answered'
  | 'drafted'
  | 'not-done'
  | 'paused'
  | 'error'

export interface ChatMessage {
  id: string
  role: ChatRole
  text: string
  /** Approval actions attached to an assistant turn, rendered as buttons. */
  actions?: ApprovalAction[]
  /** True while an assistant message is still streaming. */
  pending?: boolean
  /** Terminal status reported by the runtime once the turn settles. */
  status?: ChatTurnStatus
  /** Image URLs the turn generated, if any (runtime `mediaUrls`). */
  mediaUrls?: string[]
  /**
   * Origin channel of the turn (from GET /app/history). Undefined for turns created
   * live in this session (always in-app text). 'app' and undefined both render with
   * NO channel badge; sms/whatsapp/voice/imessage get an unobtrusive annotation.
   */
  channel?: ChatChannel
  createdAt: number
}

/**
 * One turn from GET /app/history (the runtime's per-owner rolling conversation
 * window). Cross-channel: `channel` says where the turn originated. `role` is the
 * runtime's storage role ('agent', not 'assistant') — the client maps it to the app's
 * ChatRole when hydrating. See pilot-agent-runtime APP-CHANNEL.md.
 */
export interface HistoryEntry {
  role: 'user' | 'agent'
  text: string
  channel: ChatChannel
  mediaUrls: string[]
  at: string | null
}

/**
 * A human-approval action returned by the runtime (e.g. "send this email",
 * "create this calendar event"). The app renders these as Approve / Reject buttons
 * and posts the decision back. The runtime's structural write-gate means nothing
 * executes until the user approves.
 */
export interface ApprovalAction {
  /** Stable id used when posting the decision back. */
  id: string
  /** Machine kind, e.g. "email.send", "calendar.create". */
  kind: string
  /** Human-readable summary to show on the card. */
  title: string
  /** Optional longer detail (recipient, time, body preview…). */
  detail?: string
  /** Optional structured preview the UI may render (kept opaque here). */
  preview?: Record<string, unknown>
}

export type ApprovalDecision = 'approve' | 'reject'

// ── Runtime wire payloads (APP-CHANNEL.md) ──────────────────────────────────

/**
 * One queued action in the runtime's `pending` array (the shape the runtime
 * actually sends). Distinct from `ApprovalAction`, which is the app-facing UI type
 * the cards render; `chatClient` maps one to the other.
 */
export interface PendingAction {
  id: string
  kind: string
  /** Human-readable summary of the action (maps to ApprovalAction.title). */
  summary: string
  /** Short button/label hint. */
  label?: string
  /** Opaque reference (e.g. draft id / target) the runtime echoes back. */
  ref?: string
  createdAt?: string | number
}

/**
 * The terminal `done` SSE payload AND the non-streaming JSON body — byte-identical
 * per APP-CHANNEL.md. `message` is the AUTHORITATIVE final reply (it may differ from
 * the concatenated chunks: the anti-confabulation guard can replace it and the
 * approval decoration appends to it).
 */
export interface ChatTurnResult {
  message: string
  status: ChatTurnStatus
  pending: PendingAction[]
  mediaUrls: string[]
}

/** The `chunk` SSE payload: one incremental slice of the reply. */
export interface ChunkEventData {
  delta: string
}

export interface SendMessageRequest {
  /** The user's new message. */
  text: string
  /** Prior turns for context (runtime also keeps its own memory; this is belt-and-braces). */
  history?: {role: ChatRole; text: string}[]
  /** Which agent to talk to, e.g. "ada". Defaults server-side if omitted. */
  agent?: string
}
