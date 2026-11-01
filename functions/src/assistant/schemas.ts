import { z } from 'zod';
import { AudienceSchema, DocIdSchema } from '../email/audience';
import { RSVP_LINK_TOKEN } from '../email/compose';
import { parseGardenLocal } from '../lib/time';

/** What an approved proposal does. */
export const ACTION_TYPES = ['create_event', 'update_event', 'send_email', 'post_announcement', 'create_poll'] as const;
export type ActionType = (typeof ACTION_TYPES)[number];

const LOCAL_DATETIME_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;
const LOCAL_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** A real garden wall-clock time (not Feb 30, not inside the spring-forward gap). */
const isGardenTime = (s: string, re: RegExp) => {
  if (!re.test(s)) return false;
  try {
    parseGardenLocal(s);
    return true;
  } catch {
    return false;
  }
};

/** Garden-local (America/Chicago) wall-clock time, `YYYY-MM-DDTHH:mm`. */
export const GardenLocalSchema = z
  .string()
  .refine((s) => isGardenTime(s, LOCAL_DATETIME_RE), 'must be a real garden-local time as YYYY-MM-DDTHH:mm');
/** A garden calendar date, `YYYY-MM-DD`. */
export const GardenDateSchema = z
  .string()
  .refine((s) => isGardenTime(s, LOCAL_DATE_RE), 'must be a real date as YYYY-MM-DD');

const text = (max: number) => z.string().trim().min(1).max(max);
const EventType = z.enum(['meeting', 'workday', 'other']);

const eventFields = {
  title: text(120),
  type: EventType,
  start: GardenLocalSchema,
  end: GardenLocalSchema,
  allDay: z.boolean(),
  location: z.string().trim().max(200).optional(),
  description: z.string().trim().max(4000).optional(),
};

// Same-format wall-clock strings sort chronologically, so a string compare is
// enough (and safe even when a time is malformed).
const endBeforeStart = (start?: string, end?: string) => start !== undefined && end !== undefined && end < start;
const END_BEFORE_START = { message: "can't be before the start", path: ['end'] };

export const CreateEventInput = z
  .object(eventFields)
  .strict()
  .refine((e) => !endBeforeStart(e.start, e.end), END_BEFORE_START);

export const UpdateEventInput = z
  .object({
    eventId: DocIdSchema,
    title: eventFields.title.optional(),
    type: EventType.optional(),
    start: GardenLocalSchema.optional(),
    end: GardenLocalSchema.optional(),
    allDay: z.boolean().optional(),
    location: eventFields.location,
    description: eventFields.description,
  })
  .strict()
  .refine((u) => Object.entries(u).some(([k, v]) => k !== 'eventId' && v !== undefined), {
    message: 'say at least one thing to change',
  })
  .refine((u) => !endBeforeStart(u.start, u.end), END_BEFORE_START);

/** An email's RSVP link: an event on the calendar, or a create_event proposal in this conversation. */
const RsvpLinkSchema = z
  .object({ eventId: DocIdSchema.optional(), eventActionId: DocIdSchema.optional() })
  .strict()
  .refine((r) => (r.eventId === undefined) !== (r.eventActionId === undefined), {
    message: 'give exactly one of eventId or eventActionId',
  });

export const SendEmailInput = z
  .object({
    audience: AudienceSchema,
    subject: text(200),
    body: z
      .string()
      .max(20000)
      .refine((b) => b.trim() !== '', 'must not be empty'),
    rsvp: RsvpLinkSchema.optional(),
  })
  .strict()
  .refine((e) => e.rsvp !== undefined || !`${e.subject}\n${e.body}`.includes(RSVP_LINK_TOKEN), {
    message: `uses ${RSVP_LINK_TOKEN}, so it needs an RSVP event`,
    path: ['rsvp'],
  });

export const AnnouncementInput = z
  .object({
    title: text(120),
    body: text(4000),
    pinned: z.boolean(),
    expiresOn: GardenDateSchema.optional(),
  })
  .strict();

export const PollInput = z
  .object({
    question: text(300),
    options: z.array(text(120)).min(2).max(10),
    closesOn: GardenDateSchema.optional(),
  })
  .strict();

export type CreateEventAction = z.output<typeof CreateEventInput>;
export type UpdateEventAction = z.output<typeof UpdateEventInput>;
export type SendEmailAction = z.output<typeof SendEmailInput>;
export type AnnouncementAction = z.output<typeof AnnouncementInput>;
export type PollAction = z.output<typeof PollInput>;

/** The input schema of each action type, used for proposals and again (with any admin overrides) at approval. */
export const ACTION_SCHEMAS: Record<ActionType, z.ZodType> = {
  create_event: CreateEventInput,
  update_event: UpdateEventInput,
  send_email: SendEmailInput,
  post_announcement: AnnouncementInput,
  create_poll: PollInput,
};

/** `path: message; path: message` — compact enough for a tool result or an error toast. */
export function describeIssues(error: z.ZodError): string {
  return error.issues.map((i) => (i.path.length ? `${i.path.join('.')}: ${i.message}` : i.message)).join('; ');
}
