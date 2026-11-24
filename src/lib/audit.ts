import { collection, doc, serverTimestamp, setDoc } from 'firebase/firestore';
import { db, ORG_ID } from './firebase.ts';
import { OperationType, handleFirestoreError } from './firestoreError.ts';

export async function recordAuditLog(params: {
  actorUid: string;
  actorName: string;
  actorRole: string;
  action: string;
  targetCollection: string;
  targetId: string;
  summary: string;
}): Promise<void> {
  const ref = doc(collection(db, 'auditLogs'));
  try {
    await setDoc(ref, {
      orgId: ORG_ID,
      actorUid: params.actorUid,
      actorName: params.actorName.slice(0, 160),
      actorRole: params.actorRole.slice(0, 64),
      action: params.action.slice(0, 100),
      targetCollection: params.targetCollection.slice(0, 64),
      targetId: params.targetId.slice(0, 128),
      summary: params.summary.slice(0, 600),
      createdAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `auditLogs/${ref.id}`);
  }
}

export async function sendNotification(params: {
  recipientUid: string;
  title: string;
  message: string;
  category: 'approval' | 'report' | 'leave' | 'finance' | 'project' | 'document' | 'system';
  linkModule?: string;
}): Promise<void> {
  const ref = doc(collection(db, 'notifications'));
  try {
    await setDoc(ref, {
      recipientUid: params.recipientUid,
      title: params.title.slice(0, 200),
      message: params.message.slice(0, 600),
      category: params.category,
      linkModule: params.linkModule || 'dashboard',
      read: false,
      createdAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `notifications/${ref.id}`);
  }
}
