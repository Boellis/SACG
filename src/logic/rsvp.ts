import type { Member, Rsvp } from '../lib/types';

export interface RsvpHeadcount {
  yes: number;
  maybe: number;
  no: number;
  /** People coming: Σ yes party sizes (a yes without one counts as 1). */
  people: number;
  /** People who might come: Σ maybe party sizes. */
  maybePeople: number;
}

export function rsvpHeadcount(rsvps: Rsvp[]): RsvpHeadcount {
  const out: RsvpHeadcount = { yes: 0, maybe: 0, no: 0, people: 0, maybePeople: 0 };
  for (const r of rsvps) {
    if (r.status === 'yes') {
      out.yes += 1;
      out.people += r.partySize ?? 1;
    } else if (r.status === 'maybe') {
      out.maybe += 1;
      out.maybePeople += r.partySize ?? 1;
    } else if (r.status === 'no') {
      out.no += 1;
    }
  }
  return out;
}

/** How many emails the server would send to these members: one per address,
 *  members without an address skipped. */
function uniqueAddressCount(members: Member[]): number {
  return new Set(members.map((m) => (m.email ?? '').trim().toLowerCase()).filter(Boolean)).size;
}

/**
 * Recipient counts for the RSVP invitation audiences, resolved the same way
 * the server resolves them (active members, with an email, de-duplicated).
 */
export function inviteAudienceCounts(
  members: Member[],
  rsvps: Rsvp[],
): { allActive: number; notResponded: number } {
  const active = members.filter((m) => m.status === 'active');
  const answered = new Set(rsvps.map((r) => r.id));
  return {
    allActive: uniqueAddressCount(active),
    notResponded: uniqueAddressCount(active.filter((m) => !answered.has(m.id))),
  };
}
