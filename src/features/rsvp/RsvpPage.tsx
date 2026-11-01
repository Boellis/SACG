import { useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { getInvite, submitRsvp, type InviteResponse, type InviteView } from './rsvpApi';
import { CONTACT_EMAIL } from './constants';
import { typeLabel } from '../calendar/eventText';
import { GARDEN_TZ, formatGardenDate, formatGardenTime } from '../../lib/gardenTime';
import type { RsvpStatus } from '../../lib/types';

// Public, no-login page behind each member's emailed RSVP link (/rsvp/:token).
// Most members open it on a phone, so it is a single column with big targets.

const MAX_PARTY_SIZE = 20;
const ANSWERS: Array<{ value: RsvpStatus; label: string }> = [
  { value: 'yes', label: 'Yes' },
  { value: 'maybe', label: 'Maybe' },
  { value: 'no', label: "Can't make it" },
];

type Phase = 'loading' | 'not-found' | 'error' | 'closed' | 'form' | 'saved';
type InviteEvent = InviteView['event'];

const errorCode = (err: unknown) => String((err as { code?: unknown } | null)?.code ?? '');
const isAnswer = (v: string | null): v is RsvpStatus => v === 'yes' || v === 'maybe' || v === 'no';
const clampSize = (n: number) => Math.min(MAX_PARTY_SIZE, Math.max(1, Math.round(n) || 1));

const DAY_PARTS = new Intl.DateTimeFormat('en-US', {
  timeZone: GARDEN_TZ,
  year: 'numeric',
  month: 'numeric',
  day: 'numeric',
});

/** Garden-local calendar date as `YYYYMMDD`, optionally shifted by whole days. */
function gardenDay(d: Date, addDays = 0): string {
  const parts = DAY_PARTS.formatToParts(d);
  const num = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  const shifted = new Date(Date.UTC(num('year'), num('month') - 1, num('day') + addDays));
  return shifted.toISOString().slice(0, 10).replace(/-/g, '');
}

/** `YYYYMMDDTHHmmssZ` in UTC. */
const utcStamp = (d: Date) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');

function googleCalendarUrl(ev: InviteEvent): string {
  const start = new Date(ev.start);
  const end = new Date(ev.end);
  // All-day events use dates with an exclusive end day; timed events use UTC instants.
  const dates = ev.allDay ? `${gardenDay(start)}/${gardenDay(end, 1)}` : `${utcStamp(start)}/${utcStamp(end)}`;
  const params = new URLSearchParams({ action: 'TEMPLATE', text: ev.title, dates });
  params.set('details', [ev.description, 'South Austin Community Garden'].filter(Boolean).join('\n\n'));
  if (ev.location) params.set('location', ev.location);
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

function whenText(ev: InviteEvent): { date: string; time: string } {
  const start = new Date(ev.start);
  const end = new Date(ev.end);
  const sameDay = gardenDay(start) === gardenDay(end);
  if (ev.allDay) {
    return { date: sameDay ? formatGardenDate(start) : `${formatGardenDate(start)} – ${formatGardenDate(end)}`, time: 'All day' };
  }
  const endText = sameDay ? formatGardenTime(end) : `${formatGardenDate(end, 'short')}, ${formatGardenTime(end)}`;
  return { date: formatGardenDate(start), time: `${formatGardenTime(start)} – ${endText}` };
}

function savedSummary(r: InviteResponse): string {
  const n = r.partySize ?? 1;
  if (r.status === 'yes') return `See you there! We've got you down for ${n === 1 ? '1 person' : `${n} people`}.`;
  if (r.status === 'maybe') return `We've got you down as a maybe${n > 1 ? ` (${n} people)` : ''}.`;
  return "Sorry you can't make it. Thanks for letting us know.";
}

function SproutIcon() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 21v-9" />
      <path d="M12 12c0-4 3-7 8-7 0 4-3 7-8 7z" />
      <path d="M12 14c0-3-2.5-5.5-7-5.5 0 3 2.5 5.5 7 5.5z" />
    </svg>
  );
}

function EventSummary({ ev }: { ev: InviteEvent }) {
  const when = whenText(ev);
  return (
    <div className="space-y-1">
      <p className="text-xs font-semibold uppercase tracking-wide text-garden-700">{typeLabel(ev.type)}</p>
      <h1 className="text-2xl font-bold text-gray-900">{ev.title}</h1>
      <p className="text-gray-800">{when.date}</p>
      <p className="text-gray-800">{when.time}</p>
      {ev.location && (
        <p className="text-gray-600">
          <span className="sr-only">Location: </span>
          {ev.location}
        </p>
      )}
      {ev.description && <p className="pt-2 text-sm text-gray-600 whitespace-pre-line">{ev.description}</p>}
    </div>
  );
}

const contactLink = (
  <a href={`mailto:${CONTACT_EMAIL}`} className="font-medium text-garden-700 underline">
    {CONTACT_EMAIL}
  </a>
);

export default function RsvpPage() {
  const { token = '' } = useParams();
  const [searchParams] = useSearchParams();
  const answerParam = searchParams.get('answer');

  const [phase, setPhase] = useState<Phase>('loading');
  const [view, setView] = useState<InviteView | null>(null);
  const [status, setStatus] = useState<RsvpStatus | null>(null);
  const [size, setSize] = useState('1');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState<InviteResponse | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setPhase('loading');
    getInvite(token)
      .then((v) => {
        if (cancelled) return;
        setView(v);
        // A button in the email (?answer=) wins over an earlier answer; it only
        // preselects, so link scanners opening the page never record anything.
        setStatus(isAnswer(answerParam) ? answerParam : (v.response?.status ?? null));
        setSize(String(v.response?.partySize ?? 1));
        setNote(v.response?.note ?? '');
        setPhase(v.open ? 'form' : 'closed');
      })
      .catch((err) => {
        if (!cancelled) setPhase(errorCode(err).endsWith('not-found') ? 'not-found' : 'error');
      });
    return () => {
      cancelled = true;
    };
  }, [token, answerParam, attempt]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!status || saving) return;
    setSaving(true);
    setError('');
    try {
      const { response } = await submitRsvp(
        status === 'no'
          ? { token, status, note }
          : { token, status, partySize: clampSize(Number(size)), note },
      );
      setSaved(response);
      setView((v) => (v ? { ...v, response } : v));
      setPhase('saved');
    } catch (err) {
      const code = errorCode(err);
      if (code.endsWith('failed-precondition')) setPhase('closed');
      else if (code.endsWith('not-found')) setPhase('not-found');
      else if (code.endsWith('resource-exhausted') || code.endsWith('invalid-argument')) {
        setError(err instanceof Error ? err.message : "That RSVP couldn't be saved.");
      } else setError("We couldn't save your RSVP. Please check your connection and try again.");
    } finally {
      setSaving(false);
    }
  }

  const stepSize = (delta: number) => setSize((s) => String(clampSize(Number(s) + delta)));
  const sizeNum = Number(size);

  let content: React.ReactNode;
  if (phase === 'loading') {
    content = (
      <p role="status" className="py-8 text-center text-gray-500">
        Loading your invitation…
      </p>
    );
  } else if (phase === 'not-found') {
    content = (
      <div className="space-y-3 py-4 text-center">
        <h1 className="text-xl font-bold text-gray-900">This RSVP link isn&apos;t valid</h1>
        <p className="text-gray-600">
          It may be incomplete, or the event may have been removed. Please check the link in your email, or contact
          the organizers at {contactLink}.
        </p>
      </div>
    );
  } else if (phase === 'error') {
    content = (
      <div className="space-y-4 py-4 text-center">
        <h1 className="text-xl font-bold text-gray-900">We couldn&apos;t load your invitation</h1>
        <p className="text-gray-600">Please check your connection and try again.</p>
        <button
          type="button"
          onClick={() => setAttempt((a) => a + 1)}
          className="rounded-xl bg-garden-600 px-6 py-3 font-semibold text-white hover:bg-garden-700"
        >
          Try again
        </button>
      </div>
    );
  } else if (phase === 'closed' && view) {
    content = (
      <div className="space-y-5">
        <EventSummary ev={view.event} />
        <div className="rounded-xl bg-gray-50 p-4 text-center text-gray-700">
          <p className="font-semibold">This event has already happened</p>
          <p className="mt-1 text-sm">RSVPs are closed. Thanks for being part of the garden!</p>
        </div>
      </div>
    );
  } else if (phase === 'saved' && view && saved) {
    content = (
      <div className="space-y-5">
        <div className="space-y-2 text-center">
          <p className="text-2xl font-bold text-garden-700">{view.firstName ? `Thanks, ${view.firstName}!` : 'Thanks!'}</p>
          <p className="text-gray-800">{savedSummary(saved)}</p>
          <p className="text-sm text-gray-500">You can change your answer anytime with this same link.</p>
        </div>
        <EventSummary ev={view.event} />
        <div className="flex flex-col gap-3">
          {saved.status !== 'no' && (
            <a
              href={googleCalendarUrl(view.event)}
              target="_blank"
              rel="noreferrer"
              className="rounded-xl border-2 border-garden-600 py-3 text-center font-semibold text-garden-700 hover:bg-garden-50"
            >
              Add to Google Calendar
            </a>
          )}
          <button type="button" onClick={() => setPhase('form')} className="py-2 text-sm text-gray-600 underline">
            Change my answer
          </button>
        </div>
      </div>
    );
  } else if (view) {
    content = (
      <div className="space-y-6">
        <EventSummary ev={view.event} />
        <form onSubmit={handleSubmit} className="space-y-5">
          <fieldset>
            <legend className="text-lg font-semibold text-gray-900">
              {view.firstName ? `Hi ${view.firstName}! Will you be there?` : 'Will you be there?'}
            </legend>
            <div className="mt-3 grid grid-cols-3 gap-2">
              {ANSWERS.map((a) => (
                <label
                  key={a.value}
                  className={`flex min-h-[3.5rem] cursor-pointer items-center justify-center rounded-xl border-2 px-2 text-center font-semibold focus-within:ring-2 focus-within:ring-garden-500 ${
                    status === a.value
                      ? 'border-garden-600 bg-garden-50 text-garden-700'
                      : 'border-gray-200 text-gray-700 hover:border-garden-500'
                  }`}
                >
                  <input
                    type="radio"
                    name="rsvp-status"
                    value={a.value}
                    checked={status === a.value}
                    onChange={() => setStatus(a.value)}
                    className="sr-only"
                  />
                  <span>{a.label}</span>
                </label>
              ))}
            </div>
          </fieldset>

          {status && status !== 'no' && (
            <div>
              <label htmlFor="party-size" className="block font-semibold text-gray-900">
                How many people, including you?
              </label>
              <div className="mt-2 flex items-center gap-3">
                <button
                  type="button"
                  aria-label="One fewer person"
                  onClick={() => stepSize(-1)}
                  disabled={sizeNum <= 1}
                  className="h-12 w-12 rounded-full border-2 border-gray-300 text-2xl leading-none text-gray-700 disabled:opacity-40"
                >
                  −
                </button>
                <input
                  id="party-size"
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={MAX_PARTY_SIZE}
                  value={size}
                  onChange={(e) => setSize(e.target.value)}
                  onBlur={() => setSize(String(clampSize(Number(size))))}
                  className="w-20 rounded-lg border border-gray-300 py-2 text-center text-xl focus:outline-none focus:ring-2 focus:ring-garden-500"
                />
                <button
                  type="button"
                  aria-label="One more person"
                  onClick={() => stepSize(1)}
                  disabled={sizeNum >= MAX_PARTY_SIZE}
                  className="h-12 w-12 rounded-full border-2 border-gray-300 text-2xl leading-none text-gray-700 disabled:opacity-40"
                >
                  +
                </button>
              </div>
            </div>
          )}

          <div>
            <label htmlFor="rsvp-note" className="block font-semibold text-gray-900">
              Note for organizers (optional)
            </label>
            <textarea
              id="rsvp-note"
              rows={3}
              maxLength={500}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Dietary needs, bringing a dish, arriving late…"
              className="mt-2 w-full rounded-lg border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-garden-500"
            />
          </div>

          {error && (
            <p role="alert" className="text-sm text-red-600">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={!status || saving}
            className="w-full rounded-xl bg-garden-600 py-3 text-lg font-semibold text-white hover:bg-garden-700 disabled:opacity-50"
          >
            {saving ? 'Saving…' : view.response ? 'Update my RSVP' : 'Send my RSVP'}
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-garden-50 px-4 py-8">
      <div className="mx-auto w-full max-w-md">
        <header className="mb-5 flex items-center justify-center gap-2 text-garden-700">
          <SproutIcon />
          <span className="text-sm font-semibold uppercase tracking-wide">South Austin Community Garden</span>
        </header>
        <main className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">{content}</main>
        {phase !== 'not-found' && (
          <p className="mt-6 text-center text-xs text-gray-500">Questions? Email {contactLink}</p>
        )}
      </div>
    </div>
  );
}
