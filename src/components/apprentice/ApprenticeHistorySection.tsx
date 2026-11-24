import { useMemo, useState } from 'react';
import { Download, ArrowRight } from 'lucide-react';
import { useAuth } from '../../context/AuthContext.tsx';
import { useData } from '../../context/DataContext.tsx';
import { exportToCsv } from '../../lib/exports.ts';
import { DataTable, ColumnDef } from '../ui/DataTable.tsx';
import { StatusText } from '../ui/StatusText.tsx';
import { ApprenticePortalTab, formatKes } from '../../types/erp.ts';

interface ApprenticeHistorySectionProps {
  onNavigateTab: (tab: ApprenticePortalTab) => void;
}

type HistoryCategory = 'all' | 'report' | 'book_review' | 'leave' | 'imprest' | 'pd_report';

interface UnifiedHistoryRow {
  id: string;
  category: Exclude<HistoryCategory, 'all'>;
  categoryLabel: string;
  title: string;
  periodOrDate: string;
  summary: string;
  status: string;
  feedback: string;
  targetTab: ApprenticePortalTab;
}

export function ApprenticeHistorySection({ onNavigateTab }: ApprenticeHistorySectionProps) {
  const { profile } = useAuth();
  const { apprenticeReports, bookReviews, leaveRequests, imprestRetirements, monthlyPdReports } = useData();

  const [categoryFilter, setCategoryFilter] = useState<HistoryCategory>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [dateFrom, setDateFrom] = useState<string>('');
  const [dateTo, setDateTo] = useState<string>('');

  const uid = profile?.uid || '';

  const allRows = useMemo<UnifiedHistoryRow[]>(() => {
    const out: UnifiedHistoryRow[] = [];

    apprenticeReports
      .filter((r) => r.apprenticeUserId === uid)
      .forEach((r) => {
        out.push({
          id: `rep-${r.id}`,
          category: 'report',
          categoryLabel: 'Apprentice Report',
          title: `${r.reportType.toUpperCase()} Report`,
          periodOrDate: r.periodStart || (r.submittedAt || '').slice(0, 10),
          summary: r.workProgress || r.activities,
          status: r.status,
          feedback: r.supervisorComment || '—',
          targetTab: 'reports',
        });
      });

    bookReviews
      .filter((b) => b.apprenticeUserId === uid)
      .forEach((b) => {
        out.push({
          id: `book-${b.id}`,
          category: 'book_review',
          categoryLabel: 'Book Review',
          title: b.bookTitle,
          periodOrDate: b.dateCompleted || (b.submittedAt || '').slice(0, 10),
          summary: `${b.author} · ${b.rating}/5 stars`,
          status: b.status,
          feedback: b.supervisorComment || '—',
          targetTab: 'book_reviews',
        });
      });

    leaveRequests
      .filter((l) => l.userId === uid)
      .forEach((l) => {
        out.push({
          id: `lv-${l.id}`,
          category: 'leave',
          categoryLabel: 'Leave Application',
          title: `${l.leaveType.replace(/_/g, ' ')} (${l.daysRequested} d)`,
          periodOrDate: l.startDate,
          summary: `${l.startDate} to ${l.endDate}${l.reason ? ` — ${l.reason}` : ''}`,
          status: l.status,
          feedback: l.hrComment || l.supervisorComment || l.approverComment || '—',
          targetTab: 'leave',
        });
      });

    imprestRetirements
      .filter((ret) => ret.apprenticeUserId === uid)
      .forEach((ret) => {
        out.push({
          id: `imp-${ret.id}`,
          category: 'imprest',
          categoryLabel: 'Imprest Retirement',
          title: `${ret.category.toUpperCase()} ${ret.referenceNo}`,
          periodOrDate: ret.dateReceived,
          summary: `Received ${formatKes(ret.amountReceivedKes)} · Spent ${formatKes(ret.actualSpentKes)}`,
          status: ret.status,
          feedback: ret.financeComment || '—',
          targetTab: 'imprest',
        });
      });

    monthlyPdReports
      .filter((pd) => pd.apprenticeUserId === uid)
      .forEach((pd) => {
        out.push({
          id: `pd-${pd.id}`,
          category: 'pd_report',
          categoryLabel: 'Monthly PD Report',
          title: pd.title,
          periodOrDate: pd.publishedDate || `${pd.periodKey}-01`,
          summary: `${pd.fileName} (v${pd.version})`,
          status: pd.status,
          feedback: `Published by ${pd.uploadedByName}`,
          targetTab: 'pd_reports',
        });
      });

    return out.sort((a, b) => (b.periodOrDate || '').localeCompare(a.periodOrDate || ''));
  }, [apprenticeReports, bookReviews, leaveRequests, imprestRetirements, monthlyPdReports, uid]);

  const filteredRows = useMemo(() => {
    return allRows.filter((row) => {
      if (categoryFilter !== 'all' && row.category !== categoryFilter) return false;
      if (statusFilter !== 'all' && row.status !== statusFilter) return false;
      if (dateFrom && row.periodOrDate < dateFrom) return false;
      if (dateTo && row.periodOrDate > dateTo) return false;
      return true;
    });
  }, [allRows, categoryFilter, statusFilter, dateFrom, dateTo]);

  const handleExport = () => {
    exportToCsv({
      fileName: `apprentice-history-${new Date().toISOString().slice(0, 10)}`,
      columns: [
        { header: 'Module', key: 'categoryLabel' },
        { header: 'Title / Reference', key: 'title' },
        { header: 'Date / Period', key: 'periodOrDate' },
        { header: 'Summary', key: 'summary' },
        { header: 'Status', key: 'status' },
        { header: 'Reviewer Comment', key: 'feedback' },
      ],
      rows: filteredRows.map((r) => ({
        categoryLabel: r.categoryLabel,
        title: r.title,
        periodOrDate: r.periodOrDate,
        summary: r.summary,
        status: r.status,
        feedback: r.feedback,
      })),
    });
  };

  const columns: ColumnDef<UnifiedHistoryRow>[] = [
    {
      key: 'category',
      header: 'Category',
      sortable: true,
      sortValue: (r) => r.categoryLabel,
      render: (r) => <span className="text-xs font-medium text-slate-700">{r.categoryLabel}</span>,
    },
    {
      key: 'title',
      header: 'Submission / Record',
      sortable: true,
      sortValue: (r) => r.title,
      render: (r) => (
        <div>
          <div className="text-xs font-semibold text-slate-900">{r.title}</div>
          <div className="text-xs text-slate-500 line-clamp-1">{r.summary}</div>
        </div>
      ),
    },
    {
      key: 'date',
      header: 'Date / Period',
      sortable: true,
      sortValue: (r) => r.periodOrDate,
      render: (r) => <span className="font-mono text-xs text-slate-700">{r.periodOrDate || '—'}</span>,
    },
    {
      key: 'feedback',
      header: 'Review Comments',
      render: (r) => <span className="text-xs text-slate-600 line-clamp-2 max-w-xs">{r.feedback}</span>,
    },
    {
      key: 'status',
      header: 'Status',
      sortable: true,
      sortValue: (r) => r.status,
      render: (r) => <StatusText status={r.status} />,
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      render: (r) => (
        <button
          type="button"
          onClick={() => onNavigateTab(r.targetTab)}
          className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-emerald-900 bg-white border border-stone-300 rounded-lg hover:bg-stone-50"
        >
          Open
          <ArrowRight className="w-3 h-3" />
        </button>
      ),
    },
  ];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-slate-900 font-display">Central Reporting &amp; Submission History</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Consolidated archive of your reports, book reviews, leave applications, imprest retirements, and monthly PD reports
          </p>
        </div>

        <button
          type="button"
          onClick={handleExport}
          disabled={filteredRows.length === 0}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-slate-700 bg-white border border-stone-300 rounded-lg hover:bg-stone-50 disabled:opacity-50 min-h-[40px]"
        >
          <Download className="w-4 h-4" />
          Export CSV ({filteredRows.length})
        </button>
      </div>

      <div className="bg-white border border-stone-200 rounded-xl p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <div>
          <label className="block text-[11px] font-medium text-slate-500 mb-1">Category</label>
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value as HistoryCategory)}
            className="w-full px-3 py-2 text-xs border border-stone-300 rounded-lg min-h-[38px]"
          >
            <option value="all">All Categories</option>
            <option value="report">Apprentice Reports</option>
            <option value="book_review">Book Reviews</option>
            <option value="leave">Leave Applications</option>
            <option value="imprest">Imprest Retirements</option>
            <option value="pd_report">Monthly PD Reports</option>
          </select>
        </div>

        <div>
          <label className="block text-[11px] font-medium text-slate-500 mb-1">Status</label>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="w-full px-3 py-2 text-xs border border-stone-300 rounded-lg min-h-[38px]"
          >
            <option value="all">All Statuses</option>
            <option value="draft">Draft</option>
            <option value="submitted">Submitted</option>
            <option value="under_review">Under Review</option>
            <option value="pending_hr">Pending HR</option>
            <option value="returned">Returned for Revision</option>
            <option value="approved">Approved</option>
            <option value="settled">Settled</option>
            <option value="published">Published</option>
            <option value="rejected">Rejected</option>
          </select>
        </div>

        <div>
          <label className="block text-[11px] font-medium text-slate-500 mb-1">From Date</label>
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="w-full px-3 py-2 text-xs border border-stone-300 rounded-lg min-h-[38px]"
          />
        </div>

        <div>
          <label className="block text-[11px] font-medium text-slate-500 mb-1">To Date</label>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="w-full px-3 py-2 text-xs border border-stone-300 rounded-lg min-h-[38px]"
          />
        </div>
      </div>

      <DataTable
        rows={filteredRows}
        columns={columns}
        rowKey={(r) => r.id}
        searchPlaceholder="Search history across all modules..."
        searchFilter={(r, q) =>
          r.title.toLowerCase().includes(q) ||
          r.summary.toLowerCase().includes(q) ||
          r.categoryLabel.toLowerCase().includes(q) ||
          r.feedback.toLowerCase().includes(q)
        }
        emptyTitle="No matching submissions"
        emptyDescription="Adjust filters or create a new submission from your Apprentice Dashboard."
      />
    </div>
  );
}
