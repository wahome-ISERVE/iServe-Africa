import { useMemo } from 'react';
import {
  FileText,
  BookOpen,
  CalendarDays,
  Wallet,
  GraduationCap,
  Clock,
  ArrowRight,
  Bell,
  CheckCircle2,
  AlertTriangle,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext.tsx';
import { useData } from '../../context/DataContext.tsx';
import { computeApprenticeLeaveSummary } from '../../lib/leaveUtils.ts';
import { StatusText } from '../ui/StatusText.tsx';
import {
  Apprentice,
  ApprenticePortalTab,
  formatKes,
  formatNairobiDate,
  formatNairobiDateTime,
} from '../../types/erp.ts';

interface ApprenticeDashboardHomeProps {
  apprenticeRecord: Apprentice | null;
  onNavigateTab: (tab: ApprenticePortalTab, action?: 'new_report' | 'new_book' | 'new_leave' | 'new_imprest') => void;
}

const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

function getCurrentNairobiYm(): { ym: string; year: number; month: number } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Nairobi',
    year: 'numeric',
    month: '2-digit',
  }).formatToParts(new Date());
  const y = Number(parts.find((p) => p.type === 'year')?.value ?? new Date().getFullYear());
  const m = Number(parts.find((p) => p.type === 'month')?.value ?? new Date().getMonth() + 1);
  return { ym: `${y}-${String(m).padStart(2, '0')}`, year: y, month: m };
}

export function ApprenticeDashboardHome({ apprenticeRecord, onNavigateTab }: ApprenticeDashboardHomeProps) {
  const { profile } = useAuth();
  const {
    apprenticeReports,
    bookReviews,
    leaveRequests,
    leavePolicy,
    imprestRecords,
    imprestRetirements,
    monthlyPdReports,
    notifications,
  } = useData();

  const uid = profile?.uid || '';
  const { ym: currentYm, year: currentYear, month: currentMonth } = useMemo(() => getCurrentNairobiYm(), []);

  const myReports = useMemo(
    () => apprenticeReports.filter((r) => r.apprenticeUserId === uid),
    [apprenticeReports, uid]
  );

  const myReviews = useMemo(
    () => bookReviews.filter((r) => r.apprenticeUserId === uid),
    [bookReviews, uid]
  );

  const myImprestRecords = useMemo(
    () => imprestRecords.filter((r) => r.apprenticeUserId === uid),
    [imprestRecords, uid]
  );

  const myImprestRetirements = useMemo(
    () => imprestRetirements.filter((r) => r.apprenticeUserId === uid),
    [imprestRetirements, uid]
  );

  const myPdReports = useMemo(
    () =>
      [...monthlyPdReports]
        .filter((r) => r.apprenticeUserId === uid)
        .sort((a, b) => (b.reportYear - a.reportYear) || (b.reportMonth - a.reportMonth)),
    [monthlyPdReports, uid]
  );

  const leaveSummary = useMemo(
    () =>
      computeApprenticeLeaveSummary({
        leaveRequests,
        leavePolicy,
        userId: uid,
        apprentice: apprenticeRecord,
      }),
    [leaveRequests, leavePolicy, uid, apprenticeRecord]
  );

  const reportsThisMonth = useMemo(
    () =>
      myReports.filter((r) => {
        if (r.status === 'draft') return false;
        const startYm = (r.periodStart || '').slice(0, 7);
        const subYm = (r.submittedAt || '').slice(0, 7);
        return startYm === currentYm || subYm === currentYm;
      }).length,
    [myReports, currentYm]
  );

  const pendingReportReviews = useMemo(
    () => myReports.filter((r) => r.status === 'submitted' || r.status === 'under_review').length,
    [myReports]
  );

  const outstandingImprestStats = useMemo(() => {
    const retiredRecordIds = new Set(
      myImprestRetirements
        .filter((ret) => ret.imprestRecordId && ['submitted', 'under_review', 'approved', 'settled'].includes(ret.status))
        .map((ret) => ret.imprestRecordId as string)
    );
    const unretiredIssued = myImprestRecords.filter(
      (rec) => rec.status === 'issued' && !retiredRecordIds.has(rec.id)
    );
    const returnedOrDraftRetirements = myImprestRetirements.filter(
      (ret) => ret.status === 'draft' || ret.status === 'returned'
    );
    const totalCount = unretiredIssued.length + returnedOrDraftRetirements.length;
    const totalAmountKes =
      unretiredIssued.reduce((sum, rec) => sum + (rec.amountReceivedKes || 0), 0) +
      returnedOrDraftRetirements.reduce((sum, ret) => sum + (ret.amountReceivedKes || 0), 0);
    return { totalCount, totalAmountKes, unretiredIssued, returnedOrDraftRetirements };
  }, [myImprestRecords, myImprestRetirements]);

  const latestPdReport = myPdReports[0] || null;
  const currentMonthPdPublished = myPdReports.find(
    (r) => r.reportYear === currentYear && r.reportMonth === currentMonth
  );

  const actionItems = useMemo(() => {
    const list: { id: string; label: string; detail: string; tab: ApprenticePortalTab; urgent?: boolean }[] = [];
    myReports
      .filter((r) => r.status === 'returned' || r.status === 'draft')
      .slice(0, 3)
      .forEach((r) => {
        list.push({
          id: `rep-${r.id}`,
          label: r.status === 'returned' ? `Revise ${r.reportType} report (${r.periodStart})` : `Draft ${r.reportType} report (${r.periodStart})`,
          detail: r.status === 'returned' ? r.supervisorComment || 'Supervisor requested updates' : 'Saved draft awaiting submission',
          tab: 'reports',
          urgent: r.status === 'returned',
        });
      });

    myReviews
      .filter((b) => b.status === 'returned' || b.status === 'draft')
      .slice(0, 2)
      .forEach((b) => {
        list.push({
          id: `book-${b.id}`,
          label: b.status === 'returned' ? `Revise book review: ${b.bookTitle}` : `Draft book review: ${b.bookTitle}`,
          detail: b.status === 'returned' ? b.supervisorComment || 'Returned by supervisor' : 'Draft awaiting submission',
          tab: 'book_reviews',
          urgent: b.status === 'returned',
        });
      });

    outstandingImprestStats.unretiredIssued.forEach((rec) => {
      list.push({
        id: `imp-rec-${rec.id}`,
        label: `Retire ${rec.category.toUpperCase()} imprest ${rec.referenceNo}`,
        detail: `${formatKes(rec.amountReceivedKes)} received on ${rec.dateReceived} — ${rec.purpose}`,
        tab: 'imprest',
        urgent: true,
      });
    });

    outstandingImprestStats.returnedOrDraftRetirements.forEach((ret) => {
      list.push({
        id: `imp-ret-${ret.id}`,
        label:
          ret.status === 'returned'
            ? `Correct returned ${ret.category.toUpperCase()} imprest ${ret.referenceNo}`
            : `Complete draft ${ret.category.toUpperCase()} imprest ${ret.referenceNo}`,
        detail: ret.financeComment || ret.purpose || 'Pending submission to Finance',
        tab: 'imprest',
        urgent: ret.status === 'returned',
      });
    });

    return list.slice(0, 6);
  }, [myReports, myReviews, outstandingImprestStats]);

  const recentFeed = useMemo(() => {
    const items: { id: string; title: string; meta: string; status?: string; dateSort: string; tab: ApprenticePortalTab }[] = [];

    myReports.slice(0, 4).forEach((r) => {
      items.push({
        id: `r-${r.id}`,
        title: `${r.reportType.toUpperCase()} Report (${r.periodStart})`,
        meta: r.supervisorComment ? `Supervisor: ${r.supervisorComment}` : 'Apprentice activity report',
        status: r.status,
        dateSort: r.submittedAt || r.periodStart || '',
        tab: 'reports',
      });
    });

    myReviews.slice(0, 3).forEach((b) => {
      items.push({
        id: `b-${b.id}`,
        title: `Book Review: ${b.bookTitle}`,
        meta: `${b.author} · ${b.rating}/5 stars`,
        status: b.status,
        dateSort: b.submittedAt || b.dateCompleted || '',
        tab: 'book_reviews',
      });
    });

    leaveRequests
      .filter((l) => l.userId === uid)
      .slice(0, 3)
      .forEach((l) => {
        items.push({
          id: `l-${l.id}`,
          title: `${l.leaveType.replace(/_/g, ' ')} leave (${l.daysRequested} d)`,
          meta: `${l.startDate} to ${l.endDate}`,
          status: l.status,
          dateSort: l.startDate || '',
          tab: 'leave',
        });
      });

    myImprestRetirements.slice(0, 3).forEach((ret) => {
      items.push({
        id: `i-${ret.id}`,
        title: `${ret.category.toUpperCase()} Imprest ${ret.referenceNo}`,
        meta: `Received ${formatKes(ret.amountReceivedKes)} · Spent ${formatKes(ret.actualSpentKes)}`,
        status: ret.status,
        dateSort: ret.submittedAt || ret.dateReceived || '',
        tab: 'imprest',
      });
    });

    return items.slice(0, 8);
  }, [myReports, myReviews, leaveRequests, uid, myImprestRetirements]);

  const displayName = apprenticeRecord?.fullName || profile?.displayName || 'Apprentice';
  const initials = displayName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() || '')
    .join('') || 'AP';

  const unreadNotifications = notifications.filter((n) => !n.read);

  return (
    <div className="space-y-6">
      {/* Welcome Banner */}
      <section className="bg-white border border-stone-200 rounded-xl p-5 sm:p-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-5">
          <div className="flex items-start sm:items-center gap-4">
            {apprenticeRecord?.photoDataUrl ? (
              <img
                src={apprenticeRecord.photoDataUrl}
                alt={displayName}
                className="w-16 h-16 sm:w-20 sm:h-20 rounded-xl object-cover border border-stone-200 shrink-0"
              />
            ) : (
              <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-xl bg-[var(--brand-primary)] text-white text-xl font-bold flex items-center justify-center shrink-0">
                {initials}
              </div>
            )}

            <div className="space-y-1.5 min-w-0">
              <div className="flex flex-wrap items-center gap-2.5">
                <h1 className="text-xl sm:text-2xl font-bold text-slate-900 font-display">
                  Welcome back, {displayName}
                </h1>
                <StatusText status={apprenticeRecord?.status || 'active'} />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-x-6 gap-y-1 text-xs text-slate-600 pt-0.5">
                <div>
                  <span className="text-slate-400">Apprentice ID:</span>{' '}
                  <span className="font-mono font-semibold text-slate-900">
                    {apprenticeRecord?.apprenticeCode || 'Pending HR Link'}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400">Cohort:</span>{' '}
                  <span className="font-medium text-slate-800">
                    {apprenticeRecord?.cohortName || 'Not Assigned'}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400">Supervisor / RMS:</span>{' '}
                  <span className="font-medium text-slate-800">
                    {apprenticeRecord?.supervisorName || 'Not Assigned'}
                  </span>
                </div>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => onNavigateTab('notifications')}
              className="inline-flex items-center gap-2 px-3.5 py-2.5 text-xs font-medium text-slate-700 bg-stone-50 hover:bg-stone-100 border border-stone-200 rounded-lg min-h-[44px]"
            >
              <Bell className="w-4 h-4 text-emerald-800" />
              <span className="tabular-nums">{unreadNotifications.length} unread alert(s)</span>
            </button>
            <button
              type="button"
              onClick={() => onNavigateTab('profile')}
              className="inline-flex items-center gap-2 px-3.5 py-2.5 text-xs font-medium text-slate-700 bg-white hover:bg-stone-50 border border-stone-300 rounded-lg min-h-[44px]"
            >
              My Profile
            </button>
          </div>
        </div>
      </section>

      {/* 5 Live Summary KPI Cards */}
      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        <button
          type="button"
          onClick={() => onNavigateTab('leave')}
          className="text-left bg-white border border-stone-200 rounded-xl p-4 hover:border-emerald-800/40 transition-colors space-y-1.5"
        >
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>Annual Leave Balance</span>
            <CalendarDays className="w-4 h-4 text-emerald-800" />
          </div>
          <div className="text-2xl font-bold text-slate-900 font-mono tabular-nums">
            {leaveSummary.remainingLeaveDays} <span className="text-sm font-normal text-slate-500">/ {leaveSummary.totalEntitlement} d</span>
          </div>
          <div className="text-xs text-slate-500 tabular-nums">
            {leaveSummary.approvedDaysUsed} used · {leaveSummary.pendingApprovalDays} pending
          </div>
        </button>

        <button
          type="button"
          onClick={() => onNavigateTab('reports')}
          className="text-left bg-white border border-stone-200 rounded-xl p-4 hover:border-emerald-800/40 transition-colors space-y-1.5"
        >
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>Reports This Month</span>
            <FileText className="w-4 h-4 text-emerald-800" />
          </div>
          <div className="text-2xl font-bold text-slate-900 font-mono tabular-nums">{reportsThisMonth}</div>
          <div className="text-xs text-slate-500 tabular-nums">
            {myReports.filter((r) => r.status === 'approved').length} approved total
          </div>
        </button>

        <button
          type="button"
          onClick={() => onNavigateTab('reports')}
          className="text-left bg-white border border-stone-200 rounded-xl p-4 hover:border-emerald-800/40 transition-colors space-y-1.5"
        >
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>Pending Report Reviews</span>
            <Clock className="w-4 h-4 text-amber-600" />
          </div>
          <div className="text-2xl font-bold text-amber-700 font-mono tabular-nums">{pendingReportReviews}</div>
          <div className="text-xs text-slate-500 tabular-nums">
            {myReports.filter((r) => r.status === 'returned').length} returned for revision
          </div>
        </button>

        <button
          type="button"
          onClick={() => onNavigateTab('imprest')}
          className="text-left bg-white border border-stone-200 rounded-xl p-4 hover:border-emerald-800/40 transition-colors space-y-1.5"
        >
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>Outstanding Imprests</span>
            <Wallet className="w-4 h-4 text-emerald-800" />
          </div>
          <div className="text-2xl font-bold text-slate-900 font-mono tabular-nums">
            {outstandingImprestStats.totalCount}
          </div>
          <div className="text-xs text-slate-500 font-mono tabular-nums truncate">
            {formatKes(outstandingImprestStats.totalAmountKes)} to account
          </div>
        </button>

        <button
          type="button"
          onClick={() => onNavigateTab('pd_reports')}
          className="text-left bg-white border border-stone-200 rounded-xl p-4 hover:border-emerald-800/40 transition-colors space-y-1.5"
        >
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>Latest Monthly PD Report</span>
            <GraduationCap className="w-4 h-4 text-emerald-800" />
          </div>
          {latestPdReport ? (
            <>
              <div className="text-base font-bold text-emerald-900 truncate">
                {MONTH_NAMES[(latestPdReport.reportMonth || 1) - 1]} {latestPdReport.reportYear}
              </div>
              <div className="text-xs text-slate-500 truncate">
                {currentMonthPdPublished
                  ? `Published ${formatNairobiDate(currentMonthPdPublished.publishedDate)}`
                  : `${MONTH_NAMES[currentMonth - 1]} pending · View latest`}
              </div>
            </>
          ) : (
            <>
              <div className="text-sm font-semibold text-slate-700">Not Published</div>
              <div className="text-xs text-slate-500">No PD report available yet</div>
            </>
          )}
        </button>
      </section>

      {/* Quick Actions */}
      <section className="bg-white border border-stone-200 rounded-xl p-5 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-900 font-display">Quick Actions</h2>
          <span className="text-xs text-slate-400">Direct access to your core apprenticeship tasks</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          <button
            type="button"
            onClick={() => onNavigateTab('reports', 'new_report')}
            className="flex items-center justify-between gap-2 px-4 py-3 text-left text-xs font-semibold text-white bg-[var(--brand-primary)] hover:bg-[var(--brand-primary-hover)] rounded-lg min-h-[48px] transition-colors"
          >
            <span className="flex items-center gap-2">
              <FileText className="w-4 h-4 shrink-0" />
              Submit Apprentice Report
            </span>
            <ArrowRight className="w-3.5 h-3.5 shrink-0" />
          </button>

          <button
            type="button"
            onClick={() => onNavigateTab('book_reviews', 'new_book')}
            className="flex items-center justify-between gap-2 px-4 py-3 text-left text-xs font-semibold text-slate-900 bg-stone-50 hover:bg-stone-100 border border-stone-300 rounded-lg min-h-[48px] transition-colors"
          >
            <span className="flex items-center gap-2">
              <BookOpen className="w-4 h-4 text-emerald-800 shrink-0" />
              Submit Book Review
            </span>
            <ArrowRight className="w-3.5 h-3.5 text-slate-400 shrink-0" />
          </button>

          <button
            type="button"
            onClick={() => onNavigateTab('leave', 'new_leave')}
            className="flex items-center justify-between gap-2 px-4 py-3 text-left text-xs font-semibold text-slate-900 bg-stone-50 hover:bg-stone-100 border border-stone-300 rounded-lg min-h-[48px] transition-colors"
          >
            <span className="flex items-center gap-2">
              <CalendarDays className="w-4 h-4 text-emerald-800 shrink-0" />
              Apply for Leave
            </span>
            <ArrowRight className="w-3.5 h-3.5 text-slate-400 shrink-0" />
          </button>

          <button
            type="button"
            onClick={() => onNavigateTab('imprest', 'new_imprest')}
            className="flex items-center justify-between gap-2 px-4 py-3 text-left text-xs font-semibold text-slate-900 bg-stone-50 hover:bg-stone-100 border border-stone-300 rounded-lg min-h-[48px] transition-colors"
          >
            <span className="flex items-center gap-2">
              <Wallet className="w-4 h-4 text-emerald-800 shrink-0" />
              Upload Imprest Retirement
            </span>
            <ArrowRight className="w-3.5 h-3.5 text-slate-400 shrink-0" />
          </button>

          <button
            type="button"
            onClick={() => onNavigateTab('pd_reports')}
            className="flex items-center justify-between gap-2 px-4 py-3 text-left text-xs font-semibold text-slate-900 bg-stone-50 hover:bg-stone-100 border border-stone-300 rounded-lg min-h-[48px] transition-colors"
          >
            <span className="flex items-center gap-2">
              <GraduationCap className="w-4 h-4 text-emerald-800 shrink-0" />
              View Monthly PD Report
            </span>
            <ArrowRight className="w-3.5 h-3.5 text-slate-400 shrink-0" />
          </button>
        </div>
      </section>

      {/* Two-Column Action Items & Recent Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <section className="bg-white border border-stone-200 rounded-xl p-5 space-y-3">
          <div className="flex items-center justify-between border-b border-stone-100 pb-3">
            <h2 className="text-sm font-semibold text-slate-900 font-display">Action Required & Pending Tasks</h2>
            <span className="text-xs font-mono text-slate-500 tabular-nums">{actionItems.length} item(s)</span>
          </div>

          {actionItems.length === 0 ? (
            <div className="py-8 text-center space-y-1.5">
              <CheckCircle2 className="w-6 h-6 text-emerald-700 mx-auto" />
              <p className="text-xs font-medium text-slate-800">All drafts and retirements are up to date</p>
              <p className="text-xs text-slate-500">No returned submissions or unretired imprests awaiting action.</p>
            </div>
          ) : (
            <div className="divide-y divide-stone-100">
              {actionItems.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onNavigateTab(item.tab)}
                  className="w-full py-3 flex items-start justify-between gap-3 text-left hover:bg-stone-50/70 rounded-lg px-2 transition-colors"
                >
                  <div className="flex items-start gap-2.5 min-w-0">
                    {item.urgent ? (
                      <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                    ) : (
                      <Clock className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
                    )}
                    <div className="min-w-0">
                      <div className="text-xs font-semibold text-slate-900 truncate">{item.label}</div>
                      <div className="text-xs text-slate-500 line-clamp-1">{item.detail}</div>
                    </div>
                  </div>
                  <span className="text-xs font-medium text-emerald-800 shrink-0">Open</span>
                </button>
              ))}
            </div>
          )}
        </section>

        <section className="bg-white border border-stone-200 rounded-xl p-5 space-y-3">
          <div className="flex items-center justify-between border-b border-stone-100 pb-3">
            <h2 className="text-sm font-semibold text-slate-900 font-display">Recent Submissions & Alerts</h2>
            <button
              type="button"
              onClick={() => onNavigateTab('reports')}
              className="text-xs font-medium text-emerald-800 hover:underline"
            >
              View History
            </button>
          </div>

          {recentFeed.length === 0 && unreadNotifications.length === 0 ? (
            <div className="py-8 text-center text-xs text-slate-500">
              Your submitted reports, book reviews, leave requests, and imprest retirements will appear here.
            </div>
          ) : (
            <div className="divide-y divide-stone-100">
              {unreadNotifications.slice(0, 2).map((n) => (
                <button
                  key={`notif-${n.id}`}
                  type="button"
                  onClick={() => onNavigateTab('notifications')}
                  className="w-full py-2.5 px-2 text-left flex items-start justify-between gap-3 bg-emerald-50/40 rounded-lg"
                >
                  <div className="min-w-0">
                    <div className="text-xs font-semibold text-slate-900">{n.title}</div>
                    <div className="text-xs text-slate-600 line-clamp-1">{n.message}</div>
                  </div>
                  <span className="text-[11px] text-slate-400 shrink-0">{formatNairobiDateTime(n.createdAt)}</span>
                </button>
              ))}
              {recentFeed.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onNavigateTab(item.tab)}
                  className="w-full py-2.5 px-2 text-left flex items-center justify-between gap-3 hover:bg-stone-50/70 rounded-lg transition-colors"
                >
                  <div className="min-w-0">
                    <div className="text-xs font-semibold text-slate-900 truncate">{item.title}</div>
                    <div className="text-xs text-slate-500 truncate">{item.meta}</div>
                  </div>
                  <div className="shrink-0">
                    {item.status && <StatusText status={item.status} />}
                  </div>
                </button>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
