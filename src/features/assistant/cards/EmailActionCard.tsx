import { useEffect, useState, type ReactNode } from 'react';
import { EmailJobProgress } from '../../../components/EmailJobProgress';
import { MemberPicker } from '../../../components/MemberPicker';
import { Button } from '../../../components/ui';
import { listenEvents, listenRsvps } from '../../calendar/eventsApi';
import {
  ActionShell,
  Facts,
  ProblemText,
  TextAreaField,
  TextField,
  useActionRunner,
  type CardProps,
} from '../ActionShell';
import { audienceRecipientCount, describeAudience } from '../audience';
import { changedFields } from '../overrides';
import type { GardenEvent, Member, Rsvp } from '../../../lib/types';
import type { SendEmailAction } from '../types';

const plural = (n: number) => `${n} member${n === 1 ? '' : 's'}`;

/** The server's cap on an email body (SendEmailInput.body). */
const MAX_BODY_CHARS = 20_000;

const TOKEN = /(\{firstName\}|\{name\}|\{rsvpLink\})/;

/** The draft as written, with each merge field shown as a pill. Text only: nothing is parsed as HTML. */
function BodyPreview({ text }: { text: string }) {
  return (
    <div className="max-h-64 overflow-y-auto rounded-lg bg-gray-50 p-3 font-mono text-xs text-gray-800 whitespace-pre-wrap break-words">
      {text.split(TOKEN).map((part, i) =>
        i % 2 === 1 ? (
          <span key={i} className="mx-0.5 inline-block rounded bg-garden-100 px-1.5 py-0.5 text-garden-700">
            {part}
          </span>
        ) : (
          part
        ),
      )}
    </div>
  );
}

/** Who a test goes to by default: me, or (if I can't receive email) the first member who can. */
function defaultTestRecipient(members: Member[], me: Member): string {
  const emailable = members.filter((m) => m.status === 'active' && (m.email ?? '').trim() !== '');
  if (emailable.length === 0 || emailable.some((m) => m.id === me.id)) return me.id;
  return [...emailable].sort((a, b) => (a.displayName ?? '').localeCompare(b.displayName ?? ''))[0].id;
}

const jobIdOf = (result: Record<string, unknown> | undefined): string | null =>
  typeof result?.jobId === 'string' && result.jobId ? result.jobId : null;

interface ShownTest {
  jobId: string | null;
  toName: string;
}

/**
 * An email to members. It shows who gets it and how many, the draft, and which
 * event's RSVP links it carries. The admin can test-send it to one member
 * first, then approve it for everyone behind a "can't be undone" prompt. The
 * real send waits for the event it links to when that event is still only
 * proposed.
 */
export default function EmailActionCard({ threadId, action, members, me, actions }: CardProps<SendEmailAction>) {
  const runner = useActionRunner(threadId, action.id);
  const { input } = action;
  const [editing, setEditing] = useState(false);
  const [subject, setSubject] = useState(input.subject);
  const [body, setBody] = useState(input.body);
  const [testId, setTestId] = useState(() => defaultTestRecipient(members, me));
  const [localTests, setLocalTests] = useState<ShownTest[]>([]);
  const isEditing = editing && action.status === 'proposed';

  // Answers to the event an `event_rsvp` audience points at: needed to count who it reaches.
  const answersEventId = input.audience.kind === 'event_rsvp' ? input.audience.eventId : null;
  const [rsvps, setRsvps] = useState<Rsvp[] | null>(null);
  useEffect(() => {
    setRsvps(null);
    if (answersEventId) return listenRsvps(answersEventId, setRsvps);
  }, [answersEventId]);

  // The title of an existing event whose RSVP links go in the email.
  const linkedEventId = input.rsvp?.eventId;
  const [events, setEvents] = useState<GardenEvent[] | null>(null);
  useEffect(() => {
    if (linkedEventId) return listenEvents(setEvents);
  }, [linkedEventId]);

  const count = audienceRecipientCount(input.audience, members, rsvps);

  // The proposed event this email links to, and so waits for.
  const eventActionId = action.dependsOn ?? input.rsvp?.eventActionId;
  const eventAction = eventActionId ? actions?.find((a) => a.id === eventActionId) : undefined;
  let eventTitle: string | undefined;
  if (eventAction?.type === 'create_event') {
    const created = eventAction.result?.title; // what the event was actually called, if the admin renamed it
    eventTitle = typeof created === 'string' ? created : eventAction.input.title;
  } else if (linkedEventId) {
    eventTitle = events?.find((e) => e.id === linkedEventId)?.title;
  }

  let blockedReason: string | undefined;
  if (eventActionId && eventAction?.status !== 'executed') {
    blockedReason =
      eventAction?.status === 'rejected'
        ? "The event was rejected, so this email can't link to it."
        : 'Approve the event first';
  } else if (count === null) {
    blockedReason = 'Counting recipients…';
  } else if (count === 0) {
    blockedReason = 'No active members with an email address match this audience.';
  }

  const edited = { subject: subject.trim(), body };
  const overrides = changedFields({ subject: input.subject, body: input.body }, edited, ['subject', 'body']);
  const problem = !edited.subject
    ? 'Add a subject.'
    : !edited.body.trim()
      ? 'Write a message.'
      : edited.body.length > MAX_BODY_CHARS
        ? `The message is too long (${edited.body.length.toLocaleString('en-US')} of ${MAX_BODY_CHARS.toLocaleString('en-US')} characters).`
        : null;

  async function sendTest() {
    const res = await runner.execute({ mode: 'test', testMemberId: testId, overrides });
    if (!res) return;
    const toName = members.find((m) => m.id === testId)?.displayName ?? 'the chosen member';
    setLocalTests((prev) => [...prev, { jobId: jobIdOf(res.result), toName }]);
  }

  async function approve() {
    if (count === null || count === 0) return;
    if (!window.confirm(`Send this email to ${plural(count)}? This can't be undone.`)) return;
    await runner.execute({ mode: 'run', overrides });
  }

  // Tests already recorded on the action, plus the one just made if its record hasn't arrived yet.
  const recorded: ShownTest[] = (action.tests ?? []).map((t) => ({ jobId: t.jobId || null, toName: t.toName }));
  const shownTests = [
    ...recorded,
    ...localTests.filter((t) => t.jobId === null || !recorded.some((r) => r.jobId === t.jobId)),
  ];

  const sentJobId = jobIdOf(action.result);
  const skipped = typeof action.result?.skipped === 'number' ? action.result.skipped : 0;

  // "Everyone" is only true for the all-members audience; otherwise say who it really goes to.
  const approveLabel =
    input.audience.kind === 'all_active'
      ? 'Approve & send to everyone'
      : count
        ? `Approve & send to ${plural(count)}`
        : 'Approve & send';

  const rows: Array<[string, ReactNode]> = [
    [
      'To',
      <>
        <span>{describeAudience(input.audience)}</span>
        {count !== null && <span className="ml-1.5 text-gray-500">{`(${count} recipient${count === 1 ? '' : 's'})`}</span>}
      </>,
    ],
  ];
  if (!isEditing) rows.push(['Subject', edited.subject]);

  return (
    <ActionShell
      label="Email"
      action={action}
      runner={runner}
      editing={editing}
      onToggleEdit={() => setEditing((e) => !e)}
      approveLabel={approveLabel}
      onApprove={() => void approve()}
      invalid={problem !== null}
      blockedReason={blockedReason}
      done={
        <>
          {sentJobId && <EmailJobProgress jobId={sentJobId} />}
          {skipped > 0 && <p className="text-xs text-gray-500">{`${skipped} skipped (no email address)`}</p>}
        </>
      }
      extra={
        <div className="space-y-2 border-t border-gray-100 pt-3">
          <div className="flex items-end gap-2">
            <div className="flex-1">
              <MemberPicker members={members} value={testId} onChange={setTestId} label="Send test to" />
            </div>
            <Button
              variant="secondary"
              disabled={runner.busy || runner.locked || problem !== null}
              onClick={() => void sendTest()}
            >
              Send test
            </Button>
          </div>
          {shownTests.length > 0 && (
            <ul className="space-y-0.5">
              {shownTests.map((t, i) => (
                <li key={t.jobId ?? `no-job-${i}`}>
                  {t.jobId ? (
                    <EmailJobProgress jobId={t.jobId} />
                  ) : (
                    <p className="text-sm text-green-700">{`Test sent to ${t.toName} ✓`}</p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      }
    >
      <div className="space-y-3">
        <Facts rows={rows} />
        {isEditing ? (
          <div className="space-y-3">
            <TextField label="Subject" value={subject} maxLength={200} onChange={(e) => setSubject(e.target.value)} />
            <TextAreaField
              label="Message"
              rows={10}
              value={body}
              className="font-mono text-xs"
              onChange={(e) => setBody(e.target.value)}
            />
            <p className="text-xs text-gray-500">
              {'{firstName}'} and {'{name}'} are filled in for each person; {'{rsvpLink}'} becomes their own RSVP link.
            </p>
            {problem && <ProblemText>{problem}</ProblemText>}
          </div>
        ) : (
          <BodyPreview text={edited.body} />
        )}
        {input.rsvp && <p className="text-xs text-gray-600">{`Includes personal RSVP links for: ${eventTitle ?? 'an event'}`}</p>}
      </div>
    </ActionShell>
  );
}
