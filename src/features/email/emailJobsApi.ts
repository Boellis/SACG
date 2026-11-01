import { doc, onSnapshot, type Unsubscribe } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { callFn } from '../../lib/callables';
import type { Audience, EmailJob } from '../../lib/types';

export interface QueueMemberEmailInput {
  audience: Audience;
  subject: string;
  body: string;
  /** Adds each recipient's personal RSVP link + Yes/Maybe/No buttons for this event. */
  rsvpEventId?: string;
  /** Send only to this one member (a test send); the audience is ignored. */
  testMemberId?: string;
  source?: 'calendar' | 'email-page';
}

export interface QueueMemberEmailResult {
  jobId: string;
  total: number;
  skipped: number;
}

/** Ask the server to resolve the audience and queue the send (admin only). */
export function queueMemberEmail(input: QueueMemberEmailInput): Promise<QueueMemberEmailResult> {
  return callFn<QueueMemberEmailInput, QueueMemberEmailResult>('queueMemberEmail', input);
}

/** Live-follow one email job's progress (null while it doesn't exist). */
export function listenEmailJob(jobId: string, cb: (job: EmailJob | null) => void): Unsubscribe {
  return onSnapshot(doc(db, 'emailJobs', jobId), (snap) => {
    cb(snap.exists() ? ({ id: snap.id, ...snap.data() } as EmailJob) : null);
  });
}
