import type { BetaTool } from '@anthropic-ai/sdk/resources/beta/messages/messages';
import type { ActionType } from './schemas';

// JSON schemas for the model. Strict tool use compiles them into a grammar, so
// they use only keywords the API supports there (no minLength / maxLength /
// minimum / maximum / maxItems): length and range limits are stated in the
// descriptions and enforced when every input is re-validated with zod.

type JsonSchema = Record<string, unknown>;

const obj = (properties: Record<string, JsonSchema>, required: string[] = Object.keys(properties)): JsonSchema => ({
  type: 'object',
  properties,
  required,
  additionalProperties: false,
});
const str = (description: string): JsonSchema => ({ type: 'string', description });
const gardenTime = (description: string): JsonSchema => ({
  type: 'string',
  pattern: '^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}$',
  description,
});
const gardenDate = (description: string): JsonSchema => ({ type: 'string', format: 'date', description });

const AUDIENCE: JsonSchema = {
  description:
    'Who gets the email. Always garden members, resolved by the app from the member list; there is no way to give an email address.',
  anyOf: [
    obj({ kind: { type: 'string', const: 'all_active', description: 'Every active member with an email address.' } }),
    obj({ kind: { type: 'string', const: 'admins', description: 'Active admins only.' } }),
    obj({
      kind: { type: 'string', const: 'members', description: 'Specific members.' },
      memberIds: { type: 'array', items: { type: 'string' }, description: 'Member ids from find_members (1 to 100).' },
    }),
    obj({
      kind: {
        type: 'string',
        const: 'event_rsvp',
        description: "Active members by how they answered one event's RSVP.",
      },
      eventId: str('Event id from list_events.'),
      statuses: {
        type: 'array',
        items: { type: 'string', enum: ['yes', 'maybe', 'no', 'none'] },
        description: '"none" means active members who have not answered yet.',
      },
    }),
  ],
};

const SUMMARY = str('One short line describing this proposal, shown on its approval card in the app.');

const EVENT_FIELDS: Record<string, JsonSchema> = {
  title: str('Event title, up to 120 characters.'),
  type: { type: 'string', enum: ['meeting', 'workday', 'other'], description: 'Kind of event.' },
  start: gardenTime('Start in garden time (America/Chicago wall clock), YYYY-MM-DDTHH:mm, e.g. 2026-11-07T09:00.'),
  end: gardenTime('End in garden time, YYYY-MM-DDTHH:mm. Not before the start.'),
  allDay: { type: 'boolean', description: 'True for an all-day event: start at T00:00 and end at T23:59 of the last day.' },
  location: str('Where it happens, up to 200 characters. Leave it out if you do not know it.'),
  description: str('Details shown on the calendar, up to 4,000 characters, plain text.'),
};

const tool =(name: string, description: string, input_schema: JsonSchema): BetaTool => ({
  name,
  description,
  input_schema: input_schema as BetaTool['input_schema'],
  strict: true,
});

/** Every tool the assistant has, in a fixed order (the prompt cache depends on it). */
export const TOOL_DEFINITIONS: BetaTool[] = [
  // ── Read tools: run at once, change nothing ────────────────────────────────
  tool(
    'get_garden_info',
    "Get today's date and time in garden time (America/Chicago), the app's web address and page links, the name of the admin you are helping, and the garden's settings (season, volunteer-hour rules). Use it when you need today's date, a link for a message, or a garden rule.",
    obj({}),
  ),
  tool(
    'list_events',
    'List calendar events that start between two garden dates (both inclusive), oldest first: each event\'s id, garden-local start and end, a readable "when", location, description and RSVP headcount (yes / maybe / no answers, and "people": how many are coming, counting party sizes). Use it before proposing an event (to avoid duplicates), to find an event id, or to answer what is scheduled.',
    obj({
      from: gardenDate('First garden date to include, YYYY-MM-DD.'),
      to: gardenDate('Last garden date to include, YYYY-MM-DD (at most about a year after "from").'),
    }),
  ),
  tool(
    'get_event_rsvps',
    "Get every RSVP answer for one event: each member's name, answer, party size and note, the headcount (people coming, and people who said maybe), and how many active members have not answered. Use it for questions like 'how many are coming?' or 'who said maybe?', e.g. for ordering food.",
    obj({ eventId: str('Event id from list_events.') }),
  ),
  tool(
    'find_members',
    "Search active members by name (any part of a first or last name, any case). Returns up to 10 matches with the member id, name, role and whether they have an email address on file; never contact details. Use it to get member ids for a 'members' audience or a test recipient.",
    obj({ query: str('Part of the member\'s name, e.g. "den" or "smith".') }),
  ),
  tool(
    'count_audience',
    'Count how many members an email audience would reach right now, and how many would be skipped for having no email address. Use it before proposing an email so you can tell the admin how many people it goes to.',
    obj({ audience: AUDIENCE }),
  ),
  tool(
    'list_recent_emails',
    'List the most recent emails the app has queued or sent, newest first: subject, when it was created (garden time), how many recipients, delivery status, and whether it was a test send. Use it to avoid sending a duplicate, or to answer "did that email go out?".',
    obj({ limit: { type: 'integer', description: 'How many to return, 1 to 20.' } }),
  ),

  // ── Propose tools: only save a draft; an admin approves it in the app ─────
  tool(
    'propose_calendar_event',
    'Draft a new calendar event for an admin to approve. Nothing is added to the calendar until an admin approves it in the app. The result gives the proposal\'s action id: use it as rsvp.eventActionId in propose_email to invite members to this event.',
    obj({ ...EVENT_FIELDS, summary: SUMMARY }, ['title', 'type', 'start', 'end', 'allDay', 'summary']),
  ),
  tool(
    'propose_event_update',
    'Draft a change to an event that is already on the calendar (get its id from list_events). Include only the fields that change. Nothing changes until an admin approves it in the app.',
    obj(
      { eventId: str('Id of the event to change, from list_events.'), ...EVENT_FIELDS, summary: SUMMARY },
      ['eventId', 'summary'],
    ),
  ),
  tool(
    'propose_email',
    'Draft an email to garden members for an admin to approve. Nothing is sent until an admin approves it in the app, and the admin can first send a test to one person. The app personalizes {firstName} and {name}. For an RSVP email set rsvp and put {rsvpLink} in the body: every member gets their own link with Yes / Maybe / Can\'t make it buttons and can say how many people are coming.',
    obj(
      {
        audience: AUDIENCE,
        subject: str('Subject line, up to 200 characters. May use {firstName}.'),
        body: str(
          'Plain-text body, up to 20,000 characters, no Markdown. Use {firstName} or {name} to personalize and {rsvpLink} where the RSVP link goes.',
        ),
        rsvp: {
          description:
            'Add personal RSVP links for one event: eventId for an event already on the calendar, or eventActionId for an event you proposed in this conversation.',
          anyOf: [
            obj({ eventId: str('Event id from list_events.') }),
            obj({ eventActionId: str('Action id from the "Proposal saved as action …" result of propose_calendar_event.') }),
          ],
        },
        summary: SUMMARY,
      },
      ['audience', 'subject', 'body', 'summary'],
    ),
  ),
  tool(
    'propose_announcement',
    'Draft an announcement for the Members Lounge billboard, which every active member sees in the app. Nothing is posted until an admin approves it in the app.',
    obj(
      {
        title: str('Headline, up to 120 characters.'),
        body: str('The announcement, up to 4,000 characters, plain text.'),
        pinned: { type: 'boolean', description: 'True to keep it at the top of the billboard.' },
        expiresOn: gardenDate('Optional last garden date it shows, YYYY-MM-DD. Leave it out to keep it up until removed.'),
        summary: SUMMARY,
      },
      ['title', 'body', 'pinned', 'summary'],
    ),
  ),
  tool(
    'propose_poll',
    'Draft a poll for members to vote on in the app, with 2 to 10 answer choices. Nothing is posted until an admin approves it in the app.',
    obj(
      {
        question: str('The question, up to 300 characters.'),
        options: { type: 'array', items: { type: 'string' }, description: '2 to 10 choices, each up to 120 characters.' },
        closesOn: gardenDate('Optional last garden date for voting, YYYY-MM-DD; voting closes at the end of that day.'),
        summary: SUMMARY,
      },
      ['question', 'options', 'summary'],
    ),
  ),
];

/** Tools that only look things up. */
export const READ_TOOLS: Set<string> = new Set([
  'get_garden_info',
  'list_events',
  'get_event_rsvps',
  'find_members',
  'count_audience',
  'list_recent_emails',
]);

/** Which action each propose tool records. */
export const PROPOSE_TOOL_ACTION: Record<string, ActionType> = {
  propose_calendar_event: 'create_event',
  propose_event_update: 'update_event',
  propose_email: 'send_email',
  propose_announcement: 'post_announcement',
  propose_poll: 'create_poll',
};

/** Chip text the chat UI shows for each tool call. */
export const TOOL_LABELS: Record<string, string> = {
  get_garden_info: 'Checked garden info',
  list_events: 'Checked the calendar',
  get_event_rsvps: 'Checked RSVPs',
  find_members: 'Looked up members',
  count_audience: 'Counted recipients',
  list_recent_emails: 'Checked recent emails',
  propose_calendar_event: 'Drafted a calendar event',
  propose_event_update: 'Drafted an event change',
  propose_email: 'Drafted an email',
  propose_announcement: 'Drafted an announcement',
  propose_poll: 'Drafted a poll',
};
