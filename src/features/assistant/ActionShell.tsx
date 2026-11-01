import { useId, useRef, useState, type ComponentProps, type ReactNode, type TextareaHTMLAttributes } from 'react';
import { Badge, Button, Field } from '../../components/ui';
import { executeAssistantAction, rejectAssistantAction } from './assistantApi';
import { errorText } from './errors';
import type { Member } from '../../lib/types';
import type { AssistantAction, ExecuteActionInput, ExecuteActionResult } from './types';

/** What every card receives. */
export interface CardProps<A extends AssistantAction = AssistantAction> {
  threadId: string;
  action: A;
  members: Member[];
  /** The signed-in admin. */
  me: Member;
  /**
   * The conversation's live action list. A card that depends on another action
   * (an email linking to a proposed event) reads that action's status here.
   */
  actions?: AssistantAction[];
}

// ---------------------------------------------------------------------------
// Running an action
// ---------------------------------------------------------------------------

export interface ActionRunner {
  /** A call is in flight. */
  busy: boolean;
  /** A run or reject went through; the card now waits for its live status to change. */
  locked: boolean;
  /** The last failure, in words an admin can act on. */
  error: string;
  /** Approve (`run`) or test-send (`test`). Resolves to the server's answer, or null if it failed. */
  execute: (input: Pick<ExecuteActionInput, 'mode' | 'overrides' | 'testMemberId'>) => Promise<ExecuteActionResult | null>;
  reject: () => Promise<void>;
}

/**
 * Calls for one action. Only one is ever in flight (a double click is ignored
 * before React re-renders), and after a successful run or reject the card stays
 * locked until the server's status arrives, so the same action can't be sent
 * twice. The server enforces that too; this keeps the UI from asking.
 */
export function useActionRunner(threadId: string, actionId: string): ActionRunner {
  const [busy, setBusy] = useState(false);
  const [locked, setLocked] = useState(false);
  const [error, setError] = useState('');
  const inFlight = useRef(false);

  async function guarded<T>(call: () => Promise<T>, lockOnSuccess: boolean, failure: string): Promise<T | null> {
    if (inFlight.current) return null;
    inFlight.current = true;
    setBusy(true);
    setError('');
    try {
      const out = await call();
      if (lockOnSuccess) setLocked(true);
      return out;
    } catch (err) {
      setError(errorText(err, failure));
      return null;
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  return {
    busy,
    locked,
    error,
    execute: (input) => {
      const call: ExecuteActionInput = { threadId, actionId, mode: input.mode };
      if (input.overrides && Object.keys(input.overrides).length > 0) call.overrides = input.overrides;
      if (input.testMemberId) call.testMemberId = input.testMemberId;
      return guarded(() => executeAssistantAction(call), input.mode === 'run', "Couldn't complete that. Please try again.");
    },
    reject: async () => {
      await guarded(() => rejectAssistantAction(threadId, actionId), true, "Couldn't reject that. Please try again.");
    },
  };
}

// ---------------------------------------------------------------------------
// Pieces shared by the cards
// ---------------------------------------------------------------------------

function StatusBadge({ action }: { action: AssistantAction }) {
  switch (action.status) {
    case 'proposed':
      return <Badge color="blue">Proposed</Badge>;
    case 'executing':
      return <Badge color="amber">Sending…</Badge>;
    case 'executed':
      return <Badge color="green">Done</Badge>;
    case 'rejected':
      return <Badge color="gray">Rejected</Badge>;
    case 'failed':
      return <Badge color="red">{`Failed: ${action.error || 'unknown error'}`}</Badge>;
    default:
      return <Badge color="gray">{String(action.status)}</Badge>;
  }
}

/** Label + value rows. Values are text, shown as written (line breaks kept, nothing parsed). */
export function Facts({ rows }: { rows: Array<[label: string, value: ReactNode]> }) {
  return (
    <dl className="grid grid-cols-[6.5rem_minmax(0,1fr)] gap-x-3 gap-y-1.5 text-sm">
      {rows.map(([label, value]) => (
        <div key={label} className="contents">
          <dt className="text-gray-500">{label}</dt>
          <dd className="min-w-0 text-gray-900 whitespace-pre-wrap break-words">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

/** `Field` with an id of its own, so several cards on one page never share a label target. */
export function TextField(props: ComponentProps<typeof Field>) {
  const id = useId();
  return <Field {...props} id={props.id ?? id} />;
}

export function TextAreaField({
  label,
  rows = 4,
  className = '',
  ...rest
}: { label: string } & TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-sm font-medium text-gray-700">
        {label}
      </label>
      <textarea
        id={id}
        rows={rows}
        className={`border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-garden-500 ${className}`}
        {...rest}
      />
    </div>
  );
}

export function ProblemText({ children }: { children: ReactNode }) {
  return <p className="text-xs text-red-600">{children}</p>;
}

// ---------------------------------------------------------------------------
// The card frame
// ---------------------------------------------------------------------------

export interface ActionShellProps {
  /** Kind of proposal, e.g. "Calendar event". */
  label: string;
  action: AssistantAction;
  runner: ActionRunner;
  editing: boolean;
  onToggleEdit: () => void;
  approveLabel: string;
  onApprove: () => void;
  /** Approve is off for a reason the card should state (shown beneath the buttons). */
  blockedReason?: string;
  /** Approve is off because the edits aren't valid; the card shows what is wrong itself. */
  invalid?: boolean;
  /** The proposal itself. */
  children: ReactNode;
  /** Controls that belong to an open proposal only (the email card's test send). */
  extra?: ReactNode;
  /** What happened, once it has run. */
  done?: ReactNode;
}

/**
 * Frame for one proposal: kind, summary and status badge on top, then the
 * card's own content, then Edit / Reject / Approve while it is still open.
 * Once it has run, was rejected or is running, there are no buttons.
 */
export function ActionShell({
  label,
  action,
  runner,
  editing,
  onToggleEdit,
  approveLabel,
  onApprove,
  blockedReason,
  invalid,
  children,
  extra,
  done,
}: ActionShellProps) {
  const open = action.status === 'proposed';
  const frozen = runner.busy || runner.locked;

  return (
    <div className="w-full max-w-2xl space-y-3 rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wide text-garden-700">{label}</p>
          <p className="text-sm font-medium text-gray-900 whitespace-pre-wrap break-words">{action.summary}</p>
        </div>
        <StatusBadge action={action} />
      </div>

      {children}

      {open && action.error && (
        <p className="text-xs text-red-600 whitespace-pre-wrap break-words">Last attempt failed: {action.error}</p>
      )}

      {action.status === 'executed' && (
        <div className="space-y-1 border-t border-gray-100 pt-3 text-sm text-gray-700">
          {done}
          {action.executedByName && <p className="text-xs text-gray-500">Approved by {action.executedByName}</p>}
        </div>
      )}

      {open && extra}

      {runner.error && (
        <p role="alert" className="text-xs text-red-600 whitespace-pre-wrap break-words">
          {runner.error}
        </p>
      )}

      {open && (
        <div className="space-y-2 border-t border-gray-100 pt-3">
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="ghost" disabled={frozen} onClick={onToggleEdit}>
              {editing ? 'Done editing' : 'Edit'}
            </Button>
            <Button variant="ghost" disabled={frozen} onClick={() => void runner.reject()}>
              Reject
            </Button>
            <Button
              className="ml-auto"
              disabled={frozen || invalid || Boolean(blockedReason)}
              title={blockedReason}
              onClick={onApprove}
            >
              {approveLabel}
            </Button>
          </div>
          {blockedReason && <p className="text-right text-xs text-amber-700">{blockedReason}</p>}
        </div>
      )}
    </div>
  );
}
