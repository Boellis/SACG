import { useEffect, useState } from 'react';
import { useAuth } from '../../auth/useAuth';
import {
  listenEvents,
  createEvent,
  updateEvent,
  deleteEvent,
  setRsvp,
  listenRsvps,
} from './eventsApi';
import { listenMembers } from '../members/membersApi';
import { buildMailtoUrl } from '../../lib/emailLinks';
import { activeMemberEmails, dedupeEmails } from '../../logic/emailAudience';
import { rsvpHeadcount } from '../../logic/rsvp';
import { Button, Card, Badge, Modal, Field } from '../../components/ui';
import { buildEmailBody, typeLabel } from './eventText';
import InviteComposer from './InviteComposer';
import type { GardenEvent, Member, Rsvp, EventType, RsvpStatus } from '../../lib/types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

type EventColor = 'green' | 'blue' | 'gray';

function typeColor(type: EventType): EventColor {
  if (type === 'workday') return 'green';
  if (type === 'meeting') return 'blue';
  return 'gray';
}

const DOT_CLASSES: Record<EventColor, string> = {
  green: 'bg-green-500',
  blue: 'bg-blue-500',
  gray: 'bg-gray-400',
};

/** Return local midnight of a date (strips time). */
function midnight(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/** Build grid cells for a month: leading empty cells + day numbers. */
function buildCalendarGrid(year: number, month: number): (number | null)[] {
  const firstDow = new Date(year, month, 1).getDay(); // 0=Sun
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: (number | null)[] = [];
  for (let i = 0; i < firstDow; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  return cells;
}

/** Check if an event falls on a given date (local time). */
function eventOnDay(ev: GardenEvent, year: number, month: number, day: number): boolean {
  const start = ev.start.toDate();
  const end = ev.end.toDate();
  const cell = new Date(year, month, day);
  const cellMid = midnight(cell);
  const startMid = midnight(start);
  const endMid = midnight(end);
  return cellMid >= startMid && cellMid <= endMid;
}

function formatDateTime(ev: GardenEvent): string {
  const s = ev.start.toDate();
  if (ev.allDay) {
    return s.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
  }
  return s.toLocaleString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function toLocalDatetimeValue(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// ---------------------------------------------------------------------------
// Event detail modal
// ---------------------------------------------------------------------------

interface EventModalProps {
  event: GardenEvent;
  onClose: () => void;
  onEdit: (ev: GardenEvent) => void;
  isAdmin: boolean;
  me: Member;
  members: Member[];
}

const RSVP_STATUSES: RsvpStatus[] = ['yes', 'maybe', 'no'];
const STATUS_LABEL: Record<RsvpStatus, string> = { yes: 'Yes', maybe: 'Maybe', no: 'No' };
const MAX_PARTY_SIZE = 20;

const clampPartySize = (raw: string) => Math.min(MAX_PARTY_SIZE, Math.max(1, Math.round(Number(raw)) || 1));

/** "Name (×2) — "note"" for the admin's per-person RSVP list. */
function personLine(r: Rsvp): string {
  const size = r.status !== 'no' && (r.partySize ?? 1) > 1 ? ` (×${r.partySize})` : '';
  const note = r.note ? ` — "${r.note}"` : '';
  return `${r.displayName}${size}${note}`;
}

function EventModal({ event, onClose, onEdit, isAdmin, me, members }: EventModalProps) {
  const [rsvps, setRsvps] = useState<Rsvp[]>([]);
  const [saving, setSaving] = useState(false);
  const [rsvpError, setRsvpError] = useState('');
  // My RSVP as shown in the form: mirrors my saved answer until I change it.
  const [choice, setChoice] = useState<RsvpStatus | null>(null);
  const [partySize, setPartySize] = useState('1');
  const [note, setNote] = useState('');
  const [touched, setTouched] = useState(false);
  const [composing, setComposing] = useState(false);

  useEffect(() => {
    const unsub = listenRsvps(event.id, setRsvps);
    return unsub;
  }, [event.id]);

  const myRsvp = rsvps.find((r) => r.id === me.id);

  useEffect(() => {
    if (touched || !myRsvp) return;
    setChoice(myRsvp.status);
    setPartySize(String(myRsvp.partySize ?? 1));
    setNote(myRsvp.note ?? '');
  }, [myRsvp, touched]);

  const hc = rsvpHeadcount(rsvps);
  const answered = new Set(rsvps.map((r) => r.id));
  const notYet = members.filter((m) => m.status === 'active' && !answered.has(m.id)).length;

  async function saveRsvp(status: RsvpStatus) {
    const size = clampPartySize(partySize);
    setTouched(true);
    setChoice(status);
    setPartySize(String(size));
    setSaving(true);
    setRsvpError('');
    try {
      await setRsvp(event.id, me.id, status, me.displayName, status === 'no' ? { note } : { partySize: size, note });
    } catch {
      setRsvpError("Couldn't save your RSVP. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!confirm('Delete this event?')) return;
    await deleteEvent(event.id);
    onClose();
  }

  const recipientEmails = dedupeEmails(activeMemberEmails(members));
  const mailtoUrl = buildMailtoUrl(recipientEmails, event.title, buildEmailBody(event));

  if (composing) {
    return <InviteComposer event={event} members={members} me={me} onClose={() => setComposing(false)} />;
  }

  return (
    <Modal open onClose={onClose} title={event.title}>
      <div className="space-y-3 text-sm max-h-[80vh] overflow-y-auto">
        <div className="flex items-center gap-2">
          <Badge color={typeColor(event.type)}>{typeLabel(event.type)}</Badge>
          <span className="text-gray-600">{formatDateTime(event)}</span>
        </div>
        {event.location && <p className="text-gray-700"><span className="font-medium">Location:</span> {event.location}</p>}
        {event.description && <p className="text-gray-600">{event.description}</p>}

        {/* RSVP controls: a status click saves right away; size/note via Save RSVP */}
        <div>
          <p className="font-medium text-gray-700 mb-1">RSVP</p>
          <div className="flex gap-2">
            {RSVP_STATUSES.map((s) => (
              <Button
                key={s}
                variant={choice === s ? 'primary' : 'secondary'}
                aria-pressed={choice === s}
                disabled={saving}
                onClick={() => saveRsvp(s)}
                className="flex-1"
              >
                {STATUS_LABEL[s]}
              </Button>
            ))}
          </div>
          {choice && (
            <div className="mt-3 space-y-2">
              {choice !== 'no' && (
                <div className="flex items-center gap-2">
                  <label htmlFor="rsvp-party-size" className="text-gray-700">
                    How many people, including you?
                  </label>
                  <input
                    id="rsvp-party-size"
                    type="number"
                    min={1}
                    max={MAX_PARTY_SIZE}
                    value={partySize}
                    onChange={(e) => {
                      setTouched(true);
                      setPartySize(e.target.value);
                    }}
                    className="w-16 border border-gray-300 rounded-lg px-2 py-1 focus:outline-none focus:ring-2 focus:ring-garden-500"
                  />
                </div>
              )}
              <div className="flex flex-col gap-1">
                <label htmlFor="rsvp-note" className="text-gray-700">
                  Note for organizers (optional)
                </label>
                <textarea
                  id="rsvp-note"
                  rows={2}
                  maxLength={500}
                  value={note}
                  onChange={(e) => {
                    setTouched(true);
                    setNote(e.target.value);
                  }}
                  placeholder="e.g. bringing a vegetarian dish"
                  className="border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-garden-500"
                />
              </div>
              <Button variant="secondary" disabled={saving} onClick={() => saveRsvp(choice)}>
                {saving ? 'Saving…' : 'Save RSVP'}
              </Button>
              {rsvpError && <p className="text-xs text-red-600">{rsvpError}</p>}
            </div>
          )}
        </div>

        {/* RSVP counts (members); admins get the full breakdown below */}
        {!isAdmin && (
          <div className="flex gap-4 text-gray-600">
            <span><span className="font-medium text-green-700">{hc.yes}</span> yes</span>
            <span><span className="font-medium text-amber-700">{hc.maybe}</span> maybe</span>
            <span><span className="font-medium text-red-700">{hc.no}</span> no</span>
          </div>
        )}

        {/* Admin: headcount + who's coming */}
        {isAdmin && (
          <div className="border-t border-gray-100 pt-2 space-y-2">
            <p className="font-medium text-gray-800">
              <span>Expected headcount: {hc.people} {hc.people === 1 ? 'person' : 'people'}</span>
              {hc.maybePeople > 0 && <span className="font-normal text-gray-500"> (+{hc.maybePeople} maybe)</span>}
            </p>
            <p className="text-gray-600">
              {hc.yes} yes · {hc.maybe} maybe · {hc.no} no · {notYet} not yet
            </p>
            {RSVP_STATUSES.map((s) => {
              const group = rsvps
                .filter((r) => r.status === s)
                .sort((a, b) => a.displayName.localeCompare(b.displayName));
              if (!group.length) return null;
              return (
                <div key={s}>
                  <p className="font-medium text-gray-700">{STATUS_LABEL[s]}</p>
                  <ul className="ml-3 space-y-0.5">
                    {group.map((r) => (
                      <li key={r.id} className="flex items-center gap-2 text-gray-600">
                        <span>{personLine(r)}</span>
                        {r.source === 'email' && <Badge color="blue">email</Badge>}
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
        )}

        {/* Admin: personalized RSVP emails (server-sent), with a BCC fallback */}
        {isAdmin && (
          <div className="border-t border-gray-100 pt-3 space-y-1">
            <Button variant="secondary" onClick={() => setComposing(true)} className="w-full">
              Send RSVP invitations…
            </Button>
            {recipientEmails.length > 0 && (
              <p className="text-xs text-gray-500 text-center">
                Each member gets their own email with a one-click RSVP link.{' '}
                <a href={mailtoUrl} className="underline text-garden-700 hover:text-garden-900" target="_blank" rel="noreferrer">
                  Use mail app instead
                </a>
              </p>
            )}
          </div>
        )}

        {/* Admin actions */}
        {isAdmin && (
          <div className="flex gap-2 pt-2 border-t border-gray-100">
            <Button variant="secondary" onClick={() => onEdit(event)}>Edit</Button>
            <Button variant="danger" onClick={handleDelete}>Delete</Button>
          </div>
        )}
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Event form modal (create / edit)
// ---------------------------------------------------------------------------

const DEFAULT_FORM = {
  title: '',
  type: 'workday' as EventType,
  startStr: '',
  endStr: '',
  allDay: false,
  location: '',
  description: '',
};

interface EventFormProps {
  initial?: GardenEvent;
  createdBy: string;
  onClose: () => void;
}

function EventFormModal({ initial, createdBy, onClose }: EventFormProps) {
  const editing = !!initial;
  const [form, setForm] = useState(() => {
    if (initial) {
      return {
        title: initial.title,
        type: initial.type,
        startStr: toLocalDatetimeValue(initial.start.toDate()),
        endStr: toLocalDatetimeValue(initial.end.toDate()),
        allDay: initial.allDay,
        location: initial.location ?? '',
        description: initial.description ?? '',
      };
    }
    return DEFAULT_FORM;
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  function set<K extends keyof typeof DEFAULT_FORM>(k: K, v: (typeof DEFAULT_FORM)[K]) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.title.trim()) { setError('Title is required.'); return; }
    if (!form.startStr) { setError('Start date/time is required.'); return; }
    if (!form.endStr) { setError('End date/time is required.'); return; }
    const start = new Date(form.startStr);
    const end = new Date(form.endStr);
    if (end < start) { setError('End must be after start.'); return; }

    setError('');
    setSaving(true);
    try {
      if (editing && initial) {
        // updateEvent accepts any patch; cast to any to allow raw Timestamp-like values
        await updateEvent(initial.id, {
          title: form.title.trim(),
          type: form.type,
          allDay: form.allDay,
          location: form.location.trim() || undefined,
          description: form.description.trim() || undefined,
        } as any);
      } else {
        await createEvent({
          title: form.title.trim(),
          type: form.type,
          start,
          end,
          allDay: form.allDay,
          location: form.location.trim() || undefined,
          description: form.description.trim() || undefined,
          createdBy,
        });
      }
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save event.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open onClose={onClose} title={editing ? 'Edit Event' : 'New Event'}>
      <form onSubmit={handleSubmit} className="space-y-3">
        <Field
          label="Title"
          value={form.title}
          onChange={(e) => set('title', e.target.value)}
          placeholder="Garden Workday"
        />
        <div className="flex flex-col gap-1">
          <label htmlFor="event-type" className="text-sm font-medium text-gray-700">Type</label>
          <select
            id="event-type"
            className="border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-garden-500 border-gray-300"
            value={form.type}
            onChange={(e) => set('type', e.target.value as EventType)}
          >
            <option value="workday">Workday</option>
            <option value="meeting">Meeting</option>
            <option value="other">Other</option>
          </select>
        </div>
        <Field
          label="Start"
          type="datetime-local"
          value={form.startStr}
          onChange={(e) => set('startStr', e.target.value)}
        />
        <Field
          label="End"
          type="datetime-local"
          value={form.endStr}
          onChange={(e) => set('endStr', e.target.value)}
        />
        <div className="flex items-center gap-2">
          <input
            id="event-allday"
            type="checkbox"
            checked={form.allDay}
            onChange={(e) => set('allDay', e.target.checked)}
            className="rounded"
          />
          <label htmlFor="event-allday" className="text-sm font-medium text-gray-700">All day</label>
        </div>
        <Field
          label="Location (optional)"
          value={form.location}
          onChange={(e) => set('location', e.target.value)}
          placeholder="Community Garden"
        />
        <div className="flex flex-col gap-1">
          <label htmlFor="event-description" className="text-sm font-medium text-gray-700">
            Description — what's happening at this event?
          </label>
          <textarea
            id="event-description"
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-garden-500"
            rows={5}
            value={form.description}
            onChange={(e) => set('description', e.target.value)}
            placeholder="e.g. We'll weed the common beds and turn the compost. Bring gloves & water — snacks provided!"
          />
        </div>
        {error && <p className="text-xs text-red-600">{error}</p>}
        <div className="flex gap-2 pt-1">
          <Button type="submit" disabled={saving} className="flex-1">
            {saving ? 'Saving…' : editing ? 'Save Changes' : 'Create Event'}
          </Button>
          <Button type="button" variant="secondary" onClick={onClose} className="flex-1">
            Cancel
          </Button>
        </div>
      </form>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function CalendarPage() {
  const { member, role } = useAuth();
  const isAdmin = role === 'admin';

  const [events, setEvents] = useState<GardenEvent[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);

  const today = new Date();
  const [viewYear, setViewYear] = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth());

  const [selectedEvent, setSelectedEvent] = useState<GardenEvent | null>(null);
  const [editingEvent, setEditingEvent] = useState<GardenEvent | null | undefined>(undefined); // undefined = closed, null = new
  const [showNewForm, setShowNewForm] = useState(false);

  useEffect(() => {
    const unsub = listenEvents((evs) => {
      setEvents(evs);
      setLoading(false);
    });
    return unsub;
  }, []);

  useEffect(() => {
    const unsub = listenMembers(setMembers);
    return unsub;
  }, []);

  // Month navigation
  function prevMonth() {
    if (viewMonth === 0) { setViewYear((y) => y - 1); setViewMonth(11); }
    else setViewMonth((m) => m - 1);
  }
  function nextMonth() {
    if (viewMonth === 11) { setViewYear((y) => y + 1); setViewMonth(0); }
    else setViewMonth((m) => m + 1);
  }

  const cells = buildCalendarGrid(viewYear, viewMonth);

  // Upcoming events: start >= now, soonest first
  const nowMs = today.getTime();
  const upcoming = events
    .filter((ev) => ev.start.toDate().getTime() >= nowMs)
    .slice() // already ordered by Firestore orderBy('start')
    ;

  if (!member) return <p className="p-6 text-gray-500">Loading…</p>;

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Calendar</h1>
        {isAdmin && (
          <Button onClick={() => setShowNewForm(true)}>+ New Event</Button>
        )}
      </div>

      {loading ? (
        <p className="text-gray-500">Loading events…</p>
      ) : (
        <>
          {/* Month grid */}
          <Card>
            <div className="flex items-center justify-between mb-4">
              <Button variant="ghost" onClick={prevMonth} className="px-2">&#8249;</Button>
              <h2 className="text-lg font-semibold text-gray-800">
                {MONTH_NAMES[viewMonth]} {viewYear}
              </h2>
              <Button variant="ghost" onClick={nextMonth} className="px-2">&#8250;</Button>
            </div>
            {/* Day headers */}
            <div className="grid grid-cols-7 mb-1">
              {DAY_NAMES.map((d) => (
                <div key={d} className="text-center text-xs font-semibold text-gray-500 py-1">
                  {d}
                </div>
              ))}
            </div>
            {/* Cells */}
            <div className="grid grid-cols-7">
              {cells.map((day, idx) => {
                if (day === null) {
                  return <div key={`empty-${idx}`} className="min-h-[72px] border border-transparent" />;
                }
                const isToday =
                  viewYear === today.getFullYear() &&
                  viewMonth === today.getMonth() &&
                  day === today.getDate();
                const dayEvents = events.filter((ev) => eventOnDay(ev, viewYear, viewMonth, day));
                return (
                  <div
                    key={day}
                    className={`min-h-[72px] border border-gray-100 p-1 ${isToday ? 'bg-garden-50' : ''}`}
                  >
                    <span
                      className={`text-xs font-medium ${
                        isToday
                          ? 'bg-garden-600 text-white rounded-full w-5 h-5 inline-flex items-center justify-center'
                          : 'text-gray-700'
                      }`}
                    >
                      {day}
                    </span>
                    <div className="mt-0.5 space-y-0.5">
                      {dayEvents.map((ev) => (
                        <button
                          key={ev.id}
                          onClick={() => setSelectedEvent(ev)}
                          className="w-full text-left flex items-center gap-1 text-xs truncate hover:underline"
                        >
                          <span
                            className={`inline-block w-1.5 h-1.5 rounded-full flex-shrink-0 ${DOT_CLASSES[typeColor(ev.type)]}`}
                          />
                          <span className="truncate text-gray-700">{ev.title}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>

          {/* Upcoming events */}
          <Card title="Upcoming Events">
            {upcoming.length === 0 ? (
              <p className="text-sm text-gray-500">No upcoming events.</p>
            ) : (
              <ul className="space-y-3">
                {upcoming.map((ev) => (
                  <li key={ev.id}>
                    <div className="flex items-start gap-3">
                      <div className="flex-shrink-0 mt-0.5">
                        <Badge color={typeColor(ev.type)}>{typeLabel(ev.type)}</Badge>
                      </div>
                      <div className="flex-1 min-w-0">
                        <button
                          className="text-left group"
                          onClick={() => setSelectedEvent(ev)}
                        >
                          <p className="font-medium text-gray-800 group-hover:underline">{ev.title}</p>
                          <p className="text-xs text-gray-500">{formatDateTime(ev)}</p>
                          {ev.location && (
                            <p className="text-xs text-gray-400">{ev.location}</p>
                          )}
                        </button>
                      </div>
                      <div className="flex-shrink-0">
                        <Button
                          variant="secondary"
                          onClick={() => setSelectedEvent(ev)}
                          className="text-xs py-1 px-2"
                        >
                          Details
                        </Button>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </>
      )}

      {/* Event detail modal */}
      {selectedEvent && (
        <EventModal
          event={selectedEvent}
          onClose={() => setSelectedEvent(null)}
          onEdit={(ev) => { setSelectedEvent(null); setEditingEvent(ev); }}
          isAdmin={isAdmin}
          me={member}
          members={members}
        />
      )}

      {/* New event form */}
      {showNewForm && member && (
        <EventFormModal
          createdBy={member.id}
          onClose={() => setShowNewForm(false)}
        />
      )}

      {/* Edit event form */}
      {editingEvent !== undefined && editingEvent !== null && (
        <EventFormModal
          initial={editingEvent}
          createdBy={member.id}
          onClose={() => setEditingEvent(undefined)}
        />
      )}
    </div>
  );
}
