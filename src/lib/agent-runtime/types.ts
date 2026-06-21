// Wire types for the agent runtime's POST /app/chat streaming endpoint.
//
// The runtime streams Server-Sent Events. Each `data:` line is one JSON object of
// `ChatStreamEvent`. The contract below is what the parallel runtime task is building to;
// any field whose shape is still in flux is marked. See VOICE-CHAT-INTEGRATION.md.

export type ChatRole = 'user' | 'assistant'

export interface ChatMessage {
  id: string
  role: ChatRole
  text: string
  /** Approval actions attached to an assistant turn, rendered as buttons. */
  actions?: ApprovalAction[]
  /** True while an assistant message is still streaming. */
  pending?: boolean
  createdAt: number
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

// ── Streamed events ──────────────────────────────────────────────────────────

/** Incremental assistant text. Concatenate `delta` to build the reply. */
export interface TextDeltaEvent {
  type: 'text'
  delta: string
}

/** One or more approval actions for the current assistant turn. */
export interface ActionsEvent {
  type: 'actions'
  actions: ApprovalAction[]
}

/** Terminal event for a turn. `messageId` is the assistant message's server id. */
export interface DoneEvent {
  type: 'done'
  messageId?: string
}

/** Server-reported error mid-stream. */
export interface ErrorEvent {
  type: 'error'
  message: string
}

export type ChatStreamEvent =
  | TextDeltaEvent
  | ActionsEvent
  | DoneEvent
  | ErrorEvent

export interface SendMessageRequest {
  /** The user's new message. */
  text: string
  /** Prior turns for context (runtime also keeps its own memory; this is belt-and-braces). */
  history?: {role: ChatRole; text: string}[]
  /** Which agent to talk to, e.g. "ada". Defaults server-side if omitted. */
  agent?: string
}
