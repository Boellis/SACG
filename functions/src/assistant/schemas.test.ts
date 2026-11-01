import { describe, it, expect } from 'vitest';
import {
  ACTION_SCHEMAS,
  ACTION_TYPES,
  AnnouncementInput,
  CreateEventInput,
  describeIssues,
  PollInput,
  SendEmailInput,
  UpdateEventInput,
} from './schemas';

/** Denny's request: the Nov 7 meeting, 9–10 AM garden time. */
const dennyMeeting = {
  title: 'November Member Meeting',
  type: 'meeting',
  start: '2026-11-07T09:00',
  end: '2026-11-07T10:00',
  allDay: false,
  location: 'Garden pavilion',
  description: 'Monthly meeting, then the workday. Food provided, so please RSVP.',
};

const rsvpEmail = {
  audience: { kind: 'all_active' },
  subject: 'RSVP: November 7 meeting and workday',
  body: 'Hi {firstName},\n\nPlease RSVP by Wednesday, November 4: {rsvpLink}\n\nBrandon',
  rsvp: { eventActionId: 'act-1' },
};

const issuesOf = (r: { success: boolean; error?: { issues: Array<{ path: PropertyKey[] }> } }) =>
  r.success ? [] : r.error!.issues.map((i) => i.path.join('.'));

describe('CreateEventInput', () => {
  it('accepts the Denny meeting as given', () => {
    const r = CreateEventInput.safeParse(dennyMeeting);
    expect(r.success).toBe(true);
    expect(r.data).toEqual(dennyMeeting);
  });

  it('trims text fields and drops nothing else', () => {
    const r = CreateEventInput.safeParse({ ...dennyMeeting, title: '  November Member Meeting  ' });
    expect(r.data?.title).toBe('November Member Meeting');
  });

  it('rejects an end before the start, on the end field', () => {
    const r = CreateEventInput.safeParse({ ...dennyMeeting, end: '2026-11-07T08:59' });
    expect(r.success).toBe(false);
    expect(issuesOf(r)).toEqual(['end']);
  });

  it('accepts an end equal to the start', () => {
    expect(CreateEventInput.safeParse({ ...dennyMeeting, end: dennyMeeting.start }).success).toBe(true);
  });

  it.each([
    ['a space instead of T', '2026-11-07 09:00'],
    ['a one-digit hour', '2026-11-07T9:00'],
    ['seconds', '2026-11-07T09:00:00'],
    ['a UTC suffix', '2026-11-07T09:00Z'],
    ['a date only', '2026-11-07'],
    ['an impossible date', '2026-02-30T09:00'],
    ['a time inside the spring-forward gap', '2027-03-14T02:30'],
  ])('rejects a start with %s', (_label, start) => {
    const r = CreateEventInput.safeParse({ ...dennyMeeting, start, end: '2027-12-31T10:00' });
    expect(r.success).toBe(false);
    expect(issuesOf(r)).toContain('start');
  });

  it('rejects a blank title, an over-long title and an unknown type', () => {
    expect(issuesOf(CreateEventInput.safeParse({ ...dennyMeeting, title: '   ' }))).toEqual(['title']);
    expect(issuesOf(CreateEventInput.safeParse({ ...dennyMeeting, title: 'x'.repeat(121) }))).toEqual(['title']);
    expect(issuesOf(CreateEventInput.safeParse({ ...dennyMeeting, type: 'party' }))).toEqual(['type']);
  });

  it('rejects a location over 200 or a description over 4000 characters', () => {
    expect(issuesOf(CreateEventInput.safeParse({ ...dennyMeeting, location: 'x'.repeat(201) }))).toEqual(['location']);
    expect(issuesOf(CreateEventInput.safeParse({ ...dennyMeeting, description: 'x'.repeat(4001) }))).toEqual([
      'description',
    ]);
  });

  it('rejects a missing required field and an extra key', () => {
    const { allDay: _omit, ...noAllDay } = dennyMeeting;
    expect(CreateEventInput.safeParse(noAllDay).success).toBe(false);
    expect(CreateEventInput.safeParse({ ...dennyMeeting, createdBy: 'someone' }).success).toBe(false);
  });
});

describe('UpdateEventInput', () => {
  it('accepts an event id plus only the fields that change', () => {
    expect(UpdateEventInput.safeParse({ eventId: 'E1', location: 'Tool shed' }).success).toBe(true);
  });

  it('rejects an update that changes nothing', () => {
    expect(UpdateEventInput.safeParse({ eventId: 'E1' }).success).toBe(false);
  });

  it('rejects an end before the start when both are given', () => {
    const r = UpdateEventInput.safeParse({ eventId: 'E1', start: '2026-11-07T10:00', end: '2026-11-07T09:00' });
    expect(issuesOf(r)).toEqual(['end']);
  });

  it('rejects a path-like event id and an extra key', () => {
    expect(UpdateEventInput.safeParse({ eventId: 'events/E1', title: 'x' }).success).toBe(false);
    expect(UpdateEventInput.safeParse({ eventId: 'E1', title: 'x', createdBy: 'y' }).success).toBe(false);
  });
});

describe('SendEmailInput', () => {
  it('accepts an RSVP email to all active members for a proposed event', () => {
    expect(SendEmailInput.safeParse(rsvpEmail).success).toBe(true);
  });

  it('accepts an RSVP email for an event already on the calendar, and a plain email', () => {
    expect(SendEmailInput.safeParse({ ...rsvpEmail, rsvp: { eventId: 'E1' } }).success).toBe(true);
    const { rsvp: _r, ...plain } = rsvpEmail;
    expect(SendEmailInput.safeParse({ ...plain, body: 'Hi {firstName}, see you Saturday.' }).success).toBe(true);
  });

  it("rejects a raw-address audience: there is no {kind:'emails'}", () => {
    const r = SendEmailInput.safeParse({ ...rsvpEmail, audience: { kind: 'emails', emails: ['evil@example.com'] } });
    expect(r.success).toBe(false);
    expect(issuesOf(r)).toEqual(['audience.kind']);
  });

  it('rejects an audience that smuggles an address into a real kind', () => {
    const r = SendEmailInput.safeParse({ ...rsvpEmail, audience: { kind: 'all_active', to: 'evil@example.com' } });
    expect(r.success).toBe(false);
  });

  it('rejects rsvp with both eventId and eventActionId, or with neither', () => {
    expect(SendEmailInput.safeParse({ ...rsvpEmail, rsvp: { eventId: 'E1', eventActionId: 'act-1' } }).success).toBe(
      false,
    );
    expect(SendEmailInput.safeParse({ ...rsvpEmail, rsvp: {} }).success).toBe(false);
  });

  it('rejects {rsvpLink} without an RSVP event', () => {
    const { rsvp: _r, ...noRsvp } = rsvpEmail;
    const r = SendEmailInput.safeParse(noRsvp);
    expect(r.success).toBe(false);
    expect(issuesOf(r)).toEqual(['rsvp']);
  });

  it('rejects a blank subject or body, and over-long ones', () => {
    expect(issuesOf(SendEmailInput.safeParse({ ...rsvpEmail, subject: '  ' }))).toEqual(['subject']);
    expect(issuesOf(SendEmailInput.safeParse({ ...rsvpEmail, subject: 'x'.repeat(201) }))).toEqual(['subject']);
    expect(issuesOf(SendEmailInput.safeParse({ ...rsvpEmail, body: ' \n ' }))).toEqual(['body']);
    expect(issuesOf(SendEmailInput.safeParse({ ...rsvpEmail, body: 'x'.repeat(20_001) }))).toEqual(['body']);
  });

  it('rejects an extra key such as a raw "to" list', () => {
    expect(SendEmailInput.safeParse({ ...rsvpEmail, to: ['evil@example.com'] }).success).toBe(false);
  });
});

describe('AnnouncementInput', () => {
  const post = { title: 'Water shut-off Saturday', body: 'The spigots are off 8–10 AM.', pinned: true };

  it('accepts an announcement with or without an expiry date', () => {
    expect(AnnouncementInput.safeParse(post).success).toBe(true);
    expect(AnnouncementInput.safeParse({ ...post, expiresOn: '2026-11-08' }).success).toBe(true);
  });

  it('rejects a bad expiry date, a blank body and an extra key', () => {
    expect(issuesOf(AnnouncementInput.safeParse({ ...post, expiresOn: '2026-11-31' }))).toEqual(['expiresOn']);
    expect(issuesOf(AnnouncementInput.safeParse({ ...post, expiresOn: '11/08/2026' }))).toEqual(['expiresOn']);
    expect(issuesOf(AnnouncementInput.safeParse({ ...post, body: '' }))).toEqual(['body']);
    expect(AnnouncementInput.safeParse({ ...post, linkUrl: 'https://example.com' }).success).toBe(false);
  });
});

describe('PollInput', () => {
  const poll = { question: 'What should we plant this spring?', options: ['Tomatoes', 'Peppers'] };

  it('accepts 2 to 10 options and an optional close date', () => {
    expect(PollInput.safeParse(poll).success).toBe(true);
    expect(PollInput.safeParse({ ...poll, closesOn: '2026-11-15' }).success).toBe(true);
    expect(PollInput.safeParse({ ...poll, options: Array.from({ length: 10 }, (_, i) => `Option ${i}`) }).success).toBe(
      true,
    );
  });

  it('rejects 1 or 11 options, a blank option and an over-long one', () => {
    expect(PollInput.safeParse({ ...poll, options: ['Tomatoes'] }).success).toBe(false);
    expect(PollInput.safeParse({ ...poll, options: Array.from({ length: 11 }, (_, i) => `Option ${i}`) }).success).toBe(
      false,
    );
    expect(PollInput.safeParse({ ...poll, options: ['Tomatoes', '  '] }).success).toBe(false);
    expect(PollInput.safeParse({ ...poll, options: ['Tomatoes', 'x'.repeat(121)] }).success).toBe(false);
  });
});

describe('ACTION_SCHEMAS', () => {
  it('has one schema per action type', () => {
    expect(ACTION_TYPES).toEqual(['create_event', 'update_event', 'send_email', 'post_announcement', 'create_poll']);
    expect(Object.keys(ACTION_SCHEMAS).sort()).toEqual([...ACTION_TYPES].sort());
    expect(ACTION_SCHEMAS.create_event).toBe(CreateEventInput);
    expect(ACTION_SCHEMAS.send_email).toBe(SendEmailInput);
  });
});

describe('describeIssues', () => {
  it('names each failing field so the model can fix its input', () => {
    const r = SendEmailInput.safeParse({ ...rsvpEmail, subject: '', audience: { kind: 'emails' } });
    const text = describeIssues(r.error!);
    expect(text).toMatch(/^audience\.kind: /);
    expect(text).toContain('; subject: ');
  });
});
