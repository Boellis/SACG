import type { Timestamp } from 'firebase/firestore';
import type { Audience, EventType } from '../../lib/types';

// Client mirrors of the admin AI assistant's server shapes
// (functions/src/assistant: schemas.ts, history.ts, actions.ts, callables.ts).
// The server owns every write to these collections; the client only reads them
// and calls the callables in assistantApi.ts.

// ---------------------------------------------------------------------------
// Actions: what the assistant proposes and an admin approves
// ---------------------------------------------------------------------------

export type ActionType =
  | 'create_event'
  | 'update_event'
  | 'send_email'
  | 'post_announcement'
  | 'create_poll';

/** proposed → executing → executed; failures return to `proposed` with `error`. */
export type ActionStatus = 'proposed' | 'executing' | 'executed' | 'rejected' | 'failed';

/** `YYYY-MM-DDTHH:mm`, garden (America/Chicago) wall time, no zone. */
export type GardenLocal = string;

export interface CreateEventInput {
  title: string;
  type: EventType;
  start: GardenLocal;
  end: GardenLocal;
  allDay: boolean;
  location?: string;
  description?: string;
}

export interface UpdateEventInput {
  eventId: string;
  title?: string;
  type?: EventType;
  start?: GardenLocal;
  end?: GardenLocal;
  allDay?: boolean;
  location?: string;
  description?: string;
}

export interface SendEmailInput {
  audience: Audience;
  subject: string;
  body: string;
  /** Add personal RSVP links for exactly one event: an existing one, or one the
   *  assistant proposed in this thread (an action id that must be executed first). */
  rsvp?: { eventId?: string; eventActionId?: string };
}

export interface AnnouncementInput {
  title: string;
  body: string;
  pinned: boolean;
  /** `YYYY-MM-DD` (garden date). */
  expiresOn?: string;
}

export interface PollInput {
  question: string;
  options: string[];
  /** `YYYY-MM-DD` (garden date). */
  closesOn?: string;
}

/** One past test send of an email action. */
export interface ActionTest {
  at?: Timestamp;
  toName: string;
  jobId: string;
}

interface ActionBase {
  /** The action's document id (`assistantThreads/{threadId}/actions/{id}`). */
  id: string;
  summary: string;
  status: ActionStatus;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
  /** The model's `tool_use` block id that proposed this; links it to its message. */
  toolUseId: string;
  result?: Record<string, unknown>;
  error?: string;
  /**
   * When a run claimed the action ('executing'). A claim older than the server's
   * EXECUTE_LEASE_MS (2 minutes) belongs to a run that died, and the next `run`
   * call finishes the action, or runs it again, without doing anything twice.
   */
  claimedAt?: Timestamp;
  executedBy?: string;
  executedByName?: string;
  executedAt?: Timestamp;
  tests?: ActionTest[];
  /** Another action of this thread that must be `executed` first (the event an email links to). */
  dependsOn?: string;
}

export type CreateEventAction = ActionBase & { type: 'create_event'; input: CreateEventInput };
export type UpdateEventAction = ActionBase & { type: 'update_event'; input: UpdateEventInput };
export type SendEmailAction = ActionBase & { type: 'send_email'; input: SendEmailInput };
export type AnnouncementAction = ActionBase & { type: 'post_announcement'; input: AnnouncementInput };
export type PollAction = ActionBase & { type: 'create_poll'; input: PollInput };

export type AssistantAction =
  | CreateEventAction
  | UpdateEventAction
  | SendEmailAction
  | AnnouncementAction
  | PollAction;

// ---------------------------------------------------------------------------
// Threads and messages
// ---------------------------------------------------------------------------

/** `assistantThreads/{threadId}` */
export interface AssistantThread {
  id: string;
  title: string;
  createdBy: string;
  createdByName: string;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
  lastReplyPreview?: string;
}

export type MessageKind = 'user_text' | 'assistant' | 'tool_results' | 'app_note';

/** A "what I looked at" chip on an assistant message, e.g. "Checked the calendar". */
export interface ToolChip {
  name: string;
  label: string;
}

/** `assistantThreads/{threadId}/messages/{seq zero-padded to 6}` */
export interface AssistantMessage {
  id: string;
  seq: number;
  role: 'user' | 'assistant';
  kind: MessageKind;
  /** JSON of the Anthropic content blocks, echoed back to the model verbatim. */
  raw: string;
  display: { text: string; tools?: ToolChip[] };
  authorUid?: string;
  authorName?: string;
  createdAt?: Timestamp;
}

// ---------------------------------------------------------------------------
// Callables
// ---------------------------------------------------------------------------

export interface ChatUsage {
  turnsToday: number;
  limit: number;
}

/** `assistantChat` result. */
export interface ChatResult {
  threadId: string;
  reply: string;
  actionIds: string[];
  usage: ChatUsage;
}

/** `assistantExecuteAction` input. `overrides` replace fields of the proposal
 *  (shallow; `audience`/`rsvp` whole); `testMemberId` only applies to `mode: 'test'`. */
export interface ExecuteActionInput {
  threadId: string;
  actionId: string;
  mode: 'run' | 'test';
  overrides?: Record<string, unknown>;
  testMemberId?: string;
}

export interface ExecuteActionResult {
  status: string;
  result: Record<string, unknown>;
}
