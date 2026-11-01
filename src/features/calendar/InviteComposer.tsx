import { useEffect, useRef, useState } from 'react';
import { listenRsvps } from './eventsApi';
import { buildEmailBody } from './eventText';
import { queueMemberEmail } from '../email/emailJobsApi';
import { formatGardenDate } from '../../lib/gardenTime';
import { inviteAudienceCounts } from '../../logic/rsvp';
import { MemberPicker } from '../../components/MemberPicker';
import { EmailJobProgress } from '../../components/EmailJobProgress';
import { Button, Modal } from '../../components/ui';
import type { Audience, GardenEvent, Member, Rsvp } from '../../lib/types';

type Mode = 'all' | 'pending' | 'one';

interface InviteComposerProps {
  event: GardenEvent;
  members: Member[];
  me: Member;
  onClose(): void;
}

const SEND_GAP_SECONDS = 4; // the server sends one email about every 4 s
const plural = (n: number) => `${n} member${n === 1 ? '' : 's'}`;
const inputClass =
  'border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-garden-500';

/**
 * Compose and send personalized RSVP emails for one event through the
 * server's email jobs: every recipient gets their own RSVP link + buttons.
 */
export default function InviteComposer({ event, members, me, onClose }: InviteComposerProps) {
  const [rsvps, setRsvps] = useState<Rsvp[]>([]);
  const [mode, setMode] = useState<Mode>('all');
  const [oneId, setOneId] = useState(me.id);
  const [testId, setTestId] = useState(me.id);
  const [subject, setSubject] = useState(
    () => `RSVP: ${event.title} — ${formatGardenDate(event.start.toDate(), 'short')}`,
  );
  const [body, setBody] = useState(
    () => `${buildEmailBody(event)}\n\nPlease let us know if you're coming: {rsvpLink}`,
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [job, setJob] = useState<{ id: string; test: boolean } | null>(null);
  const sending = useRef(false); // blocks a double click before `busy` re-renders

  useEffect(() => listenRsvps(event.id, setRsvps), [event.id]);

  const counts = inviteAudienceCounts(members, rsvps);
  const count = mode === 'all' ? counts.allActive : mode === 'pending' ? counts.notResponded : 1;
  const audience: Audience =
    mode === 'all'
      ? { kind: 'all_active' }
      : mode === 'pending'
        ? { kind: 'event_rsvp', eventId: event.id, statuses: ['none'] }
        : { kind: 'members', memberIds: [oneId] };
  const sentForReal = job !== null && !job.test;

  async function send(testMemberId?: string) {
    if (sending.current) return;
    if (!testMemberId) {
      const minutes = Math.max(1, Math.round((count * SEND_GAP_SECONDS) / 60));
      const ok = window.confirm(
        `Send this RSVP email to ${plural(count)}?\n\nEach person gets their own email and RSVP link. ` +
          `They go out one at a time over about ${minutes} minute${minutes === 1 ? '' : 's'}; ` +
          `you can close this window once it starts.`,
      );
      if (!ok) return;
    }
    sending.current = true;
    setBusy(true);
    setError('');
    try {
      const res = await queueMemberEmail({
        audience,
        subject,
        body,
        rsvpEventId: event.id,
        source: 'calendar',
        ...(testMemberId ? { testMemberId } : {}),
      });
      setJob({ id: res.jobId, test: Boolean(testMemberId) });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't send.");
    } finally {
      sending.current = false;
      setBusy(false);
    }
  }

  const radio = (value: Mode, label: string) => (
    <label className="flex items-center gap-2 cursor-pointer">
      <input
        type="radio"
        name="invite-audience"
        checked={mode === value}
        onChange={() => setMode(value)}
        className="accent-garden-600"
      />
      <span>{label}</span>
    </label>
  );

  return (
    <Modal open onClose={onClose} title="Send RSVP invitations">
      <div className="space-y-4 text-sm max-h-[75vh] overflow-y-auto pr-1">
        <fieldset className="space-y-2">
          <legend className="font-medium text-gray-700 mb-1">Send to</legend>
          {radio('all', `All active members (${counts.allActive})`)}
          {radio('pending', `Haven't responded (${counts.notResponded})`)}
          {radio('one', 'One person')}
          {mode === 'one' && <MemberPicker members={members} value={oneId} onChange={setOneId} label="Recipient" />}
        </fieldset>

        <div className="flex flex-col gap-1">
          <label htmlFor="invite-subject" className="font-medium text-gray-700">
            Subject
          </label>
          <input
            id="invite-subject"
            value={subject}
            maxLength={200}
            onChange={(e) => setSubject(e.target.value)}
            className={inputClass}
          />
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="invite-body" className="font-medium text-gray-700">
            Message
          </label>
          <textarea
            id="invite-body"
            rows={9}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            className={`${inputClass} font-mono text-xs`}
          />
          <p className="text-xs text-gray-500">
            {'{firstName}'} and {'{name}'} are filled in for each person. {'{rsvpLink}'} becomes their own RSVP
            link, and Yes / Maybe / Can&apos;t-make-it buttons are added.
          </p>
        </div>

        <div className="border-t border-gray-100 pt-3 space-y-3">
          <div className="flex items-end gap-2">
            <div className="flex-1">
              <MemberPicker members={members} value={testId} onChange={setTestId} label="Send test to" />
            </div>
            <Button variant="secondary" disabled={busy} onClick={() => send(testId)}>
              Send test
            </Button>
          </div>
          <Button className="w-full" disabled={busy || count === 0 || sentForReal} onClick={() => send()}>
            Send to {plural(count)}
          </Button>
          {error && (
            <p role="alert" className="text-xs text-red-600">
              {error}
            </p>
          )}
          {job && <EmailJobProgress key={job.id} jobId={job.id} />}
        </div>
      </div>
    </Modal>
  );
}
