import React, { useEffect, useState } from 'react';
import {
  Wifi,
  WifiOff,
  RefreshCw,
  Trash2,
  Smartphone,
  CheckCircle2,
  Clock,
  AlertTriangle,
  Database,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext.tsx';
import { useData } from '../context/DataContext.tsx';
import {
  OfflineQueuedItem,
  enqueueOfflineItem,
  flushOfflineQueue,
  loadOfflineQueue,
  removeOfflineItem,
} from '../lib/offlineQueue.ts';
import { formatNairobiDateTime } from '../types/erp.ts';

type QueueCaptureMode = 'apprentice_report' | 'leave_request';

export function MobileSyncPage() {
  const { profile } = useAuth();
  const { apprentices, directory } = useData();

  const [online, setOnline] = useState<boolean>(typeof navigator !== 'undefined' ? navigator.onLine : true);
  const [queue, setQueue] = useState<OfflineQueuedItem[]>(() => loadOfflineQueue());
  const [syncing, setSyncing] = useState(false);
  const [notice, setNotice] = useState<{ tone: 'success' | 'info' | 'error'; text: string } | null>(null);

  const [mode, setMode] = useState<QueueCaptureMode>('apprentice_report');

  // Offline apprentice report fields
  const [repType, setRepType] = useState<'daily' | 'weekly' | 'monthly' | 'activity' | 'reflection'>('weekly');
  const [periodStart, setPeriodStart] = useState(new Date().toISOString().slice(0, 10));
  const [activities, setActivities] = useState('');
  const [lessonsLearned, setLessonsLearned] = useState('');
  const [challenges, setChallenges] = useState('');

  // Offline leave application fields
  const [leaveType, setLeaveType] = useState<'annual' | 'sick' | 'compassionate' | 'study'>('annual');
  const [leaveStart, setLeaveStart] = useState(new Date().toISOString().slice(0, 10));
  const [leaveEnd, setLeaveEnd] = useState(new Date().toISOString().slice(0, 10));
  const [leaveDays, setLeaveDays] = useState('1');
  const [leaveReason, setLeaveReason] = useState('');

  const refreshQueue = () => {
    setQueue(loadOfflineQueue().filter((i) => !profile || i.userId === profile.uid));
  };

  useEffect(() => {
    const onOnline = () => setOnline(true);
    const onOffline = () => setOnline(false);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    window.addEventListener('iserve-offline-queue-updated', refreshQueue);
    refreshQueue();
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
      window.removeEventListener('iserve-offline-queue-updated', refreshQueue);
    };
  }, [profile]);

  const handleManualSync = async () => {
    if (!profile) return;
    if (!navigator.onLine) {
      setNotice({
        tone: 'info',
        text: 'Device is currently offline. Queued items will synchronise automatically once connectivity returns.',
      });
      return;
    }
    setSyncing(true);
    setNotice(null);
    try {
      const result = await flushOfflineQueue(profile.uid);
      refreshQueue();
      if (result.failed > 0) {
        setNotice({
          tone: 'error',
          text: `Synchronised ${result.synced} item(s); ${result.failed} item(s) encountered validation or network errors.`,
        });
      } else if (result.synced > 0) {
        setNotice({
          tone: 'success',
          text: `Successfully synchronised ${result.synced} offline capture record(s) to cloud Firestore.`,
        });
      } else {
        setNotice({ tone: 'info', text: 'Offline queue is already empty and up to date.' });
      }
    } finally {
      setSyncing(false);
    }
  };

  const handleQueueRecord = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile) return;

    const requestId = `req_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    if (mode === 'apprentice_report') {
      const matchedApprentice =
        apprentices.find((a) => a.userId === profile.uid) || apprentices[0];
      const supervisor =
        directory.find((d) => d.role === 'apprentice_supervisor') || directory[0];

      enqueueOfflineItem({
        clientRequestId: requestId,
        type: 'apprentice_report',
        userId: profile.uid,
        userName: profile.displayName,
        userRole: profile.role,
        payload: {
          apprenticeId: matchedApprentice?.id || `app_${profile.uid.slice(0, 8)}`,
          apprenticeName: matchedApprentice?.fullName || profile.displayName,
          supervisorId: matchedApprentice?.supervisorId || supervisor?.uid || profile.uid,
          reportType: repType,
          periodStart,
          periodEnd: periodStart,
          activities: activities.trim(),
          lessonsLearned: lessonsLearned.trim(),
          challenges: challenges.trim(),
          status: 'submitted',
          isDemo: false,
        },
      });
      setActivities('');
      setLessonsLearned('');
      setChallenges('');
    } else {
      enqueueOfflineItem({
        clientRequestId: requestId,
        type: 'leave_request',
        userId: profile.uid,
        userName: profile.displayName,
        userRole: profile.role,
        payload: {
          employeeName: profile.displayName,
          departmentId: profile.departmentId || '',
          leaveType,
          startDate: leaveStart,
          endDate: leaveEnd,
          daysRequested: Math.max(1, Number(leaveDays) || 1),
          reason: leaveReason.trim(),
          status: 'submitted',
          isDemo: false,
        },
      });
      setLeaveReason('');
    }

    refreshQueue();

    if (navigator.onLine) {
      await handleManualSync();
    } else {
      setNotice({
        tone: 'info',
        text: 'Saved to local offline queue. It will automatically sync when internet returns.',
      });
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 font-display">Mobile & Offline Sync Centre</h1>
          <p className="text-sm text-slate-600 mt-1">
            Offline-first capture queue for field apprentices and mobile staff, backed by Firestore local cache and idempotent request IDs.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div
            className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs font-semibold ${
              online ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-amber-50 border-amber-200 text-amber-800'
            }`}
          >
            {online ? <Wifi className="w-3.5 h-3.5" /> : <WifiOff className="w-3.5 h-3.5" />}
            <span>{online ? 'Online · Firestore Cache Active' : 'Offline · Local Queueing Active'}</span>
          </div>
          <button
            type="button"
            onClick={() => void handleManualSync()}
            disabled={syncing}
            className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-[var(--brand-primary)] hover:bg-[var(--brand-primary-hover)] rounded-lg transition-colors disabled:opacity-60 whitespace-nowrap"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${syncing ? 'animate-spin' : ''}`} />
            <span>{syncing ? 'Synchronising...' : `Synchronise Now (${queue.length})`}</span>
          </button>
        </div>
      </div>

      {notice && (
        <div
          className={`px-4 py-3 rounded-lg border text-xs font-medium flex items-center gap-2 ${
            notice.tone === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
              : notice.tone === 'error'
                ? 'bg-red-50 border-red-200 text-red-900'
                : 'bg-amber-50 border-amber-200 text-amber-900'
          }`}
        >
          {notice.tone === 'success' ? (
            <CheckCircle2 className="w-4 h-4 shrink-0" />
          ) : (
            <AlertTriangle className="w-4 h-4 shrink-0" />
          )}
          <span>{notice.text}</span>
        </div>
      )}

      <div className="grid lg:grid-cols-12 gap-6">
        {/* Offline Capture Form */}
        <div className="lg:col-span-6 bg-white border border-stone-200 rounded-xl p-6 space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold text-slate-900 font-display">Field Offline Capture</h2>
              <p className="text-xs text-slate-500">
                Queue records locally with a unique <span className="font-mono">clientRequestId</span>; automatically syncs when online.
              </p>
            </div>
            <div className="flex gap-1.5 bg-stone-100 p-1 rounded-lg">
              <button
                type="button"
                onClick={() => setMode('apprentice_report')}
                className={`px-2.5 py-1 text-xs font-medium rounded-md ${
                  mode === 'apprentice_report' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600'
                }`}
              >
                Apprentice Report
              </button>
              <button
                type="button"
                onClick={() => setMode('leave_request')}
                className={`px-2.5 py-1 text-xs font-medium rounded-md ${
                  mode === 'leave_request' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600'
                }`}
              >
                Leave Request
              </button>
            </div>
          </div>

          <form onSubmit={handleQueueRecord} className="space-y-4">
            {mode === 'apprentice_report' ? (
              <>
                <div className="grid sm:grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="m-rtype" className="block text-xs font-medium text-slate-700 mb-1">
                      Report Type
                    </label>
                    <select
                      id="m-rtype"
                      value={repType}
                      onChange={(e) =>
                        setRepType(e.target.value as 'daily' | 'weekly' | 'monthly' | 'activity' | 'reflection')
                      }
                      className="w-full px-3 py-2 text-sm border border-stone-300 rounded-lg"
                    >
                      <option value="daily">Daily Log</option>
                      <option value="weekly">Weekly Ministry Report</option>
                      <option value="monthly">Monthly Summary</option>
                      <option value="activity">Outreach / Activity Report</option>
                      <option value="reflection">Theological Reflection</option>
                    </select>
                  </div>
                  <div>
                    <label htmlFor="m-pstart" className="block text-xs font-medium text-slate-700 mb-1">
                      Period Date
                    </label>
                    <input
                      id="m-pstart"
                      type="date"
                      required
                      value={periodStart}
                      onChange={(e) => setPeriodStart(e.target.value)}
                      className="w-full px-3 py-2 text-sm border border-stone-300 rounded-lg"
                    />
                  </div>
                </div>
                <div>
                  <label htmlFor="m-act" className="block text-xs font-medium text-slate-700 mb-1">
                    Ministry Activities Completed
                  </label>
                  <textarea
                    id="m-act"
                    rows={3}
                    required
                    minLength={5}
                    placeholder="Record Bible studies led, pastoral visits, or teaching sessions..."
                    value={activities}
                    onChange={(e) => setActivities(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-stone-300 rounded-lg"
                  />
                </div>
                <div className="grid sm:grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="m-less" className="block text-xs font-medium text-slate-700 mb-1">
                      Lessons Learned
                    </label>
                    <textarea
                      id="m-less"
                      rows={2}
                      value={lessonsLearned}
                      onChange={(e) => setLessonsLearned(e.target.value)}
                      className="w-full px-3 py-2 text-sm border border-stone-300 rounded-lg"
                    />
                  </div>
                  <div>
                    <label htmlFor="m-chal" className="block text-xs font-medium text-slate-700 mb-1">
                      Challenges
                    </label>
                    <textarea
                      id="m-chal"
                      rows={2}
                      value={challenges}
                      onChange={(e) => setChallenges(e.target.value)}
                      className="w-full px-3 py-2 text-sm border border-stone-300 rounded-lg"
                    />
                  </div>
                </div>
              </>
            ) : (
              <>
                <div className="grid sm:grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="m-ltype" className="block text-xs font-medium text-slate-700 mb-1">
                      Leave Type
                    </label>
                    <select
                      id="m-ltype"
                      value={leaveType}
                      onChange={(e) =>
                        setLeaveType(e.target.value as 'annual' | 'sick' | 'compassionate' | 'study')
                      }
                      className="w-full px-3 py-2 text-sm border border-stone-300 rounded-lg"
                    >
                      <option value="annual">Annual Leave</option>
                      <option value="sick">Sick Leave</option>
                      <option value="compassionate">Compassionate Leave</option>
                      <option value="study">Study Leave</option>
                    </select>
                  </div>
                  <div>
                    <label htmlFor="m-ldays" className="block text-xs font-medium text-slate-700 mb-1">
                      Days Requested
                    </label>
                    <input
                      id="m-ldays"
                      type="number"
                      min={1}
                      required
                      value={leaveDays}
                      onChange={(e) => setLeaveDays(e.target.value)}
                      className="w-full px-3 py-2 text-sm font-mono border border-stone-300 rounded-lg"
                    />
                  </div>
                  <div>
                    <label htmlFor="m-lstart" className="block text-xs font-medium text-slate-700 mb-1">
                      Start Date
                    </label>
                    <input
                      id="m-lstart"
                      type="date"
                      required
                      value={leaveStart}
                      onChange={(e) => setLeaveStart(e.target.value)}
                      className="w-full px-3 py-2 text-sm border border-stone-300 rounded-lg"
                    />
                  </div>
                  <div>
                    <label htmlFor="m-lend" className="block text-xs font-medium text-slate-700 mb-1">
                      End Date
                    </label>
                    <input
                      id="m-lend"
                      type="date"
                      required
                      value={leaveEnd}
                      onChange={(e) => setLeaveEnd(e.target.value)}
                      className="w-full px-3 py-2 text-sm border border-stone-300 rounded-lg"
                    />
                  </div>
                </div>
                <div>
                  <label htmlFor="m-lreason" className="block text-xs font-medium text-slate-700 mb-1">
                    Leave Reason / Handover Note
                  </label>
                  <textarea
                    id="m-lreason"
                    rows={3}
                    value={leaveReason}
                    onChange={(e) => setLeaveReason(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-stone-300 rounded-lg"
                  />
                </div>
              </>
            )}

            <button
              type="submit"
              className="w-full px-4 py-2.5 text-sm font-semibold text-white bg-[var(--brand-primary)] hover:bg-[var(--brand-primary-hover)] rounded-lg transition-colors"
            >
              {online ? 'Queue & Synchronise Record' : 'Save to Offline Queue'}
            </button>
          </form>
        </div>

        {/* Queue & Android Architecture Panel */}
        <div className="lg:col-span-6 space-y-6">
          <div className="bg-white border border-stone-200 rounded-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-stone-200 flex items-center justify-between">
              <div>
                <h2 className="text-base font-semibold text-slate-900 font-display">Local Sync Queue</h2>
                <p className="text-xs text-slate-500">Pending & failed offline submissions awaiting cloud reconciliation</p>
              </div>
              <span className="font-mono text-xs font-semibold text-slate-700">{queue.length} queued</span>
            </div>

            {queue.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-500 space-y-1">
                <CheckCircle2 className="w-6 h-6 text-emerald-700 mx-auto mb-2" />
                <div className="font-medium text-slate-800">All offline submissions synchronised</div>
                <div>Any reports captured without connectivity appear here until uploaded.</div>
              </div>
            ) : (
              <div className="divide-y divide-stone-100">
                {queue.map((item) => (
                  <div key={item.clientRequestId} className="p-4 flex items-start justify-between gap-3">
                    <div className="space-y-1 text-xs">
                      <div className="flex items-center gap-2">
                        <Clock className="w-3.5 h-3.5 text-amber-700" />
                        <span className="font-semibold text-slate-900">
                          {item.type === 'apprentice_report' ? 'Apprentice Field Report' : 'Leave Application'}
                        </span>
                        <span className="font-mono text-[11px] text-slate-400">
                          {item.clientRequestId.slice(0, 14)}
                        </span>
                      </div>
                      <div className="text-slate-600">
                        Queued {formatNairobiDateTime(item.queuedAtIso)} · Status: {item.syncStatus}
                      </div>
                      {item.errorMessage && (
                        <div className="text-red-700">{item.errorMessage}</div>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        removeOfflineItem(item.clientRequestId);
                        refreshQueue();
                      }}
                      className="p-1.5 text-slate-400 hover:text-red-700 rounded-md"
                      title="Discard queued item"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="bg-white border border-stone-200 rounded-xl p-6 space-y-4">
            <div className="flex items-center gap-2.5">
              <Smartphone className="w-5 h-5 text-emerald-800" />
              <h2 className="text-base font-semibold text-slate-900 font-display">
                Android (Flutter) & Cloud Sync Architecture
              </h2>
            </div>
            <div className="space-y-3 text-xs text-slate-600 leading-relaxed">
              <div className="flex items-start gap-2.5">
                <Database className="w-4 h-4 text-emerald-800 shrink-0 mt-0.5" />
                <div>
                  <strong className="text-slate-900">Shared Cloud Firestore Backend:</strong> Web and Flutter Android apps connect to the same project (<span className="font-mono">gen-lang-client-0928748211</span>) and enforce identical 12-role security rules.
                </div>
              </div>
              <div className="flex items-start gap-2.5">
                <RefreshCw className="w-4 h-4 text-emerald-800 shrink-0 mt-0.5" />
                <div>
                  <strong className="text-slate-900">Idempotent Offline Reconciliation:</strong> Field submissions generate a deterministic <span className="font-mono">clientRequestId</span> locally so automatic retries when network returns never duplicate apprentice reports.
                </div>
              </div>
              <div className="flex items-start gap-2.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-800 shrink-0 mt-0.5" />
                <div>
                  <strong className="text-slate-900">Persistent Local Cache & Push Alerts:</strong> IndexedDB persistence is enabled on web (<span className="font-mono">persistentLocalCache</span>), matching Flutter’s native SQLite/Firestore offline cache and FCM push topic notifications.
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
