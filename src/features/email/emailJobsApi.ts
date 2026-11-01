import { collection, doc, onSnapshot, type Unsubscribe } from 'firebase/firestore';
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
  /**
   * Queue the job under this id (from newEmailJobId), once: a retry with the
   * same id gets back the job an earlier attempt queued instead of a second one.
   */
  jobId?: string;
}

/** A new email job id, made on the device (a Firestore auto-id; no network). Use one per send attempt. */
export function newEmailJobId(): string {
  return doc(collection(db, 'emailJobs')).id;
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
