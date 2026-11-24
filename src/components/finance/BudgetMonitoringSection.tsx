import { useMemo, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  AlertTriangle,
  Building2,
  Download,
  Eye,
  FolderKanban,
  Pencil,
  Plus,
} from 'lucide-react';
import { exportToCsv } from '../../lib/exports.ts';
import { Modal } from '../ui/Modal.tsx';
import { StatusText } from '../ui/StatusText.tsx';
import {
  Budget,
  Department,
  FinanceTransaction,
  Project,
  formatKes,
  formatNairobiDate,
} from '../../types/erp.ts';

interface BudgetMonitoringSectionProps {
  budgets: Budget[];
  financeTransactions: FinanceTransaction[];
  departments: Department[];
  projects: Project[];
  fiscalYear: string;
  canManageBudgets: boolean;
  onCreateBudget: () => void;
  onEditBudget: (budget: Budget) => void;
}

interface EnrichedBudget extends Budget {
  projectCode?: string;
  projectTitle?: string;
  baselineSpentKes: number;
  liveApprovedKes: number;
  livePendingKes: number;
  realTimeSpentKes: number;
  projectedSpentKes: number;
  remainingKes: number;
  utilisationPct: number;
  projectedPct: number;
  matchedTransactions: FinanceTransaction[];
}

type ScopeFilter = 'all' | 'departmental' | 'project' | 'organisational';
type ChartGrouping = 'budget' | 'department' | 'project';

const SCOPE_LABELS: Record<Budget['scope'], string> = {
  departmental: 'Departmental',
  project: 'Project-Specific',
  organisational: 'Organisational',
};

export function BudgetMonitoringSection({
  budgets,
  financeTransactions,
  departments,
  projects,
  fiscalYear,
  canManageBudgets,
  onCreateBudget,
  onEditBudget,
}: BudgetMonitoringSectionProps) {
  const [scopeFilter, setScopeFilter] = useState<ScopeFilter>('all');
  const [deptFilter, setDeptFilter] = useState('all');
  const [projectFilter, setProjectFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'closed'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [chartGrouping, setChartGrouping] = useState<ChartGrouping>('budget');
  const [inspectBudgetId, setInspectBudgetId] = useState<string | null>(null);

  const enrichedBudgets = useMemo<EnrichedBudget[]>(() => {
    const projectBudgetCounts = new Map<string, number>();
    const deptBudgetCounts = new Map<string, number>();

    budgets.forEach((b) => {
      if (b.scope === 'project' && b.projectId) {
        projectBudgetCounts.set(b.projectId, (projectBudgetCounts.get(b.projectId) ?? 0) + 1);
      } else if (b.scope === 'departmental' && b.departmentId) {
        deptBudgetCounts.set(b.departmentId, (deptBudgetCounts.get(b.departmentId) ?? 0) + 1);
      }
    });

    const expenditureTxs = financeTransactions.filter(
      (t) => t.txType !== 'income' && !['rejected', 'cancelled', 'draft'].includes(t.status)
    );

    return budgets.map((b) => {
      const linkedProject = b.projectId ? projects.find((p) => p.id === b.projectId) : undefined;
      const budgetCategoryLower = (b.category || '').trim().toLowerCase();

      const matchedTransactions = expenditureTxs.filter((t) => {
        const txCategoryLower = (t.category || '').trim().toLowerCase();

        if (b.scope === 'project' && b.projectId) {
          if (t.projectId !== b.projectId) return false;
          if ((projectBudgetCounts.get(b.projectId) ?? 0) > 1 && budgetCategoryLower) {
            return txCategoryLower === budgetCategoryLower;
          }
          return true;
        }

        if (b.scope === 'departmental' && b.departmentId) {
          if (t.departmentId !== b.departmentId) return false;
          if ((deptBudgetCounts.get(b.departmentId) ?? 0) > 1 && budgetCategoryLower) {
            return txCategoryLower === budgetCategoryLower;
          }
          return true;
        }

        // Organisational scope
        if (b.departmentId) {
          if (t.departmentId !== b.departmentId) return false;
          if (budgetCategoryLower) return txCategoryLower === budgetCategoryLower;
          return true;
        }
        return budgetCategoryLower ? txCategoryLower === budgetCategoryLower : false;
      });

      const liveApprovedKes = matchedTransactions
        .filter((t) => ['approved', 'paid', 'retired'].includes(t.status))
        .reduce((sum, t) => sum + (Number(t.amountKes) || 0), 0);

      const livePendingKes = matchedTransactions
        .filter((t) => ['submitted', 'pending_approval', 'returned'].includes(t.status))
        .reduce((sum, t) => sum + (Number(t.amountKes) || 0), 0);

      const baselineSpentKes = Number(b.spentKes) || 0;
      const allocatedKes = Number(b.allocatedKes) || 0;
      const realTimeSpentKes = baselineSpentKes + liveApprovedKes;
      const projectedSpentKes = realTimeSpentKes + livePendingKes;
      const remainingKes = allocatedKes - realTimeSpentKes;
      const utilisationPct = allocatedKes > 0 ? Math.round((realTimeSpentKes / allocatedKes) * 100) : 0;
      const projectedPct = allocatedKes > 0 ? Math.round((projectedSpentKes / allocatedKes) * 100) : 0;

      return {
        ...b,
        projectCode: linkedProject?.code,
        projectTitle: linkedProject?.title,
        baselineSpentKes,
        liveApprovedKes,
        livePendingKes,
        realTimeSpentKes,
        projectedSpentKes,
        remainingKes,
        utilisationPct,
        projectedPct,
        matchedTransactions,
      };
    });
  }, [budgets, financeTransactions, projects]);

  const filteredBudgets = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return enrichedBudgets.filter((b) => {
      if (scopeFilter !== 'all' && b.scope !== scopeFilter) return false;
      if (deptFilter !== 'all' && b.departmentId !== deptFilter) return false;
      if (projectFilter !== 'all' && b.projectId !== projectFilter) return false;
      if (statusFilter !== 'all' && b.status !== statusFilter) return false;
      if (q) {
        const hay = [
          b.title,
          b.category,
          b.departmentName || '',
          b.projectCode || '',
          b.projectTitle || '',
          b.fiscalYear,
        ]
          .join(' ')
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [enrichedBudgets, scopeFilter, deptFilter, projectFilter, statusFilter, searchQuery]);

  const summary = useMemo(() => {
    const totalAllocated = filteredBudgets.reduce((s, b) => s + (Number(b.allocatedKes) || 0), 0);
    const totalBaseline = filteredBudgets.reduce((s, b) => s + b.baselineSpentKes, 0);
    const totalLiveApproved = filteredBudgets.reduce((s, b) => s + b.liveApprovedKes, 0);
    const totalRealTimeSpent = filteredBudgets.reduce((s, b) => s + b.realTimeSpentKes, 0);
    const totalPending = filteredBudgets.reduce((s, b) => s + b.livePendingKes, 0);
    const totalRemaining = totalAllocated - totalRealTimeSpent;
    const deptCount = filteredBudgets.filter((b) => b.scope === 'departmental').length;
    const projectCount = filteredBudgets.filter((b) => b.scope === 'project').length;
    const atRiskCount = filteredBudgets.filter((b) => b.utilisationPct >= 85 && b.status === 'active').length;
    const utilisationPct = totalAllocated > 0 ? Math.round((totalRealTimeSpent / totalAllocated) * 100) : 0;

    return {
      totalAllocated,
      totalBaseline,
      totalLiveApproved,
      totalRealTimeSpent,
      totalPending,
      totalRemaining,
      deptCount,
      projectCount,
      atRiskCount,
      utilisationPct,
    };
  }, [filteredBudgets]);

  const chartData = useMemo(() => {
    if (chartGrouping === 'department') {
      const map = new Map<string, { name: string; Allocated: number; 'Real-Time Spend': number; Pending: number }>();
      filteredBudgets.forEach((b) => {
        const key = b.departmentName || 'Organisational';
        const prev = map.get(key) ?? { name: key, Allocated: 0, 'Real-Time Spend': 0, Pending: 0 };
        prev.Allocated += Math.round((Number(b.allocatedKes) || 0) / 1000);
        prev['Real-Time Spend'] += Math.round(b.realTimeSpentKes / 1000);
        prev.Pending += Math.round(b.livePendingKes / 1000);
        map.set(key, prev);
      });
      return Array.from(map.values());
    }

    if (chartGrouping === 'project') {
      const map = new Map<string, { name: string; Allocated: number; 'Real-Time Spend': number; Pending: number }>();
      filteredBudgets
        .filter((b) => b.scope === 'project' || Boolean(b.projectId))
        .forEach((b) => {
          const key = b.projectCode || b.title.slice(0, 18);
          const prev = map.get(key) ?? { name: key, Allocated: 0, 'Real-Time Spend': 0, Pending: 0 };
          prev.Allocated += Math.round((Number(b.allocatedKes) || 0) / 1000);
          prev['Real-Time Spend'] += Math.round(b.realTimeSpentKes / 1000);
          prev.Pending += Math.round(b.livePendingKes / 1000);
          map.set(key, prev);
        });
      return Array.from(map.values());
    }

    return filteredBudgets.slice(0, 8).map((b) => ({
      name: b.projectCode ? `${b.projectCode}` : b.title.length > 20 ? `${b.title.slice(0, 18)}…` : b.title,
      Allocated: Math.round((Number(b.allocatedKes) || 0) / 1000),
      'Real-Time Spend': Math.round(b.realTimeSpentKes / 1000),
      Pending: Math.round(b.livePendingKes / 1000),
    }));
  }, [filteredBudgets, chartGrouping]);

  const inspectedBudget = useMemo(
    () => (inspectBudgetId ? enrichedBudgets.find((b) => b.id === inspectBudgetId) ?? null : null),
    [enrichedBudgets, inspectBudgetId]
  );

  const handleExportCsv = () => {
    exportToCsv({
      fileName: `iServe_Budgets_Comparison_${fiscalYear.replace(/\s+/g, '_')}`,
      columns: [
        { header: 'Budget Title', key: 'title' },
        { header: 'Fiscal Year', key: 'fiscalYear' },
        { header: 'Scope', key: 'scope' },
        { header: 'Department', key: 'departmentName' },
        { header: 'Project', key: 'projectLabel' },
        { header: 'Category', key: 'category' },
        { header: 'Allocated (KES)', key: 'allocatedKes' },
        { header: 'Baseline Spent (KES)', key: 'baselineSpentKes' },
        { header: 'Live Approved/Paid Spend (KES)', key: 'liveApprovedKes' },
        { header: 'Total Real-Time Spend (KES)', key: 'realTimeSpentKes' },
        { header: 'Pending Approvals (KES)', key: 'livePendingKes' },
        { header: 'Remaining Balance (KES)', key: 'remainingKes' },
        { header: 'Utilisation (%)', key: 'utilisationPct' },
        { header: 'Status', key: 'status' },
      ],
      rows: filteredBudgets.map((b) => ({
        title: b.title,
        fiscalYear: b.fiscalYear,
        scope: SCOPE_LABELS[b.scope],
        departmentName: b.departmentName || 'Organisational',
        projectLabel: b.projectCode ? `${b.projectCode} — ${b.projectTitle || ''}` : '—',
        category: b.category,
        allocatedKes: b.allocatedKes,
        baselineSpentKes: b.baselineSpentKes,
        liveApprovedKes: b.liveApprovedKes,
        realTimeSpentKes: b.realTimeSpentKes,
        livePendingKes: b.livePendingKes,
        remainingKes: b.remainingKes,
        utilisationPct: b.utilisationPct,
        status: b.status,
      })),
    });
  };

  return (
    <div className="space-y-5">
      {/* Filter & Actions Bar */}
      <div className="bg-white border border-stone-200 rounded-xl p-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1 p-1 bg-stone-100 rounded-lg">
            {(
              [
                { key: 'all', label: 'All Scopes' },
                { key: 'departmental', label: 'Departmental' },
                { key: 'project', label: 'Project-Specific' },
                { key: 'organisational', label: 'Organisational' },
              ] as { key: ScopeFilter; label: string }[]
            ).map((s) => (
              <button
                key={s.key}
                type="button"
                onClick={() => setScopeFilter(s.key)}
                className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                  scopeFilter === s.key ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>

          <select
            value={deptFilter}
            onChange={(e) => setDeptFilter(e.target.value)}
            aria-label="Filter budgets by department"
            className="px-2.5 py-1.5 text-xs bg-white border border-stone-300 rounded-lg text-slate-700"
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
            aria-label="Filter budgets by project"
            className="px-2.5 py-1.5 text-xs bg-white border border-stone-300 rounded-lg text-slate-700"
          >
            <option value="all">All Projects</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.code} — {p.title}
              </option>
            ))}
          </select>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as 'all' | 'active' | 'closed')}
            aria-label="Filter budgets by status"
            className="px-2.5 py-1.5 text-xs bg-white border border-stone-300 rounded-lg text-slate-700"
          >
            <option value="all">All Statuses</option>
            <option value="active">Active</option>
            <option value="closed">Closed</option>
          </select>

          <input
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search budget line or category..."
            className="px-3 py-1.5 text-xs bg-white border border-stone-300 rounded-lg text-slate-700 w-52 focus:outline-none focus:ring-2 focus:ring-emerald-900/20"
          />
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleExportCsv}
            disabled={filteredBudgets.length === 0}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-stone-300 rounded-lg hover:bg-stone-50 disabled:opacity-50"
          >
            <Download className="w-3.5 h-3.5" />
            Export CSV
          </button>
          {canManageBudgets && (
            <button
              type="button"
              onClick={onCreateBudget}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-white bg-[var(--brand-primary)] hover:bg-[var(--brand-primary-hover)] rounded-lg"
            >
              <Plus className="w-3.5 h-3.5" />
              Create Budget
            </button>
          )}
        </div>
      </div>

      {/* Real-Time Monitoring Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white border border-stone-200 rounded-xl p-4 space-y-1">
          <div className="text-xs text-slate-500">Filtered Budget Allocation</div>
          <div className="text-xl font-bold text-slate-900 font-mono tabular-nums">
            {formatKes(summary.totalAllocated)}
          </div>
          <div className="text-xs text-slate-500 tabular-nums">
            {summary.deptCount} departmental · {summary.projectCount} project-specific
          </div>
        </div>

        <div className="bg-white border border-stone-200 rounded-xl p-4 space-y-1">
          <div className="text-xs text-slate-500">Real-Time Expenditure</div>
          <div className="text-xl font-bold text-slate-900 font-mono tabular-nums">
            {formatKes(summary.totalRealTimeSpent)}
          </div>
          <div className="text-xs text-slate-500 tabular-nums">
            {formatKes(summary.totalBaseline)} baseline + {formatKes(summary.totalLiveApproved)} live ledger
          </div>
        </div>

        <div className="bg-white border border-stone-200 rounded-xl p-4 space-y-1">
          <div className="text-xs text-slate-500">Pending Commitments</div>
          <div className="text-xl font-bold text-amber-700 font-mono tabular-nums">
            {formatKes(summary.totalPending)}
          </div>
          <div className="text-xs text-slate-500 tabular-nums">
            Awaiting approval · {summary.utilisationPct}% current utilisation
          </div>
        </div>

        <div className="bg-white border border-stone-200 rounded-xl p-4 space-y-1">
          <div className="text-xs text-slate-500">Remaining Available</div>
          <div
            className={`text-xl font-bold font-mono tabular-nums ${
              summary.totalRemaining < 0 ? 'text-red-700' : 'text-emerald-800'
            }`}
          >
            {formatKes(summary.totalRemaining)}
          </div>
          <div className="text-xs text-slate-500 tabular-nums">
            {summary.atRiskCount > 0 ? (
              <span className="text-amber-700 font-medium inline-flex items-center gap-1">
                <AlertTriangle className="w-3 h-3" />
                {summary.atRiskCount} budget(s) ≥ 85% utilised
              </span>
            ) : (
              'All active budgets within healthy thresholds'
            )}
          </div>
        </div>
      </div>

      {/* Budget vs Real-Time Expenditure Chart */}
      <div className="bg-white border border-stone-200 rounded-xl p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-slate-900 font-display">
              Budget Allocation vs. Real-Time Expenditure (KES Thousands)
            </h2>
            <p className="text-xs text-slate-500">
              Compares approved allocations against recorded baseline, approved/paid transactions, and pending requests
            </p>
          </div>
          <div className="flex items-center gap-1 p-1 bg-stone-100 rounded-lg">
            {(
              [
                { key: 'budget', label: 'By Budget Line' },
                { key: 'department', label: 'By Department' },
                { key: 'project', label: 'By Project' },
              ] as { key: ChartGrouping; label: string }[]
            ).map((g) => (
              <button
                key={g.key}
                type="button"
                onClick={() => setChartGrouping(g.key)}
                className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors ${
                  chartGrouping === g.key ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {g.label}
              </button>
            ))}
          </div>
        </div>

        <div className="h-64">
          {chartData.length === 0 ? (
            <div className="h-full flex items-center justify-center text-xs text-slate-400">
              No matching budgets to chart for the current filters.
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e7e5e4" />
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#475569' }} />
                <YAxis tick={{ fontSize: 11, fill: '#475569' }} />
                <Tooltip formatter={(val) => `${Number(val ?? 0).toLocaleString('en-KE')}K KES`} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="Allocated" fill="#cbd5e1" radius={[4, 4, 0, 0]} />
                <Bar dataKey="Real-Time Spend" fill="#0d4f3c" radius={[4, 4, 0, 0]} />
                <Bar dataKey="Pending" fill="#b45309" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Budget Monitoring Table */}
      <div className="bg-white border border-stone-200 rounded-xl overflow-hidden">
        {filteredBudgets.length === 0 ? (
          <div className="p-10 text-center space-y-2">
            <p className="text-sm font-medium text-slate-900">No budgets match the selected filters</p>
            <p className="text-xs text-slate-500">
              Adjust your scope, department, or project filters, or create a new departmental or project budget.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-stone-200 bg-stone-50/70 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                  <th className="py-3 px-4">Budget Line & Assignment</th>
                  <th className="py-3 px-4 text-right">Allocated</th>
                  <th className="py-3 px-4 text-right">Real-Time Spend</th>
                  <th className="py-3 px-4 text-right">Remaining</th>
                  <th className="py-3 px-4 w-44">Utilisation</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100 text-sm">
                {filteredBudgets.map((b) => {
                  const barPct = Math.min(100, Math.max(0, b.utilisationPct));
                  const barColor =
                    b.utilisationPct >= 95
                      ? 'bg-red-600'
                      : b.utilisationPct >= 80
                        ? 'bg-amber-600'
                        : 'bg-emerald-700';

                  return (
                    <tr key={b.id} className="hover:bg-stone-50/70 transition-colors">
                      <td className="py-3.5 px-4">
                        <div className="font-medium text-slate-900">{b.title}</div>
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-slate-500 mt-0.5">
                          <span className="inline-flex items-center gap-1 font-medium text-slate-700">
                            {b.scope === 'project' ? (
                              <FolderKanban className="w-3 h-3 text-amber-700" />
                            ) : (
                              <Building2 className="w-3 h-3 text-emerald-800" />
                            )}
                            {SCOPE_LABELS[b.scope]}
                          </span>
                          <span>·</span>
                          <span>{b.departmentName || 'Organisational'}</span>
                          {b.projectCode && (
                            <>
                              <span>·</span>
                              <span className="font-mono text-slate-700">{b.projectCode}</span>
                            </>
                          )}
                          <span>·</span>
                          <span>{b.category}</span>
                          <span>·</span>
                          <span className="font-mono">{b.fiscalYear}</span>
                        </div>
                      </td>

                      <td className="py-3.5 px-4 text-right font-mono text-slate-900 whitespace-nowrap">
                        {formatKes(b.allocatedKes)}
                      </td>

                      <td className="py-3.5 px-4 text-right whitespace-nowrap">
                        <div className="font-mono font-semibold text-slate-900">
                          {formatKes(b.realTimeSpentKes)}
                        </div>
                        <div className="text-[11px] text-slate-500 font-mono tabular-nums">
                          {b.liveApprovedKes > 0
                            ? `+${formatKes(b.liveApprovedKes)} ledger`
                            : 'No live tx posted'}
                          {b.livePendingKes > 0 ? ` · ${formatKes(b.livePendingKes)} pending` : ''}
                        </div>
                      </td>

                      <td
                        className={`py-3.5 px-4 text-right font-mono font-medium whitespace-nowrap ${
                          b.remainingKes < 0 ? 'text-red-700' : 'text-emerald-800'
                        }`}
                      >
                        {formatKes(b.remainingKes)}
                      </td>

                      <td className="py-3.5 px-4">
                        <div className="flex items-center justify-between text-xs font-mono mb-1">
                          <span
                            className={`font-semibold ${
                              b.utilisationPct >= 95
                                ? 'text-red-700'
                                : b.utilisationPct >= 80
                                  ? 'text-amber-700'
                                  : 'text-emerald-800'
                            }`}
                          >
                            {b.utilisationPct}%
                          </span>
                          {b.livePendingKes > 0 && (
                            <span className="text-[11px] text-amber-700">({b.projectedPct}% proj.)</span>
                          )}
                        </div>
                        <div className="w-full h-2 bg-stone-200 rounded-full overflow-hidden">
                          <div className={`h-full ${barColor} transition-all`} style={{ width: `${barPct}%` }} />
                        </div>
                      </td>

                      <td className="py-3.5 px-4">
                        <StatusText status={b.status} />
                      </td>

                      <td className="py-3.5 px-4 text-right whitespace-nowrap">
                        <div className="inline-flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => setInspectBudgetId(b.id)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-slate-700 border border-stone-300 rounded-md hover:bg-stone-50"
                          >
                            <Eye className="w-3 h-3" />
                            Ledger ({b.matchedTransactions.length})
                          </button>
                          {canManageBudgets && (
                            <button
                              type="button"
                              onClick={() => onEditBudget(b)}
                              className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-emerald-800 border border-emerald-200 rounded-md hover:bg-emerald-50"
                            >
                              <Pencil className="w-3 h-3" />
                              Edit
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Matched Transactions Drill-Down Modal */}
      <Modal
        open={Boolean(inspectedBudget)}
        onClose={() => setInspectBudgetId(null)}
        title={inspectedBudget ? `Budget Ledger: ${inspectedBudget.title}` : 'Budget Ledger'}
        subtitle={
          inspectedBudget
            ? `${SCOPE_LABELS[inspectedBudget.scope]} · ${inspectedBudget.departmentName || 'Organisational'}${
                inspectedBudget.projectCode ? ` · ${inspectedBudget.projectCode}` : ''
              } · ${inspectedBudget.category}`
            : undefined
        }
        maxWidthClass="max-w-3xl"
      >
        {inspectedBudget && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-stone-50 border border-stone-200 rounded-lg p-3.5 text-xs">
              <div>
                <div className="text-slate-500">Allocated</div>
                <div className="font-mono font-semibold text-slate-900 mt-0.5">
                  {formatKes(inspectedBudget.allocatedKes)}
                </div>
              </div>
              <div>
                <div className="text-slate-500">Baseline + Approved</div>
                <div className="font-mono font-semibold text-slate-900 mt-0.5">
                  {formatKes(inspectedBudget.realTimeSpentKes)}
                </div>
              </div>
              <div>
                <div className="text-slate-500">Pending Approvals</div>
                <div className="font-mono font-semibold text-amber-700 mt-0.5">
                  {formatKes(inspectedBudget.livePendingKes)}
                </div>
              </div>
              <div>
                <div className="text-slate-500">Remaining Balance</div>
                <div
                  className={`font-mono font-semibold mt-0.5 ${
                    inspectedBudget.remainingKes < 0 ? 'text-red-700' : 'text-emerald-800'
                  }`}
                >
                  {formatKes(inspectedBudget.remainingKes)}
                </div>
              </div>
            </div>

            {inspectedBudget.matchedTransactions.length === 0 ? (
              <div className="py-8 text-center text-xs text-slate-500 border border-dashed border-stone-200 rounded-lg">
                No live finance transactions currently linked to this {SCOPE_LABELS[inspectedBudget.scope].toLowerCase()}{' '}
                budget.
              </div>
            ) : (
              <div className="divide-y divide-stone-100 border border-stone-200 rounded-lg max-h-80 overflow-y-auto">
                {inspectedBudget.matchedTransactions.map((tx) => (
                  <div key={tx.id} className="p-3 flex flex-wrap items-center justify-between gap-3 text-xs">
                    <div className="space-y-0.5 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-semibold text-slate-900">{tx.txNumber}</span>
                        <span className="text-slate-400">·</span>
                        <span className="font-medium text-slate-900 truncate">{tx.title}</span>
                      </div>
                      <div className="text-slate-500">
                        {tx.category} · Payee: {tx.payee || tx.requestedByName || '—'} ·{' '}
                        {formatNairobiDate(tx.createdAt)}
                      </div>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <StatusText status={tx.status} />
                      <span className="font-mono font-semibold text-slate-900">{formatKes(tx.amountKes)}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="flex justify-end pt-2 border-t border-stone-100">
              <button
                type="button"
                onClick={() => setInspectBudgetId(null)}
                className="px-4 py-2 text-xs font-medium text-slate-700 border border-stone-300 rounded-lg hover:bg-stone-50"
              >
                Close
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
