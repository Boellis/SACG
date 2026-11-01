import { Timestamp, type DocumentSnapshot, type Firestore } from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/v2/https';
import { z } from 'zod';
import { APP_URL } from '../config';
import type { AdminCaller } from '../lib/auth';
import { AudienceSchema, DocIdSchema, describeAudience, resolveAudience } from '../email/audience';
import { EMAIL_JOBS } from '../email/jobs';
import { GARDEN_TZ, formatGardenDate, formatGardenWhen, gardenToday, parseGardenLocal, toGardenLocal } from '../lib/time';
import { hideContactDetails } from './redact';
import { GardenDateSchema, describeIssues } from './schemas';

export interface ReadToolContext {
  caller: AdminCaller;
  now: Date;
}

type Json = Record<string, unknown>;

const GARDEN_NAME = 'South Austin Community Garden';
const MAX_EVENTS = 50;
const MAX_RANGE_DAYS = 366;
const MAX_DESCRIPTION = 600;
const MAX_NOTE = 500;
const MAX_MATCHES = 10;

/** Bad tool input: answered to the model as `{"error": …}` so it can correct itself. */
class ToolInputError extends Error {}

function parse<T extends z.ZodType>(tool: string, schema: T, input: unknown): z.output<T> {
  const r = schema.safeParse(input);
  if (!r.success) throw new ToolInputError(`Invalid input for ${tool}: ${describeIssues(r.error)}`);
  return r.data;
}

// Member and admin free text (RSVP notes, descriptions, names) can hold contact
// details; structured email/phone fields are never read into a result.
const scrub = hideContactDetails;

const textOf = (v: unknown) => (typeof v === 'string' ? scrub(v.trim()) : '');
const clip = (s: string, max: number) => (s.length > max ? `${s.slice(0, max - 1)}…` : s);
const asDate = (v: unknown): Date | null => (v instanceof Timestamp ? v.toDate() : null);
const norm = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();

/** `YYYY-MM-DD` plus n calendar days. */
function addDays(date: string, n: number): string {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}
const daysBetween = (from: string, to: string) => (Date.parse(`${to}T00:00Z`) - Date.parse(`${from}T00:00Z`)) / 86_400_000;

const RSVP_ORDER: Record<string, number> = { yes: 0, maybe: 1, no: 2 };
const partySizeOf = (r: DocumentSnapshot) => {
  const n = r.get('partySize');
  return Number.isInteger(n) && n >= 1 ? (n as number) : 1;
};

/** Mirrors the calendar's headcount: yes/maybe party sizes count the responder (default 1). */
function headcountOf(rsvps: DocumentSnapshot[]) {
  const h = { yes: 0, maybe: 0, no: 0, people: 0, maybePeople: 0 };
  for (const r of rsvps) {
    const status = r.get('status');
    if (status === 'yes') {
      h.yes += 1;
      h.people += partySizeOf(r);
    } else if (status === 'maybe') {
      h.maybe += 1;
      h.maybePeople += partySizeOf(r);
    } else if (status === 'no') {
      h.no += 1;
    }
  }
  return h;
}

/** Garden-local times of an event, or nothing when its start/end are unreadable. */
function timesOf(event: DocumentSnapshot): Json {
  const start = asDate(event.get('start'));
  const end = asDate(event.get('end'));
  if (!start || !end) return {};
  const allDay = event.get('allDay') === true;
  return { start: toGardenLocal(start), end: toGardenLocal(end), allDay, when: formatGardenWhen(start, end, allDay) };
}

// ── Tools ───────────────────────────────────────────────────────────────────

async function getGardenInfo(db: Firestore, input: unknown, ctx: ReadToolContext): Promise<Json> {
  parse('get_garden_info', z.object({}).strict(), input);
  const org = (await db.doc('settings/org').get()).data() ?? {};
  // Picked one by one: the org settings also hold the contact email address.
  const settings: Json = {};
  for (const key of ['requiredHours', 'firstHalfHours', 'firstHalfMonths', 'defaultDeposit', 'currentSeason']) {
    const v = org[key];
    if (typeof v === 'number') settings[key] = v;
    else if (typeof v === 'string') settings[key] = scrub(v);
  }
  return {
    garden: GARDEN_NAME,
    timeZone: GARDEN_TZ,
    today: formatGardenDate(ctx.now),
    todayDate: gardenToday(ctx.now),
    now: toGardenLocal(ctx.now),
    appUrl: APP_URL,
    pages: { calendar: `${APP_URL}/calendar`, polls: `${APP_URL}/polls`, lounge: `${APP_URL}/lounge` },
    admin: scrub(ctx.caller.displayName),
    settings,
  };
}

const ListEventsInput = z
  .object({ from: GardenDateSchema, to: GardenDateSchema })
  .strict()
  .refine((r) => r.to >= r.from, { message: 'must be on or after "from"', path: ['to'] })
  .refine((r) => daysBetween(r.from, r.to) <= MAX_RANGE_DAYS, {
    message: `the range can be at most ${MAX_RANGE_DAYS} days`,
    path: ['to'],
  });

async function listEvents(db: Firestore, input: unknown): Promise<Json> {
  const { from, to } = parse('list_events', ListEventsInput, input);
  const snap = await db
    .collection('events')
    .where('start', '>=', Timestamp.fromDate(parseGardenLocal(from)))
    .where('start', '<', Timestamp.fromDate(parseGardenLocal(addDays(to, 1))))
    .orderBy('start')
    .limit(MAX_EVENTS + 1)
    .get();
  const docs = snap.docs.slice(0, MAX_EVENTS).filter((d) => 'start' in timesOf(d));
  const events = await Promise.all(
    docs.map(async (d) => {
      const { maybePeople: _maybePeople, ...headcount } = headcountOf((await d.ref.collection('rsvps').get()).docs);
      const location = textOf(d.get('location'));
      const description = textOf(d.get('description'));
      return {
        id: d.id,
        title: textOf(d.get('title')),
        type: String(d.get('type') ?? 'other'),
        ...timesOf(d),
        ...(location ? { location } : {}),
        ...(description ? { description: clip(description, MAX_DESCRIPTION) } : {}),
        headcount,
      };
    }),
  );
  return { from, to, events, ...(snap.size > MAX_EVENTS ? { more: true } : {}) };
}

async function getEventRsvps(db: Firestore, input: unknown): Promise<Json> {
  const { eventId } = parse('get_event_rsvps', z.object({ eventId: DocIdSchema }).strict(), input);
  const ref = db.collection('events').doc(eventId);
  const [event, rsvpSnap, active] = await Promise.all([
    ref.get(),
    ref.collection('rsvps').get(),
    db.collection('members').where('status', '==', 'active').get(),
  ]);
  if (!event.exists) throw new ToolInputError(`There is no event with id ${eventId}. Use list_events to find event ids.`);
  const rsvps = rsvpSnap.docs.filter((r) => Object.prototype.hasOwnProperty.call(RSVP_ORDER, String(r.get('status'))));
  const answered = new Set(rsvps.map((r) => r.id));
  const responses = rsvps
    .map((r) => {
      const status = String(r.get('status'));
      const note = textOf(r.get('note'));
      return {
        name: textOf(r.get('displayName')) || 'A member',
        status,
        ...(status !== 'no' ? { partySize: partySizeOf(r) } : {}),
        ...(note ? { note: clip(note, MAX_NOTE) } : {}),
        ...(r.get('source') === 'email' ? { viaEmail: true } : {}),
      };
    })
    .sort((a, b) => RSVP_ORDER[a.status] - RSVP_ORDER[b.status] || a.name.localeCompare(b.name));
  return {
    event: { id: event.id, title: textOf(event.get('title')), ...timesOf(event) },
    headcount: headcountOf(rsvps),
    notResponded: active.docs.filter((m) => !answered.has(m.id)).length,
    responses,
  };
}

async function findMembers(db: Firestore, input: unknown): Promise<Json> {
  const { query } = parse('find_members', z.object({ query: z.string().trim().min(1).max(100) }).strict(), input);
  const q = norm(query);
  const snap = await db.collection('members').where('status', '==', 'active').get();
  const matches = snap.docs
    .map((d) => ({
      id: d.id,
      displayName: String(d.get('displayName') ?? '').trim(),
      hasEmail: String(d.get('email') ?? '').trim() !== '',
      role: d.get('role') === 'admin' ? 'admin' : 'member',
    }))
    .filter((m) => norm(m.displayName).includes(q));
  // Names with a word starting with the query first ("den" → Denny before Aden).
  const rank = (name: string) => (norm(name).split(/\s+/).some((w) => w.startsWith(q)) ? 0 : 1);
  matches.sort((a, b) => rank(a.displayName) - rank(b.displayName) || a.displayName.localeCompare(b.displayName));
  return {
    members: matches.slice(0, MAX_MATCHES).map((m) => ({ ...m, displayName: scrub(m.displayName) })),
    ...(matches.length > MAX_MATCHES ? { more: true } : {}),
  };
}

async function countAudience(db: Firestore, input: unknown): Promise<Json> {
  const { audience } = parse('count_audience', z.object({ audience: AudienceSchema }).strict(), input);
  const { recipients, skippedNoEmail } = await resolveAudience(db, audience);
  return { total: recipients.length, skippedNoEmail, description: describeAudience(audience) };
}

async function listRecentEmails(db: Firestore, input: unknown): Promise<Json> {
  const { limit } = parse('list_recent_emails', z.object({ limit: z.number().int().min(1).max(20) }).strict(), input);
  const snap = await db.collection(EMAIL_JOBS).orderBy('createdAt', 'desc').limit(limit).get();
  return {
    emails: snap.docs.map((d) => {
      const createdAt = asDate(d.get('createdAt'));
      return {
        subject: clip(textOf(d.get('subject')), 200),
        createdAt: createdAt ? toGardenLocal(createdAt) : null,
        recipients: Number(d.get('total') ?? 0),
        status: String(d.get('status') ?? 'unknown'),
        test: d.get('test') === true,
      };
    }),
  };
}

const HANDLERS: Record<string, (db: Firestore, input: unknown, ctx: ReadToolContext) => Promise<Json>> = {
  get_garden_info: getGardenInfo,
  list_events: listEvents,
  get_event_rsvps: getEventRsvps,
  find_members: findMembers,
  count_audience: countAudience,
  list_recent_emails: listRecentEmails,
};

/**
 * Run one read tool and answer with compact JSON text for the model. Results
 * never include a member's email address or phone number. Bad input (or a
 * deliberate "not found") comes back as `{"error": "…"}` the model can act on;
 * anything unexpected is thrown for the tool loop to report.
 */
export async function runReadTool(db: Firestore, name: string, input: unknown, ctx: ReadToolContext): Promise<string> {
  const handler = Object.prototype.hasOwnProperty.call(HANDLERS, name) ? HANDLERS[name] : undefined;
  if (!handler) return JSON.stringify({ error: `There is no read tool called ${name}.` });
  try {
    return JSON.stringify(await handler(db, input, ctx));
  } catch (err) {
    if (err instanceof ToolInputError || err instanceof HttpsError) return JSON.stringify({ error: err.message });
    throw err;
  }
}
