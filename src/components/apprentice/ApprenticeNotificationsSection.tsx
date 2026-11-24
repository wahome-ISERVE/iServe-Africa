import { useMemo, useState } from 'react';
import { doc, updateDoc } from 'firebase/firestore';
import {
  Bell,
  BellRing,
  Check,
  CheckCheck,
  AlertTriangle,
  ArrowRight,
  Clock,
  Info,
} from 'lucide-react';
import { db } from '../../lib/firebase.ts';
import { useAuth } from '../../context/AuthContext.tsx';
import { useData } from '../../context/DataContext.tsx';
import {
  Apprentice,
  ApprenticePortalTab,
  NotificationItem,
  formatKes,
  formatNairobiDateTime,
} from '../../types/erp.ts';

interface ApprenticeNotificationsSectionProps {
  apprenticeRecord: Apprentice | null;
  onNavigateTab: (tab: ApprenticePortalTab, action?: 'new_report' | 'new_book' | 'new_leave' | 'new_imprest') => void;
}

function mapNotifToApprenticeTab(n: NotificationItem): ApprenticePortalTab {
  if (n.category === 'leave') return 'leave';
  if (n.category === 'finance') {
    const t = `${n.title} ${n.message}`.toLowerCase();
    return t.includes('pd report') || t.includes('personal development') ? 'pd_reports' : 'imprest';
  }
  if (n.category === 'document') return 'pd_reports';
  if (n.category === 'report') {
    const t = `${n.title} ${n.message}`.toLowerCase();
    return t.includes('book review') ? 'book_reviews' : 'reports';
  }
  if (n.category === 'approval') {
    const t = `${n.title} ${n.message}`.toLowerCase();
    if (t.includes('leave')) return 'leave';
    if (t.includes('imprest')) return 'imprest';
    if (t.includes('book')) return 'book_reviews';
    return 'reports';
  }
  return 'dashboard';
}

export function ApprenticeNotificationsSection({
  onNavigateTab,
}: ApprenticeNotificationsSectionProps) {
  const { profile } = useAuth();
  const {
    notifications,
    apprenticeReports,
    bookReviews,
    imprestRecords,
    imprestRetirements,
    leaveRequests,
  } = useData();

  const [categoryFilter, setCategoryFilter] = useState<'all' | NotificationItem['category']>('all');
  const [readFilter, setReadFilter] = useState<'all' | 'unread'>('all');
  const [markingAll, setMarkingAll] = useState(false);
  const [pushPerm, setPushPerm] = useState<string>(() =>
    typeof window !== 'undefined' && 'Notification' in window ? Notification.permission : 'unsupported'
  );
  const [pushMessage, setPushMessage] = useState<string | null>(null);

  const uid = profile?.uid || '';

  const reminders = useMemo(() => {
    const list: { id: string; title: string; detail: string; tab: ApprenticePortalTab; severity: 'urgent' | 'info' }[] = [];

    const myReports = apprenticeReports.filter((r) => r.apprenticeUserId === uid);
    const returnedReports = myReports.filter((r) => r.status === 'returned');
    returnedReports.forEach((r) => {
      list.push({
        id: `rem-rep-${r.id}`,
        title: `Report returned for revision (${r.periodStart})`,
        detail: r.supervisorComment || 'Review supervisor comments and resubmit.',
        tab: 'reports',
        severity: 'urgent',
      });
    });

    const returnedBooks = bookReviews.filter((b) => b.apprenticeUserId === uid && b.status === 'returned');
    returnedBooks.forEach((b) => {
      list.push({
        id: `rem-book-${b.id}`,
        title: `Book review returned: ${b.bookTitle}`,
        detail: b.supervisorComment || 'Update your book review and resubmit.',
        tab: 'book_reviews',
        severity: 'urgent',
      });
    });

    const retiredIds = new Set(
      imprestRetirements
        .filter((ret) => ret.apprenticeUserId === uid && ret.imprestRecordId && ret.status !== 'draft')
        .map((ret) => ret.imprestRecordId as string)
    );
    imprestRecords
      .filter((rec) => rec.apprenticeUserId === uid && rec.status === 'issued' && !retiredIds.has(rec.id))
      .forEach((rec) => {
        list.push({
          id: `rem-imp-${rec.id}`,
          title: `Outstanding ${rec.category.toUpperCase()} imprest ${rec.referenceNo}`,
          detail: `${formatKes(rec.amountReceivedKes)} issued on ${rec.dateReceived} awaits retirement upload.`,
          tab: 'imprest',
          severity: 'urgent',
        });
      });

    imprestRetirements
      .filter((ret) => ret.apprenticeUserId === uid && ret.status === 'returned')
      .forEach((ret) => {
        list.push({
          id: `rem-ret-${ret.id}`,
          title: `Returned imprest ${ret.referenceNo} needs correction`,
          detail: ret.financeComment || 'Check Finance review comments and re-upload receipts.',
          tab: 'imprest',
          severity: 'urgent',
        });
      });

    const pendingLeaves = leaveRequests.filter(
      (l) => l.userId === uid && (l.status === 'submitted' || l.status === 'pending_hr')
    );
    if (pendingLeaves.length > 0) {
      list.push({
        id: 'rem-leave-pending',
        title: `${pendingLeaves.length} leave application(s) awaiting approval`,
        detail: 'Track supervisor and HR review status under Leave Management.',
        tab: 'leave',
        severity: 'info',
      });
    }

    const currentYm = new Date().toISOString().slice(0, 7);
    const hasMonthReport = myReports.some(
      (r) => r.status !== 'draft' && ((r.periodStart || '').startsWith(currentYm) || (r.submittedAt || '').startsWith(currentYm))
    );
    if (!hasMonthReport) {
      list.push({
        id: 'rem-month-report',
        title: 'Current month report not yet submitted',
        detail: 'Ensure your weekly/monthly apprentice report is submitted on time before month-end.',
        tab: 'reports',
        severity: 'info',
      });
    }

    return list;
  }, [apprenticeReports, bookReviews, imprestRecords, imprestRetirements, leaveRequests, uid]);

  const filteredNotifications = useMemo(() => {
    return notifications.filter((n) => {
      if (categoryFilter !== 'all' && n.category !== categoryFilter) return false;
      if (readFilter === 'unread' && n.read) return false;
      return true;
    });
  }, [notifications, categoryFilter, readFilter]);

  const unreadCount = useMemo(() => notifications.filter((n) => !n.read).length, [notifications]);

  const markRead = async (id: string) => {
    try {
      await updateDoc(doc(db, 'notifications', id), { read: true });
    } catch {
      // Non-blocking notification read state toggle
    }
  };

  const markAllRead = async () => {
    const unread = notifications.filter((n) => !n.read);
    if (unread.length === 0) return;
    setMarkingAll(true);
    try {
      await Promise.all(unread.map((n) => updateDoc(doc(db, 'notifications', n.id), { read: true })));
    } finally {
      setMarkingAll(false);
    }
  };

  const enableBrowserNotifications = async () => {
    setPushMessage(null);
    if (typeof window === 'undefined' || !('Notification' in window)) {
      setPushPerm('unsupported');
      setPushMessage('Browser push alerts are not supported on this device/browser.');
      return;
    }
    try {
      const result = await Notification.requestPermission();
      setPushPerm(result);
      if (result === 'granted') {
        setPushMessage('Device alerts enabled. You will receive browser alerts while this portal is open.');
        new Notification('iServe Africa Apprentice Portal', {
          body: 'Notifications are now enabled on this device.',
        });
      } else if (result === 'denied') {
        setPushMessage('Notifications were blocked in browser settings. Enable site notifications to receive alerts.');
      } else {
        setPushMessage('Notification permission request was dismissed.');
      }
    } catch {
      setPushMessage('Unable to request browser notification permission.');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 font-display">Notifications &amp; Reminders</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Track feedback on reports and book reviews, leave decisions, imprest reviews, and newly published monthly PD reports
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {pushPerm !== 'unsupported' && pushPerm !== 'granted' && (
            <button
              type="button"
              onClick={() => void enableBrowserNotifications()}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-slate-700 bg-white hover:bg-stone-50 border border-stone-300 rounded-lg min-h-[40px]"
            >
              <BellRing className="w-4 h-4 text-emerald-800" />
              Enable Device Alerts
            </button>
          )}
          {unreadCount > 0 && (
            <button
              type="button"
              disabled={markingAll}
              onClick={() => void markAllRead()}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-[var(--brand-primary)] hover:bg-[var(--brand-primary-hover)] rounded-lg min-h-[40px] disabled:opacity-60"
            >
              <CheckCheck className="w-4 h-4" />
              {markingAll ? 'Updating...' : `Mark All Read (${unreadCount})`}
            </button>
          )}
        </div>
      </div>

      {pushMessage && (
        <div className="p-3 bg-stone-100 border border-stone-200 rounded-lg text-xs text-slate-700">
          {pushMessage}
        </div>
      )}

      {/* Approaching Deadlines & Pending Reminders */}
      {reminders.length > 0 && (
        <section className="bg-white border border-stone-200 rounded-xl p-5 space-y-3">
          <div className="flex items-center justify-between border-b border-stone-100 pb-3">
            <h2 className="text-sm font-semibold text-slate-900 font-display">
              Active Reminders &amp; Approaching Deadlines
            </h2>
            <span className="text-xs font-mono text-slate-500 tabular-nums">{reminders.length} active</span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {reminders.map((rem) => (
              <div
                key={rem.id}
                className={`p-3.5 rounded-lg border flex items-start justify-between gap-3 ${
                  rem.severity === 'urgent'
                    ? 'bg-amber-50/70 border-amber-200'
                    : 'bg-stone-50 border-stone-200'
                }`}
              >
                <div className="flex items-start gap-2.5 min-w-0">
                  {rem.severity === 'urgent' ? (
                    <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
                  ) : (
                    <Clock className="w-4 h-4 text-emerald-800 shrink-0 mt-0.5" />
                  )}
                  <div className="min-w-0">
                    <div className="text-xs font-semibold text-slate-900">{rem.title}</div>
                    <p className="text-xs text-slate-600 mt-0.5">{rem.detail}</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => onNavigateTab(rem.tab)}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-emerald-900 bg-white border border-stone-300 rounded-md hover:bg-stone-50 shrink-0 min-h-[36px]"
                >
                  Open
                  <ArrowRight className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Filter Controls */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1 p-1 bg-stone-200/70 rounded-lg overflow-x-auto max-w-full">
          {(
            [
              { key: 'all', label: 'All Alerts' },
              { key: 'report', label: 'Reports & Reviews' },
              { key: 'leave', label: 'Leave' },
              { key: 'finance', label: 'Imprest & PD' },
              { key: 'approval', label: 'Approvals' },
              { key: 'system', label: 'System' },
            ] as { key: 'all' | NotificationItem['category']; label: string }[]
          ).map((f) => (
            <button
              key={f.key}
              type="button"
              onClick={() => setCategoryFilter(f.key)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md whitespace-nowrap transition-colors ${
                categoryFilter === f.key ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setReadFilter(readFilter === 'all' ? 'unread' : 'all')}
            className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors ${
              readFilter === 'unread'
                ? 'bg-emerald-50 border-emerald-300 text-emerald-900'
                : 'bg-white border-stone-300 text-slate-700 hover:bg-stone-50'
            }`}
          >
            {readFilter === 'unread' ? 'Showing Unread Only' : 'Show Unread Only'}
          </button>
        </div>
      </div>

      {/* Notification Feed */}
      <section className="bg-white border border-stone-200 rounded-xl divide-y divide-stone-100">
        {filteredNotifications.length === 0 ? (
          <div className="p-10 text-center space-y-2">
            <Bell className="w-7 h-7 text-slate-300 mx-auto" />
            <div className="text-sm font-medium text-slate-700">No notifications in this view</div>
            <p className="text-xs text-slate-500">
              Alerts appear here automatically when supervisors review reports/book reviews, HR updates leave requests, or Finance publishes monthly PD reports.
            </p>
          </div>
        ) : (
          filteredNotifications.map((n) => {
            const targetTab = mapNotifToApprenticeTab(n);
            return (
              <div
                key={n.id}
                className={`p-4 sm:p-5 flex flex-col sm:flex-row sm:items-start justify-between gap-3 ${
                  n.read ? 'bg-white' : 'bg-emerald-50/40'
                }`}
              >
                <div className="space-y-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    {!n.read ? (
                      <span className="w-2 h-2 rounded-full bg-emerald-700 shrink-0" aria-label="Unread" />
                    ) : (
                      <Info className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                    )}
                    <h3 className="text-sm font-semibold text-slate-900">{n.title}</h3>
                  </div>
                  <p className="text-xs text-slate-600 leading-relaxed">{n.message}</p>
                  <div className="text-[11px] text-slate-400">
                    {n.category.toUpperCase()} · {formatNairobiDateTime(n.createdAt)}
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {!n.read && (
                    <button
                      type="button"
                      onClick={() => void markRead(n.id)}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-emerald-900 bg-white border border-stone-300 rounded-lg hover:bg-stone-50 min-h-[38px]"
                    >
                      <Check className="w-3.5 h-3.5" />
                      Mark Read
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      if (!n.read) void markRead(n.id);
                      onNavigateTab(targetTab);
                    }}
                    className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-white bg-[var(--brand-primary)] hover:bg-[var(--brand-primary-hover)] rounded-lg min-h-[38px]"
                  >
                    Open
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            );
          })
        )}
      </section>
    </div>
  );
}
