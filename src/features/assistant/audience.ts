import type { Audience, Member, Rsvp, RsvpStatus } from '../../lib/types';

type Answer = RsvpStatus | 'none';

const ANSWER_ORDER: Answer[] = ['yes', 'maybe', 'no', 'none'];
const ANSWER_TEXT: Record<Answer, string> = {
  yes: 'yes',
  maybe: 'maybe',
  no: 'no',
  none: "haven't responded",
};

/** Plain-English audience summary for the email card. Never names or addresses anyone. */
export function describeAudience(audience: Audience): string {
  switch (audience.kind) {
    case 'all_active':
      return 'All active members';
    case 'admins':
      return 'Admins only';
    case 'members': {
      const n = new Set(audience.memberIds).size;
      return n === 1 ? '1 selected member' : `${n} selected members`;
    }
    case 'event_rsvp': {
      const answers = ANSWER_ORDER.filter((a) => audience.statuses.includes(a)).map((a) => ANSWER_TEXT[a]);
      return answers.length ? `Event RSVPs: ${answers.join(', ')}` : 'Event RSVPs';
    }
  }
}

/**
 * How many emails an audience produces, resolved the way the server does it
 * (active members with an address, one email per address), so the number in the
 * "can't be undone" prompt matches what will go out. `rsvps` are the answers to
 * an `event_rsvp` audience's event; `null` while they load makes that count
 * unknown (`null`), since it can't be worked out without them.
 */
export function audienceRecipientCount(
  audience: Audience,
  members: Member[],
  rsvps: Rsvp[] | null = [],
): number | null {
  const active = members.filter((m) => m.status === 'active');
  let pool: Member[];
  switch (audience.kind) {
    case 'all_active':
      pool = active;
      break;
    case 'admins':
      pool = active.filter((m) => m.role === 'admin');
      break;
    case 'members': {
      const ids = new Set(audience.memberIds);
      pool = active.filter((m) => ids.has(m.id));
      break;
    }
    case 'event_rsvp': {
      if (rsvps === null) return null;
      const answered = new Map<string, Answer>(rsvps.map((r) => [r.id, r.status]));
      const wanted = new Set<string>(audience.statuses);
      pool = active.filter((m) => wanted.has(answered.get(m.id) ?? 'none'));
      break;
    }
  }
  return new Set(pool.map((m) => (m.email ?? '').trim().toLowerCase()).filter(Boolean)).size;
}
