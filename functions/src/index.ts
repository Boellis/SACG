import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import { setGlobalOptions } from 'firebase-functions/v2';
import { logger } from 'firebase-functions/v2';
import * as admin from 'firebase-admin';

admin.initializeApp();

// Match the region of the Trigger Email extension / Firestore (nam5 → us-central1).
setGlobalOptions({ region: 'us-central1' });

/**
 * Who gets the "new person on the waitlist" alert. Add or change addresses here
 * and redeploy (`firebase deploy --only functions`). Each address is emailed.
 */
const NOTIFY_TO = ['southatxgarden@gmail.com'];

const APP_URL = 'https://sacg-garden-app.web.app';

/**
 * When a new member document is created with `status: 'pending'` — i.e. a real
 * person just signed up and is waiting for approval — drop a message in the
 * `mail` collection. The installed Firebase "Trigger Email" extension delivers
 * it, so organizers get an email the moment someone lands on the waitlist.
 *
 * Guarded on `status === 'pending'` so it never fires for admin-imported members
 * (those are written straight to `active`).
 */
export const notifyOnWaitlistSignup = onDocumentCreated('members/{memberId}', async (event) => {
  const snap = event.data;
  if (!snap) return;
  const m = snap.data();
  if (!m || m.status !== 'pending') return;

  const name = (m.displayName ?? '').trim() || '(no name given)';
  const email = (m.email ?? '').trim() || '(no email given)';

  try {
    await admin.firestore().collection('mail').add({
      to: NOTIFY_TO,
      message: {
        subject: `🌱 New waitlist signup: ${name}`,
        text:
          `${name} just requested access to the South Austin Community Garden ` +
          `member portal and is waiting for approval.\n\n` +
          `  Name:  ${name}\n` +
          `  Email: ${email}\n\n` +
          `Review & approve: ${APP_URL}/waitlist\n`,
      },
      toName: 'SACG Organizers',
      createdBy: 'system:waitlist-notify',
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    logger.info(`Queued waitlist alert for ${email} (${event.params.memberId})`);
  } catch (err) {
    logger.error('Failed to queue waitlist alert', err);
    throw err;
  }
});
