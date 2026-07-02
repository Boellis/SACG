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
export async function enqueueIndividualEmails(
  recipients: MailRecipient[],
  subject: string,
  body: string,
  createdBy?: string | null,
): Promise<number> {
  await Promise.all(
    recipients.map((m) =>
      addDoc(mailCol, {
        to: [m.email],
        message: {
          subject: personalize(subject, m),
          text: personalize(body, m),
        },
        toName: m.displayName ?? '',
        createdBy: createdBy ?? null,
        createdAt: serverTimestamp(),
      }),
    ),
  );
  return recipients.length;
}

/** Live-subscribe to the most recent queued/sent emails, newest first. */
export function listenRecentMail(cb: (docs: MailDoc[]) => void, max = 25): Unsubscribe {
  const q = query(mailCol, orderBy('createdAt', 'desc'), limit(max));
  return onSnapshot(q, (snap) => {
    cb(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<MailDoc, 'id'>) })));
  });
}
