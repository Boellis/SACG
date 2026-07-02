import {
  onSnapshot,
  query,
  orderBy,
  setDoc,
  deleteDoc,
  serverTimestamp,
  Timestamp,
  type Unsubscribe,
} from 'firebase/firestore';
import {
  ref as storageRef,
  uploadBytes,
  getDownloadURL,
  deleteObject,
} from 'firebase/storage';
import { storage } from '../../lib/firebase';
import { documentsCol, documentDoc } from '../../data/collections';
import type { Document } from '../../lib/types';

/** Live list of shared-document metadata, newest first. */
export function listenDocuments(cb: (docs: Document[]) => void): Unsubscribe {
  return onSnapshot(query(documentsCol, orderBy('createdAt', 'desc')), (snap) => {
    cb(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Document, 'id'>) })));
  });
}

function newId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export interface UploadDocumentMeta {
  title: string;
  description?: string;
  category?: string;
  expiresAt?: Date | null; // null/undefined = lives indefinitely
  uploadedBy: string;
  uploaderName: string;
}

/** Upload the file bytes to Cloud Storage (documents/{id}/{fileName}), then write
 *  its metadata doc so the whole club can list and download it. */
export async function uploadDocument(file: File, meta: UploadDocumentMeta): Promise<void> {
  const id = newId();
  const storagePath = `documents/${id}/${file.name}`;
  const fileRef = storageRef(storage, storagePath);
  await uploadBytes(fileRef, file);
  const downloadURL = await getDownloadURL(fileRef);
  await setDoc(documentDoc(id), {
    title: meta.title,
    ...(meta.description ? { description: meta.description } : {}),
    ...(meta.category ? { category: meta.category } : {}),
    fileName: file.name,
    storagePath,
    downloadURL,
    size: file.size,
    contentType: file.type || 'application/octet-stream',
    uploadedBy: meta.uploadedBy,
    uploaderName: meta.uploaderName,
    createdAt: serverTimestamp(),
    expiresAt: meta.expiresAt ? Timestamp.fromDate(meta.expiresAt) : null,
  });
}

/** Remove both the stored file and its metadata. A missing storage object
 *  (already gone) is ignored so the metadata still gets cleaned up. */
export async function deleteDocument(d: Document): Promise<void> {
  try {
    await deleteObject(storageRef(storage, d.storagePath));
  } catch (err) {
    const code = (err as { code?: string })?.code;
    if (code !== 'storage/object-not-found') throw err;
  }
  await deleteDoc(documentDoc(d.id));
}

/** Non-expired documents, newest first. Temporary docs (expiresAt in the past)
 *  are hidden; indefinite docs (no expiresAt) always show. Pure + testable. */
export function visibleDocuments(all: Document[], nowMs: number): Document[] {
  return all
    .filter((d) => !d.expiresAt || d.expiresAt.toMillis() > nowMs)
    .sort((a, b) => (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0));
}
