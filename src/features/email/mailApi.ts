import {
  addDoc,
  onSnapshot,
  query,
  orderBy,
  limit,
  serverTimestamp,
  type Unsubscribe,
} from 'firebase/firestore';
import { mailCol } from '../../data/collections';
import { personalize } from '../../logic/personalize';
import type { Member, MailDoc } from '../../lib/types';

export type MailRecipient = Pick<Member, 'displayName' | 'email'>;

/**
 * Queue ONE email per recipient in the `mail` collection. The Firebase
 * "Trigger Email" extension delivers each doc as its own individual message,
 * so recipients never share a thread and subject/body can be personalized
 * per person (see {@link personalize}).
 *
 * Returns the number of emails queued.
 */
export interface EnqueueOptions {
  /** Delay between each message so a bulk send doesn't trip the sender's rate
   *  limit (Gmail throttles bursts with a 421 "try again later"). */
  gapMs?: number;
  onProgress?: (done: number, total: number) => void;
}

export async function enqueueIndividualEmails(
  recipients: MailRecipient[],
  subject: string,
  body: string,
  createdBy?: string | null,
  opts?: EnqueueOptions,
): Promise<number> {
  const gapMs = opts?.gapMs ?? 0;
  let done = 0;
  // Sequential + spaced (not Promise.all) so the mail service delivers them at a
  // steady rate instead of a burst that gets rate-limited.
  for (const m of recipients) {
    await addDoc(mailCol, {
      to: [m.email],
      message: {
        subject: personalize(subject, m),
        text: personalize(body, m),
      },
      toName: m.displayName ?? '',
      createdBy: createdBy ?? null,
      createdAt: serverTimestamp(),
    });
    done += 1;
    opts?.onProgress?.(done, recipients.length);
    if (gapMs > 0 && done < recipients.length) {
      await new Promise((resolve) => setTimeout(resolve, gapMs));
    }
  }
  return done;
}

/** Live-subscribe to the most recent queued/sent emails, newest first. */
export function listenRecentMail(cb: (docs: MailDoc[]) => void, max = 25): Unsubscribe {
  const q = query(mailCol, orderBy('createdAt', 'desc'), limit(max));
  return onSnapshot(q, (snap) => {
    cb(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<MailDoc, 'id'>) })));
  });
}
