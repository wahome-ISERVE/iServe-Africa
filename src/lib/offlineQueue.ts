import { collection, doc, getDocs, query, serverTimestamp, setDoc, where } from 'firebase/firestore';
import { db, ORG_ID } from './firebase.ts';
import { recordAuditLog } from './audit.ts';

export type OfflineItemType = 'apprentice_report' | 'leave_request';

export interface OfflineQueuedItem {
  clientRequestId: string;
  type: OfflineItemType;
  userId: string;
  userName: string;
  userRole: string;
  queuedAtIso: string;
  syncStatus: 'queued' | 'syncing' | 'failed';
  errorMessage?: string;
  payload: Record<string, unknown>;
}

const STORAGE_KEY = 'iserve_ims_offline_queue_v1';

export function loadOfflineQueue(): OfflineQueuedItem[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveOfflineQueue(items: OfflineQueuedItem[]): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    window.dispatchEvent(new CustomEvent('iserve-offline-queue-updated'));
  } catch {
    // Ignore storage quota errors
  }
}

export function enqueueOfflineItem(item: Omit<OfflineQueuedItem, 'queuedAtIso' | 'syncStatus'>): OfflineQueuedItem {
  const current = loadOfflineQueue();
  const next: OfflineQueuedItem = {
    ...item,
    queuedAtIso: new Date().toISOString(),
    syncStatus: 'queued',
  };
  const deduplicated = current.filter((i) => i.clientRequestId !== item.clientRequestId);
  deduplicated.push(next);
  saveOfflineQueue(deduplicated);
  return next;
}

export function removeOfflineItem(clientRequestId: string): void {
  const current = loadOfflineQueue().filter((i) => i.clientRequestId !== clientRequestId);
  saveOfflineQueue(current);
}

export async function flushOfflineQueue(currentUserUid: string): Promise<{ synced: number; failed: number }> {
  if (!navigator.onLine) return { synced: 0, failed: 0 };
  const queue = loadOfflineQueue();
  const mine = queue.filter((i) => i.userId === currentUserUid);
  if (mine.length === 0) return { synced: 0, failed: 0 };

  let synced = 0;
  let failed = 0;
  const remaining: OfflineQueuedItem[] = queue.filter((i) => i.userId !== currentUserUid);

  for (const item of mine) {
    try {
      if (item.type === 'apprentice_report') {
        // Deduplicate against Firestore via clientRequestId
        const existingSnap = await getDocs(
          query(
            collection(db, 'apprenticeReports'),
            where('apprenticeUserId', '==', currentUserUid),
            where('clientRequestId', '==', item.clientRequestId)
          )
        );
        if (existingSnap.empty) {
          const ref = doc(collection(db, 'apprenticeReports'));
          await setDoc(ref, {
            ...item.payload,
            orgId: ORG_ID,
            apprenticeUserId: currentUserUid,
            clientRequestId: item.clientRequestId,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
          await recordAuditLog({
            actorUid: currentUserUid,
            actorName: item.userName,
            actorRole: item.userRole,
            action: 'OFFLINE_SYNC_REPORT',
            targetCollection: 'apprenticeReports',
            targetId: ref.id,
            summary: `Synchronised offline apprentice report (${String(item.payload.reportType || 'report')})`,
          });
        }
        synced += 1;
      } else if (item.type === 'leave_request') {
        const ref = doc(db, 'leaveRequests');
        await setDoc(ref, {
          ...item.payload,
          orgId: ORG_ID,
          userId: currentUserUid,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        await recordAuditLog({
          actorUid: currentUserUid,
          actorName: item.userName,
          actorRole: item.userRole,
          action: 'OFFLINE_SYNC_LEAVE',
          targetCollection: 'leaveRequests',
          targetId: ref.id,
          summary: `Synchronised offline leave request`,
        });
        synced += 1;
      }
    } catch (err) {
      failed += 1;
      remaining.push({
        ...item,
        syncStatus: 'failed',
        errorMessage: err instanceof Error ? err.message : 'Sync failed',
      });
    }
  }

  saveOfflineQueue(remaining);
  return { synced, failed };
}
