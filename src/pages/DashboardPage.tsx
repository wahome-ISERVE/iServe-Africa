import { useMemo, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Calendar, ArrowUpRight, Database, Sparkles, CheckSquare, Clock, TrendingUp, TrendingDown } from 'lucide-react';
import { useAuth } from '../context/AuthContext.tsx';
import { useData } from '../context/DataContext.tsx';
import { seedDemoEnvironment } from '../lib/demoSeed.ts';
import { ROLE_DEFINITIONS, canAccessModule } from '../lib/rbac.ts';
import { ModuleKey, formatKes, formatNairobiDate, formatNairobiDateTime } from '../types/erp.ts';

interface DashboardPageProps {
  onNavigate: (mod: ModuleKey) => void;
}

function parseFirestoreDate(input: unknown): Date | null {
  if (!input) return null;
  if (input instanceof Date) {
    return Number.isNaN(input.getTime()) ? null : input;
  }
  if (typeof input === 'string') {
    const parsed = new Date(input);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  if (
    typeof input === 'object' &&
    input !== null &&
    'toDate' in input &&
    typeof (input as { toDate: () => Date }).toDate === 'function'
  ) {
    const parsed = (input as { toDate: () => Date }).toDate();
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  if (typeof input === 'object' && input !== null && 'seconds' in input) {
    const parsed = new Date((input as { seconds: number }).seconds * 1000);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  return null;
}

function getYearMonthKey(date: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
  }).formatToParts(date);
  const year = parts.find((p) => p.type === 'year')?.value ?? String(date.getUTCFullYear());
  const month = parts.find((p) => p.type === 'month')?.value ?? String(date.getUTCMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

function getPreviousYearMonthKey(currentYm: string): string {
  const [yStr, mStr] = currentYm.split('-');
  const year = Number(yStr);
  const month = Number(mStr);
  if (!Number.isFinite(year) || !Number.isFinite(month)) return '';
  if (month === 1) return `${year - 1}-12`;
  return `${year}-${String(month - 1).padStart(2, '0')}`;
}

const CHART_COLORS = ['#0d4f3c', '#b45309', '#334155', '#0f766e', '#64748b'];

export function DashboardPage({ onNavigate }: DashboardPageProps) {
  const { profile, effectiveRole, orgSettings, isBootstrappedAdmin } = useAuth();
  const {
    directory,
    departments,
    apprentices,
    apprenticeReports,
    projects,
    budgets,
    financeTransactions,
    bookSales,
    leaveRequests,
    procurementRequests,
    adminMemos,
    auditLogs,
  } = useData();

  const [deptFilter, setDeptFilter] = useState('all');
  const [projectFilter, setProjectFilter] = useState('all');
  const [periodFilter, setPeriodFilter] = useState('all');
  const [seeding, setSeeding] = useState(false);

  const isEmptyDb =
    departments.length === 0 &&
    projects.length === 0 &&
    budgets.length === 0 &&
    apprentices.length === 0;

  const filteredTransactions = useMemo(() => {
    return financeTransactions.filter((t) => {
      if (deptFilter !== 'all' && t.departmentId !== deptFilter) return false;
      if (projectFilter !== 'all' && t.projectId !== projectFilter) return false;
      if (periodFilter === 'approved_only' && !['approved', 'paid', 'retired'].includes(t.status)) {
        return false;
      }
      return true;
    });
  }, [financeTransactions, deptFilter, projectFilter, periodFilter]);

  const filteredBudgets = useMemo(() => {
    return budgets.filter((b) => {
      if (deptFilter !== 'all' && b.departmentId !== deptFilter) return false;
      if (projectFilter !== 'all' && b.projectId !== projectFilter) return false;
      return true;
    });
  }, [budgets, deptFilter, projectFilter]);

  const timeZone = orgSettings.timezone || 'Africa/Nairobi';
  const canAccessApprovals = canAccessModule(effectiveRole, 'approvals');
  const canAccessFinance = canAccessModule(effectiveRole, 'finance');

  const metrics = useMemo(() => {
    const activeStaff = directory.filter((d) => d.status === 'active').length;
    const activeApprentices = apprentices.filter((a) => a.status === 'active' || a.status === 'needs_support').length;
    const activeProjects = projects.filter((p) => p.status === 'active').length;

    const nonRejectedExpenditures = filteredTransactions.filter(
      (t) => t.txType !== 'income' && !['rejected', 'cancelled', 'draft'].includes(t.status)
    );

    const totalExpenditure = nonRejectedExpenditures.reduce(
      (acc, t) => acc + (Number(t.amountKes) || 0),
      0
    );

    // Current & previous calendar month expenditure in organisation timezone (Africa/Nairobi)
    const now = new Date();
    const currentMonthKey = getYearMonthKey(now, timeZone);
    const previousMonthKey = getPreviousYearMonthKey(currentMonthKey);
    const currentMonthLabel = new Intl.DateTimeFormat('en-KE', {
      timeZone,
      month: 'short',
      year: 'numeric',
    }).format(now);

    let currentMonthExpenditure = 0;
    let currentMonthApprovedPaid = 0;
    let currentMonthTxCount = 0;
    let previousMonthExpenditure = 0;

    nonRejectedExpenditures.forEach((t) => {
      // Newly created docs with pending serverTimestamp() resolve to current month immediately
      const txDate = parseFirestoreDate(t.createdAt ?? t.updatedAt) ?? now;
      const ym = getYearMonthKey(txDate, timeZone);
      const amount = Number(t.amountKes) || 0;

      if (ym === currentMonthKey) {
        currentMonthExpenditure += amount;
        currentMonthTxCount += 1;
        if (['approved', 'paid', 'retired'].includes(t.status)) {
          currentMonthApprovedPaid += amount;
        }
      } else if (ym === previousMonthKey) {
        previousMonthExpenditure += amount;
      }
    });

    const momChangePct =
      previousMonthExpenditure > 0
        ? Math.round(((currentMonthExpenditure - previousMonthExpenditure) / previousMonthExpenditure) * 100)
        : null;

    const totalIncome = filteredTransactions
      .filter((t) => t.txType === 'income')
      .reduce((acc, t) => acc + (Number(t.amountKes) || 0), 0);

    const totalAllocated = filteredBudgets.reduce((acc, b) => acc + (Number(b.allocatedKes) || 0), 0);
    const totalBudgetSpent = filteredBudgets.reduce((acc, b) => acc + (Number(b.spentKes) || 0), 0);
    const budgetUtilisationPct = totalAllocated > 0 ? Math.round((totalBudgetSpent / totalAllocated) * 100) : 0;

    const bookstoreSalesTotal = bookSales.reduce((acc, s) => acc + (Number(s.totalKes) || 0), 0);

    // Pending approval requests across Firestore workflow collections (respecting active dept/project filters)
    const pendingFinanceList = financeTransactions.filter(
      (t) =>
        ['submitted', 'pending_approval'].includes(t.status) &&
        (deptFilter === 'all' || t.departmentId === deptFilter) &&
        (projectFilter === 'all' || t.projectId === projectFilter)
    );
    const pendingLeaveList = leaveRequests.filter(
      (l) =>
        ['submitted', 'pending_hr'].includes(l.status) &&
        (deptFilter === 'all' || l.departmentId === deptFilter)
    );
    const selectedDept = departments.find((d) => d.id === deptFilter);
    const includeApprenticeReports =
      projectFilter === 'all' &&
      (deptFilter === 'all' ||
        selectedDept?.code?.toUpperCase() === 'APPR' ||
        selectedDept?.name?.toLowerCase().includes('apprentice'));
    const pendingReportsList = includeApprenticeReports
      ? apprenticeReports.filter((r) => r.status === 'submitted')
      : [];
    const pendingProcurementList = procurementRequests.filter(
      (p) =>
        p.status === 'submitted' &&
        projectFilter === 'all' &&
        (deptFilter === 'all' || p.departmentId === deptFilter)
    );

    const pendingApprovals =
      pendingFinanceList.length +
      pendingLeaveList.length +
      pendingReportsList.length +
      pendingProcurementList.length;

    const pendingApprovalValueKes =
      pendingFinanceList.reduce((acc, t) => acc + (Number(t.amountKes) || 0), 0) +
      pendingProcurementList.reduce((acc, p) => acc + (Number(p.estimatedKes) || 0), 0);

    return {
      activeStaff,
      activeApprentices,
      activeProjects,
      totalExpenditure,
      currentMonthLabel,
      currentMonthExpenditure,
      currentMonthApprovedPaid,
      currentMonthTxCount,
      previousMonthExpenditure,
      momChangePct,
      totalIncome,
      totalAllocated,
      budgetUtilisationPct,
      bookstoreSalesTotal,
      pendingApprovals,
      pendingApprovalValueKes,
      pendingBreakdown: {
        finance: pendingFinanceList.length,
        leave: pendingLeaveList.length,
        apprenticeship: pendingReportsList.length,
        procurement: pendingProcurementList.length,
      },
    };
  }, [
    directory,
    apprentices,
    projects,
    departments,
    filteredTransactions,
    filteredBudgets,
    bookSales,
    financeTransactions,
    leaveRequests,
    apprenticeReports,
    procurementRequests,
    deptFilter,
    projectFilter,
    timeZone,
  ]);

  const deptBudgetChartData = useMemo(() => {
    return departments.map((d) => {
      const deptBudgets = budgets.filter((b) => b.departmentId === d.id);
      const allocated = deptBudgets.reduce((s, b) => s + b.allocatedKes, 0) || d.annualBudgetKes;
      const spent = deptBudgets.reduce((s, b) => s + b.spentKes, 0);
      return {
        name: d.code,
        Allocated: Math.round(allocated / 1000),
        Spent: Math.round(spent / 1000),
      };
    });
  }, [departments, budgets]);

  const incomeVsExpData = useMemo(() => {
    const byType = [
      {
        name: 'Income & Grants',
        Amount: filteredTransactions
          .filter((t) => t.txType === 'income')
          .reduce((s, t) => s + t.amountKes, 0),
      },
      {
        name: 'Bookstore Sales',
        Amount: bookSales.reduce((s, b) => s + b.totalKes, 0),
      },
      {
        name: 'Payments & Expenses',
        Amount: filteredTransactions
          .filter((t) => t.txType === 'payment_request' || t.txType === 'expense')
          .reduce((s, t) => s + t.amountKes, 0),
      },
      {
        name: 'Petty Cash',
        Amount: filteredTransactions
          .filter((t) => t.txType === 'petty_cash')
          .reduce((s, t) => s + t.amountKes, 0),
      },
    ];
    return byType;
  }, [filteredTransactions, bookSales]);

  const apprenticeProgressData = useMemo(() => {
    const counts = {
      Active: apprentices.filter((a) => a.status === 'active').length,
      'Needs Support': apprentices.filter((a) => a.status === 'needs_support').length,
      Completed: apprentices.filter((a) => a.status === 'completed').length,
      Deferred: apprentices.filter((a) => a.status === 'deferred').length,
    };
    return Object.entries(counts)
      .filter(([, value]) => value > 0)
      .map(([name, value]) => ({ name, value }));
  }, [apprentices]);

  const projectProgressData = useMemo(() => {
    return projects.slice(0, 6).map((p) => ({
      name: p.code,
      Progress: p.progressPct,
      Utilisation: p.budgetKes > 0 ? Math.min(100, Math.round((p.spentKes / p.budgetKes) * 100)) : 0,
    }));
  }, [projects]);

  const handleSeedDemo = async () => {
    if (!profile) return;
    setSeeding(true);
    try {
      await seedDemoEnvironment({
        uid: profile.uid,
        name: profile.displayName,
        role: profile.role,
      });
    } finally {
      setSeeding(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header Row */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 font-display">
            {effectiveRole === 'apprentice'
              ? 'Apprentice Ministry Workspace'
              : `${orgSettings.orgName} Executive Dashboard`}
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">
            {ROLE_DEFINITIONS[effectiveRole].label} · {orgSettings.reportingPeriod || orgSettings.fiscalYear} ·
            All figures computed live from Cloud Firestore
          </p>
        </div>

        {/* Management Filters */}
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={deptFilter}
            onChange={(e) => setDeptFilter(e.target.value)}
            aria-label="Filter by department"
            className="px-3 py-1.5 text-xs bg-white border border-stone-300 rounded-lg text-slate-700"
          >
            <option value="all">All Departments</option>
            {departments.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>

          <select
            value={projectFilter}
            onChange={(e) => setProjectFilter(e.target.value)}
            aria-label="Filter by project"
            className="px-3 py-1.5 text-xs bg-white border border-stone-300 rounded-lg text-slate-700"
          >
            <option value="all">All Projects</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.code} — {p.title}
              </option>
            ))}
          </select>

          <select
            value={periodFilter}
            onChange={(e) => setPeriodFilter(e.target.value)}
            aria-label="Filter by status"
            className="px-3 py-1.5 text-xs bg-white border border-stone-300 rounded-lg text-slate-700"
          >
            <option value="all">All Transactions ({orgSettings.fiscalYear})</option>
            <option value="approved_only">Approved & Paid Only</option>
          </select>
        </div>
      </div>

      {/* Empty Database Demo Sandbox Prompt for Super Admin */}
      {isEmptyDb && isBootstrappedAdmin && (
        <div className="bg-white border border-stone-200 rounded-xl p-6 flex flex-wrap items-center justify-between gap-4">
          <div className="space-y-1 max-w-2xl">
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
              <Database className="w-4 h-4 text-emerald-800" />
              <span>Initialise Demonstration Environment</span>
            </div>
            <p className="text-xs text-slate-600 leading-relaxed">
              Your production Firestore database is currently clean. You can populate realistic Kenyan iServe Africa
              demonstration records (clearly flagged as <code className="font-mono">isDemo: true</code> so they stay
              separate from production data and can be cleared in one click under Settings & Audit).
            </p>
          </div>
          <button
            type="button"
            disabled={seeding}
            onClick={() => void handleSeedDemo()}
            className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-[var(--brand-primary)] hover:bg-[var(--brand-primary-hover)] rounded-lg transition-colors disabled:opacity-60 whitespace-nowrap"
          >
            <Sparkles className="w-3.5 h-3.5" />
            {seeding ? 'Populating Demo Records...' : 'Load Demonstration Data'}
          </button>
        </div>
      )}

      {/* Primary KPI Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {/* Real-time Pending Approval Requests KPI Card */}
        <div className="bg-white border border-stone-200 rounded-xl p-5 flex flex-col justify-between gap-2">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-medium text-slate-500 flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-amber-700" />
              Pending Approval Requests
            </span>
            {canAccessApprovals && (
              <button
                type="button"
                onClick={() => onNavigate('approvals')}
                className="inline-flex items-center gap-0.5 text-[11px] font-medium text-emerald-800 hover:underline shrink-0"
              >
                Queue <ArrowUpRight className="w-3 h-3" />
              </button>
            )}
          </div>
          <div className="flex items-baseline justify-between gap-3">
            <div
              className={`text-2xl font-bold font-mono tabular-nums ${
                metrics.pendingApprovals > 0 ? 'text-amber-700' : 'text-slate-900'
              }`}
            >
              {metrics.pendingApprovals}
            </div>
            {metrics.pendingApprovalValueKes > 0 && (
              <span className="text-xs font-mono font-medium text-slate-600 tabular-nums">
                {formatKes(metrics.pendingApprovalValueKes)}
              </span>
            )}
          </div>
          <div className="text-xs text-slate-500 tabular-nums">
            {metrics.pendingBreakdown.finance} finance · {metrics.pendingBreakdown.leave} leave ·{' '}
            {metrics.pendingBreakdown.procurement} procurement · {metrics.pendingBreakdown.apprenticeship} report(s)
          </div>
        </div>

        {/* Real-time Current Month Expenditure KPI Card */}
        <div className="bg-white border border-stone-200 rounded-xl p-5 flex flex-col justify-between gap-2">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-medium text-slate-500">
              Current Month Expenditure ({metrics.currentMonthLabel})
            </span>
            {canAccessFinance && (
              <button
                type="button"
                onClick={() => onNavigate('finance')}
                className="inline-flex items-center gap-0.5 text-[11px] font-medium text-emerald-800 hover:underline shrink-0"
              >
                Finance <ArrowUpRight className="w-3 h-3" />
              </button>
            )}
          </div>
          <div className="flex items-baseline justify-between gap-2 flex-wrap">
            <div className="text-2xl font-bold text-slate-900 font-mono tabular-nums">
              {formatKes(metrics.currentMonthExpenditure)}
            </div>
            {metrics.momChangePct !== null && (
              <span
                className={`inline-flex items-center gap-0.5 text-[11px] font-mono font-medium tabular-nums ${
                  metrics.momChangePct > 0 ? 'text-amber-700' : 'text-emerald-700'
                }`}
              >
                {metrics.momChangePct > 0 ? (
                  <TrendingUp className="w-3 h-3" />
                ) : (
                  <TrendingDown className="w-3 h-3" />
                )}
                {metrics.momChangePct > 0 ? `+${metrics.momChangePct}%` : `${metrics.momChangePct}%`} vs prev. month
              </span>
            )}
          </div>
          <div className="text-xs text-slate-500 tabular-nums">
            {metrics.currentMonthTxCount} transaction(s) · {formatKes(metrics.currentMonthApprovedPaid)} approved/paid
          </div>
        </div>

        <div className="bg-white border border-stone-200 rounded-xl p-5 flex flex-col justify-between gap-2">
          <div className="text-xs font-medium text-slate-500">Organisational Expenditure ({orgSettings.fiscalYear})</div>
          <div className="text-2xl font-bold text-slate-900 font-mono tabular-nums">
            {formatKes(metrics.totalExpenditure)}
          </div>
          <div className="text-xs text-slate-500 tabular-nums">
            Budget utilisation: {metrics.budgetUtilisationPct}% of {formatKes(metrics.totalAllocated)}
          </div>
        </div>

        <div className="bg-white border border-stone-200 rounded-xl p-5 flex flex-col justify-between gap-2">
          <div className="text-xs font-medium text-slate-500">Total Active Staff & Users</div>
          <div className="text-2xl font-bold text-slate-900 font-mono tabular-nums">{metrics.activeStaff}</div>
          <div className="text-xs text-slate-500">Across {departments.length} department(s)</div>
        </div>

        <div className="bg-white border border-stone-200 rounded-xl p-5 flex flex-col justify-between gap-2">
          <div className="text-xs font-medium text-slate-500">Active Apprentices</div>
          <div className="text-2xl font-bold text-slate-900 font-mono tabular-nums">
            {metrics.activeApprentices}
          </div>
          <div className="text-xs text-slate-500">
            {metrics.pendingBreakdown.apprenticeship} report(s) awaiting review
          </div>
        </div>

        <div className="bg-white border border-stone-200 rounded-xl p-5 flex flex-col justify-between gap-2">
          <div className="text-xs font-medium text-slate-500">Bookstore Sales & Projects</div>
          <div className="text-2xl font-bold text-slate-900 font-mono tabular-nums">
            {formatKes(metrics.bookstoreSalesTotal)}
          </div>
          <div className="text-xs text-slate-500 tabular-nums">
            {bookSales.length} POS sale(s) · {metrics.activeProjects} active project(s)
          </div>
        </div>
      </div>

      {/* Charts Row 1 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white border border-stone-200 rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold text-slate-900 font-display">
                Income, Bookstore & Expenditure Summary (KES)
              </h2>
              <p className="text-xs text-slate-500">Live aggregation across Finance & POS records</p>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('finance')}
              className="inline-flex items-center gap-1 text-xs font-medium text-emerald-800 hover:underline"
            >
              Finance <ArrowUpRight className="w-3.5 h-3.5" />
            </button>
          </div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={incomeVsExpData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e7e5e4" />
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#475569' }} />
                <YAxis tick={{ fontSize: 11, fill: '#475569' }} />
                <Tooltip formatter={(val) => formatKes(Number(val ?? 0))} />
                <Bar dataKey="Amount" fill="#0d4f3c" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-white border border-stone-200 rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold text-slate-900 font-display">
                Departmental Budget Utilisation (KES Thousands)
              </h2>
              <p className="text-xs text-slate-500">Approved allocation vs recorded spend</p>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('reports')}
              className="inline-flex items-center gap-1 text-xs font-medium text-emerald-800 hover:underline"
            >
              Export <ArrowUpRight className="w-3.5 h-3.5" />
            </button>
          </div>
          <div className="h-64">
            {deptBudgetChartData.length === 0 ? (
              <div className="h-full flex items-center justify-center text-xs text-slate-400">
                No departmental budgets recorded yet.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={deptBudgetChartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e7e5e4" />
                  <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#475569' }} />
                  <YAxis tick={{ fontSize: 11, fill: '#475569' }} />
                  <Tooltip />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar dataKey="Allocated" fill="#cbd5e1" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="Spent" fill="#0d4f3c" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </div>

      {/* Charts Row 2 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white border border-stone-200 rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold text-slate-900 font-display">Apprenticeship Cohort Standing</h2>
              <p className="text-xs text-slate-500">Active trainees, support flags & completions</p>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('apprenticeship')}
              className="inline-flex items-center gap-1 text-xs font-medium text-emerald-800 hover:underline"
            >
              Portal <ArrowUpRight className="w-3.5 h-3.5" />
            </button>
          </div>
          <div className="h-60">
            {apprenticeProgressData.length === 0 ? (
              <div className="h-full flex items-center justify-center text-xs text-slate-400">
                No apprentices registered yet.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={apprenticeProgressData}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    innerRadius={48}
                    outerRadius={80}
                    paddingAngle={3}
                  >
                    {apprenticeProgressData.map((entry, idx) => (
                      <Cell key={entry.name} fill={CHART_COLORS[idx % CHART_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        <div className="bg-white border border-stone-200 rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold text-slate-900 font-display">Project Progress vs Budget Spend (%)</h2>
              <p className="text-xs text-slate-500">Deliverable completion compared to funds drawn</p>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('projects')}
              className="inline-flex items-center gap-1 text-xs font-medium text-emerald-800 hover:underline"
            >
              Projects <ArrowUpRight className="w-3.5 h-3.5" />
            </button>
          </div>
          <div className="h-60">
            {projectProgressData.length === 0 ? (
              <div className="h-full flex items-center justify-center text-xs text-slate-400">
                No projects registered yet.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={projectProgressData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e7e5e4" />
                  <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#475569' }} />
                  <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: '#475569' }} />
                  <Tooltip />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar dataKey="Progress" fill="#0d4f3c" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="Utilisation" fill="#b45309" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </div>

      {/* Upcoming Events & Recent Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white border border-stone-200 rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-900 font-display">
              Upcoming Organisational Events & Memos
            </h2>
            <button
              type="button"
              onClick={() => onNavigate('procurement')}
              className="text-xs font-medium text-emerald-800 hover:underline"
            >
              View all
            </button>
          </div>
          {adminMemos.length === 0 ? (
            <p className="text-xs text-slate-500 py-4">No upcoming events or memos scheduled.</p>
          ) : (
            <div className="divide-y divide-stone-100">
              {adminMemos.slice(0, 5).map((m) => (
                <div key={m.id} className="py-3 flex items-start justify-between gap-3">
                  <div className="space-y-0.5">
                    <div className="text-sm font-medium text-slate-900">{m.title}</div>
                    <div className="text-xs text-slate-500 line-clamp-2">{m.body}</div>
                    <div className="text-[11px] text-slate-400">
                      {m.recordType} · {m.location || 'Nairobi'}
                    </div>
                  </div>
                  <div className="text-xs font-mono text-slate-600 shrink-0 flex items-center gap-1">
                    <Calendar className="w-3.5 h-3.5 text-slate-400" />
                    {m.eventDate ? formatNairobiDate(m.eventDate) : formatNairobiDate(m.createdAt)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="bg-white border border-stone-200 rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-900 font-display">Recent Organisational Activity</h2>
            <button
              type="button"
              onClick={() => onNavigate('approvals')}
              className="inline-flex items-center gap-1 text-xs font-medium text-emerald-800 hover:underline"
            >
              <CheckSquare className="w-3.5 h-3.5" />
              Approvals ({metrics.pendingApprovals})
            </button>
          </div>
          {auditLogs.length === 0 ? (
            <p className="text-xs text-slate-500 py-4">No system activity recorded yet.</p>
          ) : (
            <div className="divide-y divide-stone-100">
              {auditLogs.slice(0, 6).map((log) => (
                <div key={log.id} className="py-2.5 flex items-start justify-between gap-3">
                  <div className="space-y-0.5 min-w-0">
                    <div className="text-xs font-semibold text-slate-800 truncate">{log.summary}</div>
                    <div className="text-[11px] text-slate-500">
                      {log.actorName} · {log.action} · {log.targetCollection}
                    </div>
                  </div>
                  <div className="text-[11px] font-mono text-slate-400 shrink-0">
                    {formatNairobiDateTime(log.createdAt)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
