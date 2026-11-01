import { callFn } from '../../lib/callables';
import type { EventType, RsvpStatus } from '../../lib/types';

/** An invitee's answer as the public RSVP callables report it. */
export interface InviteResponse {
  status: RsvpStatus;
  partySize?: number;
  note?: string;
}

/** What an RSVP link may see (mirrors functions/src/rsvp/callables.ts). */
export interface InviteView {
  event: {
    id: string;
    title: string;
    type: EventType;
    start: string; // ISO instant
    end: string;
    allDay: boolean;
    location?: string;
    description?: string;
  };
  firstName: string;
  response: InviteResponse | null;
  open: boolean;
}

export interface SubmitRsvpInput {
  token: string;
  status: RsvpStatus;
  partySize?: number;
  note?: string;
}

/** Public, no sign-in: load the invitation behind an RSVP link. */
export function getInvite(token: string): Promise<InviteView> {
  return callFn<{ token: string }, InviteView>('rsvpGetInvite', { token });
}

/** Public, no sign-in: record (or change) the invitee's answer. */
export function submitRsvp(input: SubmitRsvpInput): Promise<{ response: InviteResponse }> {
  return callFn<SubmitRsvpInput, { response: InviteResponse }>('rsvpSubmit', input);
}
