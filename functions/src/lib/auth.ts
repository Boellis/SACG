import type { Firestore } from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/v2/https';

export interface AdminCaller {
  uid: string;
  displayName: string;
  email: string;
}

/**
 * Gate for admin-only callables. Mirrors the rules' `isAdmin()`:
 * the caller must be signed in and `members/{uid}.role` must be 'admin'.
 */
export async function requireAdmin(
  db: Firestore,
  auth: { uid: string } | undefined,
): Promise<AdminCaller> {
  if (!auth?.uid) throw new HttpsError('unauthenticated', 'Please sign in first.');
  const snap = await db.collection('members').doc(auth.uid).get();
  if (!snap.exists || snap.get('role') !== 'admin') {
    throw new HttpsError('permission-denied', 'Only garden admins can do this.');
  }
  return {
    uid: auth.uid,
    displayName: String(snap.get('displayName') ?? '').trim() || 'Admin',
    email: String(snap.get('email') ?? '').trim(),
  };
}
