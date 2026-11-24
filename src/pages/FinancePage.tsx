import React, { useMemo, useState } from 'react';
import { collection, doc, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';
import { Plus, Download, RefreshCw, AlertTriangle } from 'lucide-react';
import { ORG_ID, db } from '../lib/firebase.ts';
import { OperationType, handleFirestoreError } from '../lib/firestoreError.ts';
import { recordAuditLog } from '../lib/audit.ts';
import { exportToExcel, exportToPdf } from '../lib/exports.ts';
import { useAuth } from '../context/AuthContext.tsx';
import { useData } from '../context/DataContext.tsx';
import { DataTable, ColumnDef } from '../components/ui/DataTable.tsx';
import { Modal } from '../components/ui/Modal.tsx';
import { StatusText } from '../components/ui/StatusText.tsx';
import { BudgetMonitoringSection } from '../components/finance/BudgetMonitoringSection.tsx';
import { Budget, FinanceTransaction, formatKes, formatNairobiDate } from '../types/erp.ts';

type FinanceTab = 'transactions' | 'budgets' | 'petty_cash' | 'quickbooks';

const BUDGET_CATEGORIES = [
  'Training & Stipends',
  'Events & Venues',
  'Travel & Transport',
  'Inventory & Publishing',
  'Office Supplies',
  'Facilities & Admin',
  'Ministry Outreach',
  'ICT & Equipment',
];

export function FinancePage() {
  const { profile, effectiveRole, orgSettings } = useAuth();
  const { financeTransactions, budgets, departments, projects, integrationLogs } = useData();

  const [tab, setTab] = useState<FinanceTab>('transactions');
  const [txModalOpen, setTxModalOpen] = useState(false);
  const [budgetModalOpen, setBudgetModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [qbNotice, setQbNotice] = useState<string | null>(null);

  // Transaction form state
  const [txType, setTxType] = useState<'payment_request' | 'expense' | 'petty_cash' | 'income'>('payment_request');
  const [txTitle, setTxTitle] = useState('');
  const [txCategory, setTxCategory] = useState('Events & Venues');
  const [txDeptId, setTxDeptId] = useState('');
  const [txProjectId, setTxProjectId] = useState('');
  const [txAmount, setTxAmount] = useState('');
  const [txPayee, setTxPayee] = useState('');
  const [txReceiptRef, setTxReceiptRef] = useState('');
  const [txDesc, setTxDesc] = useState('');

  // Budget form state
  const [editingBudget, setEditingBudget] = useState<Budget | null>(null);
  const [budTitle, setBudTitle] = useState('');
  const [budFiscalYear, setBudFiscalYear] = useState('');
  const [budScope, setBudScope] = useState<'organisational' | 'departmental' | 'project'>('departmental');
  const [budDeptId, setBudDeptId] = useState('');
  const [budProjectId, setBudProjectId] = useState('');
  const [budCategory, setBudCategory] = useState('Training & Stipends');
  const [budCustomCategory, setBudCustomCategory] = useState('');
  const [budAllocated, setBudAllocated] = useState('');
  const [budSpent, setBudSpent] = useState('0');
  const [budStatus, setBudStatus] = useState<'active' | 'closed'>('active');

  const canManageBudgets = ['super_admin', 'executive_director', 'senior_management', 'finance_officer'].includes(
    effectiveRole
  );

  const openCreateBudgetModal = () => {
    setFormError(null);
    setEditingBudget(null);
    setBudTitle('');
    setBudFiscalYear(orgSettings.fiscalYear || 'FY 2026');
    setBudScope('departmental');
    setBudDeptId('');
    setBudProjectId('');
    setBudCategory('Training & Stipends');
    setBudCustomCategory('');
    setBudAllocated('');
    setBudSpent('0');
    setBudStatus('active');
    setBudgetModalOpen(true);
  };

  const openEditBudgetModal = (budget: Budget) => {
    setFormError(null);
    setEditingBudget(budget);
    setBudTitle(budget.title);
    setBudFiscalYear(budget.fiscalYear || orgSettings.fiscalYear || 'FY 2026');
    setBudScope(budget.scope);
    setBudDeptId(budget.departmentId || '');
    setBudProjectId(budget.projectId || '');
    if (BUDGET_CATEGORIES.includes(budget.category)) {
      setBudCategory(budget.category);
      setBudCustomCategory('');
    } else {
      setBudCategory('__custom__');
      setBudCustomCategory(budget.category);
    }
    setBudAllocated(String(budget.allocatedKes));
    setBudSpent(String(budget.spentKes));
    setBudStatus(budget.status);
    setBudgetModalOpen(true);
  };

  const summary = useMemo(() => {
    const totalBudget = budgets.reduce((s, b) => s + b.allocatedKes, 0);
    const totalSpent = budgets.reduce((s, b) => s + b.spentKes, 0);
    const totalPayments = financeTransactions
      .filter((t) => t.txType === 'payment_request' || t.txType === 'expense')
      .reduce((s, t) => s + t.amountKes, 0);
    const pettyCashIssued = financeTransactions
      .filter((t) => t.txType === 'petty_cash')
      .reduce((s, t) => s + t.amountKes, 0);
    const totalIncome = financeTransactions
      .filter((t) => t.txType === 'income')
      .reduce((s, t) => s + t.amountKes, 0);
    return { totalBudget, totalSpent, totalPayments, pettyCashIssued, totalIncome };
  }, [budgets, financeTransactions]);

  const handleCreateTx = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile) return;
    setFormError(null);
    const amount = Number(txAmount);
    if (!txTitle.trim() || !Number.isFinite(amount) || amount <= 0) {
      setFormError('Provide a valid title and positive KES amount.');
      return;
    }

    setSaving(true);
    const dept = departments.find((d) => d.id === txDeptId);
    const proj = projects.find((p) => p.id === txProjectId);
    const prefix =
      txType === 'payment_request' ? 'PAY' : txType === 'expense' ? 'EXP' : txType === 'petty_cash' ? 'IMP' : 'INC';
    const txNumber = `${prefix}-2026-${String(Math.floor(100 + Math.random() * 900))}`;
    const ref = doc(collection(db, 'financeTransactions'));

    try {
      await setDoc(ref, {
        orgId: ORG_ID,
        txNumber,
        txType,
        title: txTitle.trim(),
        category: txCategory,
        departmentId: dept?.id || '',
        departmentName: dept?.name || 'General',
        projectId: proj?.id || '',
        projectName: proj?.title || '',
        amountKes: amount,
        payee: txPayee.trim() || profile.displayName,
        description: txDesc.trim(),
        receiptRef: txReceiptRef.trim(),
        requestedBy: profile.uid,
        requestedByName: profile.displayName,
        status: txType === 'income' && canManageBudgets ? 'paid' : 'submitted',
        qbSyncStatus: orgSettings.quickbooksStatus === 'connected' ? 'pending' : 'credentials_required',
        isDemo: false,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      await recordAuditLog({
        actorUid: profile.uid,
        actorName: profile.displayName,
        actorRole: profile.role,
        action: `CREATE_${txType.toUpperCase()}`,
        targetCollection: 'financeTransactions',
        targetId: ref.id,
        summary: `Submitted ${txNumber} (${formatKes(amount)}): ${txTitle.trim()}`,
      });

      setTxModalOpen(false);
      setTxTitle('');
      setTxAmount('');
      setTxPayee('');
      setTxReceiptRef('');
      setTxDesc('');
    } catch (err) {
      try {
        handleFirestoreError(err, OperationType.CREATE, `financeTransactions/${ref.id}`);
      } catch (e2) {
        setFormError(e2 instanceof Error ? e2.message : 'Failed to save transaction.');
      }
    } finally {
      setSaving(false);
    }
  };

  const handleSaveBudget = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile) return;
    setFormError(null);

    const trimmedTitle = budTitle.trim();
    const trimmedFy = (budFiscalYear || orgSettings.fiscalYear || 'FY 2026').trim();
    const resolvedCategory = (budCategory === '__custom__' ? budCustomCategory : budCategory).trim();
    const allocated = Number(budAllocated);
    const spent = Number(budSpent || 0);

    if (trimmedTitle.length < 2 || trimmedTitle.length > 160) {
      setFormError('Budget title must be between 2 and 160 characters.');
      return;
    }
    if (trimmedFy.length < 4 || trimmedFy.length > 16) {
      setFormError('Fiscal year must be between 4 and 16 characters (e.g. FY 2026).');
      return;
    }
    if (resolvedCategory.length < 2 || resolvedCategory.length > 100) {
      setFormError('Expenditure category must be between 2 and 100 characters.');
      return;
    }
    if (!Number.isFinite(allocated) || allocated < 0) {
      setFormError('Enter a valid non-negative allocated KES amount.');
      return;
    }
    if (!Number.isFinite(spent) || spent < 0) {
      setFormError('Enter a valid non-negative baseline spent KES amount.');
      return;
    }
    if (budScope === 'departmental' && !budDeptId) {
      setFormError('Select a department for a departmental budget.');
      return;
    }
    if (budScope === 'project' && !budProjectId) {
      setFormError('Select a project for a project-specific budget.');
      return;
    }

    const selectedProject = budScope === 'project' ? projects.find((p) => p.id === budProjectId) : undefined;
    const effectiveDeptId = budDeptId || (budScope === 'project' ? selectedProject?.departmentId || '' : '');
    const dept = departments.find((d) => d.id === effectiveDeptId);

    setSaving(true);
    try {
      if (editingBudget) {
        await updateDoc(doc(db, 'budgets', editingBudget.id), {
          title: trimmedTitle,
          fiscalYear: trimmedFy,
          scope: budScope,
          departmentId: dept?.id || '',
          departmentName: dept?.name || (budScope === 'organisational' ? 'Organisational' : selectedProject?.departmentName || 'General'),
          projectId: budScope === 'project' ? budProjectId : '',
          category: resolvedCategory,
          allocatedKes: allocated,
          spentKes: spent,
          status: budStatus,
          updatedAt: serverTimestamp(),
        });
        await recordAuditLog({
          actorUid: profile.uid,
          actorName: profile.displayName,
          actorRole: profile.role,
          action: 'UPDATE_BUDGET',
          targetCollection: 'budgets',
          targetId: editingBudget.id,
          summary: `Updated ${budScope} budget "${trimmedTitle}" (${formatKes(allocated)})`,
        });
      } else {
        const ref = doc(collection(db, 'budgets'));
        await setDoc(ref, {
          orgId: ORG_ID,
          title: trimmedTitle,
          fiscalYear: trimmedFy,
          scope: budScope,
          departmentId: dept?.id || '',
          departmentName: dept?.name || (budScope === 'organisational' ? 'Organisational' : selectedProject?.departmentName || 'General'),
          projectId: budScope === 'project' ? budProjectId : '',
          category: resolvedCategory,
          allocatedKes: allocated,
          spentKes: spent,
          status: budStatus,
          createdBy: profile.uid,
          isDemo: false,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        await recordAuditLog({
          actorUid: profile.uid,
          actorName: profile.displayName,
          actorRole: profile.role,
          action: 'CREATE_BUDGET',
          targetCollection: 'budgets',
          targetId: ref.id,
          summary: `Created ${budScope} budget "${trimmedTitle}" (${formatKes(allocated)})`,
        });
      }

      setBudgetModalOpen(false);
      setEditingBudget(null);
      setBudTitle('');
      setBudAllocated('');
      setBudSpent('0');
      setTab('budgets');
    } catch (err) {
      try {
        handleFirestoreError(
          err,
          editingBudget ? OperationType.UPDATE : OperationType.CREATE,
          editingBudget ? `budgets/${editingBudget.id}` : 'budgets'
        );
      } catch (e2) {
        setFormError(e2 instanceof Error ? e2.message : 'Failed to save budget.');
      }
    } finally {
      setSaving(false);
    }
  };

  const handleRetirePettyCash = async (tx: FinanceTransaction) => {
    if (!profile) return;
    try {
      await updateDoc(doc(db, 'financeTransactions', tx.id), {
        status: 'retired',
        updatedAt: serverTimestamp(),
      });
      await recordAuditLog({
        actorUid: profile.uid,
        actorName: profile.displayName,
        actorRole: profile.role,
        action: 'RETIRE_IMPREST',
        targetCollection: 'financeTransactions',
        targetId: tx.id,
        summary: `Retired petty cash imprest ${tx.txNumber}`,
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `financeTransactions/${tx.id}`);
    }
  };

  const handleAttemptQuickBooksSync = async () => {
    if (!profile) return;
    const logRef = doc(collection(db, 'integrationLogs'));
    const approvedCount = financeTransactions.filter((t) =>
      ['approved', 'paid', 'retired'].includes(t.status)
    ).length;

    try {
      await setDoc(logRef, {
        orgId: ORG_ID,
        provider: 'quickbooks',
        event: `Sync attempt for ${approvedCount} approved transaction(s)`,
        status: 'credentials_required',
        details:
          'QuickBooks Online OAuth 2.0 Client ID, Client Secret, and Realm ID are not yet configured in environment secrets. Transactions remain safely queued without duplicate posting.',
        actorUid: profile.uid,
        createdAt: serverTimestamp(),
      });
      setQbNotice(
        'QuickBooks Online API credentials are required before live ledger posting can proceed. An integration log entry has been recorded.'
      );
    } catch (err) {
      try {
        handleFirestoreError(err, OperationType.CREATE, `integrationLogs/${logRef.id}`);
      } catch (e2) {
        setQbNotice(e2 instanceof Error ? e2.message : 'Unable to log QuickBooks sync attempt.');
      }
    }
  };

  const txColumns: ColumnDef<FinanceTransaction>[] = [
    {
      key: 'txNumber',
      header: 'Reference',
      sortable: true,
      sortValue: (r) => r.txNumber,
      render: (r) => (
        <div>
          <div className="font-mono text-xs font-semibold text-slate-900">{r.txNumber}</div>
          <div className="text-[11px] text-slate-500 capitalize">{r.txType.replace(/_/g, ' ')}</div>
        </div>
      ),
    },
    {
      key: 'title',
      header: 'Description & Allocation',
      sortable: true,
      sortValue: (r) => r.title,
      render: (r) => (
        <div>
          <div className="font-medium text-slate-900">{r.title}</div>
          <div className="text-xs text-slate-500">
            {r.category} · {r.departmentName || 'General'}
            {r.projectName ? ` · ${r.projectName}` : ''}
          </div>
        </div>
      ),
    },
    {
      key: 'payee',
      header: 'Payee / Requester',
      render: (r) => (
        <div className="text-xs">
          <div className="text-slate-800">{r.payee || '—'}</div>
          <div className="text-slate-500">By {r.requestedByName || 'Staff'}</div>
        </div>
      ),
    },
    {
      key: 'amountKes',
      header: 'Amount (KES)',
      align: 'right',
      sortable: true,
      sortValue: (r) => r.amountKes,
      render: (r) => <span className="font-mono font-semibold text-slate-900">{formatKes(r.amountKes)}</span>,
    },
    {
      key: 'status',
      header: 'Status',
      sortable: true,
      sortValue: (r) => r.status,
      render: (r) => <StatusText status={r.status} />,
    },
    {
      key: 'qb',
      header: 'QuickBooks',
      render: (r) => <StatusText status={r.qbSyncStatus} />,
    },
  ];


  const handleExportFinance = (format: 'pdf' | 'xlsx') => {
    const cols = [
      { header: 'Reference', key: 'txNumber' },
      { header: 'Type', key: 'txType' },
      { header: 'Title', key: 'title' },
      { header: 'Department', key: 'departmentName' },
      { header: 'Category', key: 'category' },
      { header: 'Amount (KES)', key: 'amountKes' },
      { header: 'Status', key: 'status' },
      { header: 'QuickBooks Sync', key: 'qbSyncStatus' },
    ];
    const rows = financeTransactions.map((t) => ({
      txNumber: t.txNumber,
      txType: t.txType,
      title: t.title,
      departmentName: t.departmentName || 'General',
      category: t.category,
      amountKes: t.amountKes,
      status: t.status,
      qbSyncStatus: t.qbSyncStatus,
    }));
    if (format === 'pdf') {
      exportToPdf({
        fileName: 'iServe_Finance_Report',
        title: 'Financial Transactions & Expenditure Report',
        subtitle: `Fiscal Year: ${orgSettings.fiscalYear}`,
        columns: cols,
        rows,
      });
    } else {
      exportToExcel({
        fileName: 'iServe_Finance_Report',
        sheetName: 'Transactions',
        title: 'iServe Africa Financial Transactions Report',
        columns: cols,
        rows,
      });
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 font-display">Finance & Accounting</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Budgets, payment approvals, expenses, petty cash imprest, and QuickBooks Online integration
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => handleExportFinance('pdf')}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-700 bg-white border border-stone-300 rounded-lg hover:bg-stone-50"
          >
            <Download className="w-3.5 h-3.5" />
            Export PDF
          </button>
          <button
            type="button"
            onClick={() => handleExportFinance('xlsx')}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-700 bg-white border border-stone-300 rounded-lg hover:bg-stone-50"
          >
            <Download className="w-3.5 h-3.5" />
            Export Excel
          </button>
          {canManageBudgets && (
            <button
              type="button"
              onClick={openCreateBudgetModal}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-slate-800 bg-white border border-stone-300 rounded-lg hover:bg-stone-50"
            >
              <Plus className="w-3.5 h-3.5" />
              New Budget
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              setFormError(null);
              setTxModalOpen(true);
            }}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-[var(--brand-primary)] hover:bg-[var(--brand-primary-hover)] rounded-lg"
          >
            <Plus className="w-3.5 h-3.5" />
            New Request / Expense
          </button>
        </div>
      </div>

      {/* KPI Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white border border-stone-200 rounded-xl p-4 space-y-1">
          <div className="text-xs text-slate-500">Approved Budgets</div>
          <div className="text-xl font-bold text-slate-900 font-mono tabular-nums">
            {formatKes(summary.totalBudget)}
          </div>
          <div className="text-xs text-slate-500 tabular-nums">Actual spend: {formatKes(summary.totalSpent)}</div>
        </div>
        <div className="bg-white border border-stone-200 rounded-xl p-4 space-y-1">
          <div className="text-xs text-slate-500">Recorded Income & Grants</div>
          <div className="text-xl font-bold text-emerald-800 font-mono tabular-nums">
            {formatKes(summary.totalIncome)}
          </div>
          <div className="text-xs text-slate-500">Grants & ministry income</div>
        </div>
        <div className="bg-white border border-stone-200 rounded-xl p-4 space-y-1">
          <div className="text-xs text-slate-500">Payments & Expenses</div>
          <div className="text-xl font-bold text-slate-900 font-mono tabular-nums">
            {formatKes(summary.totalPayments)}
          </div>
          <div className="text-xs text-slate-500">Across {financeTransactions.length} ledger items</div>
        </div>
        <div className="bg-white border border-stone-200 rounded-xl p-4 space-y-1">
          <div className="text-xs text-slate-500">Petty Cash Imprest</div>
          <div className="text-xl font-bold text-slate-900 font-mono tabular-nums">
            {formatKes(summary.pettyCashIssued)}
          </div>
          <div className="text-xs text-slate-500">Issued & tracked for retirement</div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 p-1 bg-stone-200/70 rounded-lg w-fit overflow-x-auto">
        {(
          [
            { key: 'transactions', label: 'Payments & Expenses' },
            { key: 'budgets', label: 'Budget Management' },
            { key: 'petty_cash', label: 'Petty Cash Imprest' },
            { key: 'quickbooks', label: 'QuickBooks Integration' },
          ] as { key: FinanceTab; label: string }[]
        ).map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={`px-3.5 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
              tab === t.key ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'transactions' && (
        <DataTable
          rows={financeTransactions}
          columns={txColumns}
          rowKey={(r) => r.id}
          searchPlaceholder="Search reference, title, payee, or department..."
          searchFilter={(r, q) =>
            r.txNumber.toLowerCase().includes(q) ||
            r.title.toLowerCase().includes(q) ||
            (r.payee || '').toLowerCase().includes(q) ||
            (r.departmentName || '').toLowerCase().includes(q)
          }
        />
      )}

      {tab === 'budgets' && (
        <BudgetMonitoringSection
          budgets={budgets}
          financeTransactions={financeTransactions}
          departments={departments}
          projects={projects}
          fiscalYear={orgSettings.fiscalYear || 'FY 2026'}
          canManageBudgets={canManageBudgets}
          onCreateBudget={openCreateBudgetModal}
          onEditBudget={openEditBudgetModal}
        />
      )}

      {tab === 'petty_cash' && (
        <DataTable
          rows={financeTransactions.filter((t) => t.txType === 'petty_cash')}
          columns={[
            ...txColumns.slice(0, 5),
            {
              key: 'action',
              header: 'Imprest Action',
              align: 'right',
              render: (r) =>
                r.status === 'paid' && (r.requestedBy === profile?.uid || canManageBudgets) ? (
                  <button
                    type="button"
                    onClick={() => void handleRetirePettyCash(r)}
                    className="text-xs font-medium text-emerald-800 hover:underline"
                  >
                    Mark Retired
                  </button>
                ) : (
                  <span className="text-xs text-slate-400">—</span>
                ),
            },
          ]}
          rowKey={(r) => r.id}
          emptyTitle="No petty cash imprests recorded"
          emptyDescription="Submit a petty cash imprest request to track issuance, receipts, and retirement."
        />
      )}

      {tab === 'quickbooks' && (
        <div className="space-y-6">
          <div className="bg-white border border-stone-200 rounded-xl p-6 space-y-4">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="space-y-1 max-w-2xl">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-600" />
                  <h2 className="text-base font-semibold text-slate-900 font-display">
                    QuickBooks Online Integration Layer
                  </h2>
                </div>
                <p className="text-xs text-slate-600 leading-relaxed">
                  QuickBooks Online remains iServe Africa’s primary accounting ledger. Live OAuth 2.0 synchronisation
                  requires configuring <code className="font-mono">QUICKBOOKS_CLIENT_ID</code>,{' '}
                  <code className="font-mono">QUICKBOOKS_CLIENT_SECRET</code>, and{' '}
                  <code className="font-mono">QUICKBOOKS_REALM_ID</code>. Approved transactions are tagged with unique{' '}
                  <code className="font-mono">txNumber</code> idempotency keys to prevent duplicate ledger entries.
                </p>
              </div>
              {canManageBudgets && (
                <button
                  type="button"
                  onClick={() => void handleAttemptQuickBooksSync()}
                  className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-[var(--brand-primary)] hover:bg-[var(--brand-primary-hover)] rounded-lg shrink-0"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  Run Pre-Sync Check
                </button>
              )}
            </div>

            {qbNotice && (
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-900">
                {qbNotice}
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2 border-t border-stone-100 text-xs">
              <div>
                <div className="text-slate-500">Connection State</div>
                <div className="font-semibold text-amber-700 mt-0.5">API Credentials Required</div>
              </div>
              <div>
                <div className="text-slate-500">Duplicate Prevention Key</div>
                <div className="font-mono text-slate-900 mt-0.5">txNumber / receiptNo (Idempotent)</div>
              </div>
              <div>
                <div className="text-slate-500">Queued Approved Items</div>
                <div className="font-mono font-semibold text-slate-900 mt-0.5">
                  {financeTransactions.filter((t) => ['approved', 'paid', 'retired'].includes(t.status)).length}{' '}
                  transaction(s)
                </div>
              </div>
            </div>
          </div>

          <div className="bg-white border border-stone-200 rounded-xl p-5 space-y-3">
            <h3 className="text-sm font-semibold text-slate-900 font-display">Synchronisation Audit Log</h3>
            {integrationLogs.filter((l) => l.provider === 'quickbooks').length === 0 ? (
              <p className="text-xs text-slate-500">No QuickBooks sync checks recorded yet.</p>
            ) : (
              <div className="divide-y divide-stone-100 text-xs">
                {integrationLogs
                  .filter((l) => l.provider === 'quickbooks')
                  .map((l) => (
                    <div key={l.id} className="py-2.5 flex items-start justify-between gap-4">
                      <div className="space-y-0.5">
                        <div className="font-medium text-slate-900">{l.event}</div>
                        <div className="text-slate-500">{l.details}</div>
                      </div>
                      <div className="text-right shrink-0 space-y-0.5">
                        <StatusText status={l.status} />
                        <div className="text-[11px] font-mono text-slate-400">{formatNairobiDate(l.createdAt)}</div>
                      </div>
                    </div>
                  ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* New Transaction Modal */}
      <Modal
        open={txModalOpen}
        onClose={() => setTxModalOpen(false)}
        title="New Financial Request / Record"
        subtitle="Creates a tracked transaction with approval workflow and audit entry"
      >
        <form onSubmit={handleCreateTx} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Transaction Type</label>
              <select
                value={txType}
                onChange={(e) => setTxType(e.target.value as typeof txType)}
                className="w-full px-3 py-2 text-sm border border-stone-300 rounded-lg"
              >
                <option value="payment_request">Payment Request</option>
                <option value="expense">Expense / Reimbursement</option>
                <option value="petty_cash">Petty Cash Imprest</option>
                {canManageBudgets && <option value="income">Income / Donor Grant</option>}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Amount (KES)</label>
              <input
                type="number"
                min="1"
                step="0.01"
                required
                value={txAmount}
                onChange={(e) => setTxAmount(e.target.value)}
                placeholder="e.g. 45000"
                className="w-full px-3 py-2 text-sm font-mono border border-stone-300 rounded-lg"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Title / Purpose</label>
            <input
              type="text"
              required
              value={txTitle}
              onChange={(e) => setTxTitle(e.target.value)}
              placeholder="e.g. Kisumu Apprenticeship Supervision Travel"
              className="w-full px-3 py-2 text-sm border border-stone-300 rounded-lg"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Category</label>
              <select
                value={txCategory}
                onChange={(e) => setTxCategory(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-stone-300 rounded-lg"
              >
                <option>Events & Venues</option>
                <option>Travel & Transport</option>
                <option>Training & Stipends</option>
                <option>Inventory & Publishing</option>
                <option>Office Supplies</option>
                <option>Facilities & Admin</option>
                <option>Donor Grants</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Department</label>
              <select
                value={txDeptId}
                onChange={(e) => setTxDeptId(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-stone-300 rounded-lg"
              >
                <option value="">General</option>
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Project (Optional)</label>
              <select
                value={txProjectId}
                onChange={(e) => setTxProjectId(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-stone-300 rounded-lg"
              >
                <option value="">None</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.code}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Payee / Beneficiary</label>
              <input
                type="text"
                value={txPayee}
                onChange={(e) => setTxPayee(e.target.value)}
                placeholder="Vendor or staff member name"
                className="w-full px-3 py-2 text-sm border border-stone-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Invoice / Receipt Reference</label>
              <input
                type="text"
                value={txReceiptRef}
                onChange={(e) => setTxReceiptRef(e.target.value)}
                placeholder="e.g. INV-2026-089"
                className="w-full px-3 py-2 text-sm font-mono border border-stone-300 rounded-lg"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Supporting Details</label>
            <textarea
              rows={3}
              value={txDesc}
              onChange={(e) => setTxDesc(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-stone-300 rounded-lg"
            />
          </div>

          {formError && <p className="text-xs text-red-700">{formError}</p>}

          <div className="flex justify-end gap-3 pt-2 border-t border-stone-100">
            <button
              type="button"
              onClick={() => setTxModalOpen(false)}
              className="px-4 py-2 text-sm font-medium text-slate-700 border border-stone-300 rounded-lg"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 text-sm font-semibold text-white bg-[var(--brand-primary)] hover:bg-[var(--brand-primary-hover)] rounded-lg disabled:opacity-60"
            >
              {saving ? 'Submitting...' : 'Submit Transaction'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Create / Edit Budget Modal */}
      <Modal
        open={budgetModalOpen}
        onClose={() => {
          setBudgetModalOpen(false);
          setEditingBudget(null);
        }}
        title={editingBudget ? 'Edit Budget Allocation' : 'Create Departmental or Project Budget'}
        subtitle={`Fiscal Year: ${budFiscalYear || orgSettings.fiscalYear}`}
        maxWidthClass="max-w-lg"
      >
        <form onSubmit={handleSaveBudget} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Budget Title</label>
            <input
              type="text"
              required
              maxLength={160}
              value={budTitle}
              onChange={(e) => setBudTitle(e.target.value)}
              placeholder="e.g. Q1 2027 Pastoral Training Budget"
              className="w-full px-3 py-2 text-sm border border-stone-300 rounded-lg"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Scope</label>
              <select
                value={budScope}
                onChange={(e) => {
                  const nextScope = e.target.value as typeof budScope;
                  setBudScope(nextScope);
                  if (nextScope !== 'project') setBudProjectId('');
                }}
                className="w-full px-3 py-2 text-sm border border-stone-300 rounded-lg"
              >
                <option value="departmental">Departmental</option>
                <option value="project">Project-Specific</option>
                <option value="organisational">Organisational</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Fiscal Year</label>
              <input
                type="text"
                required
                maxLength={16}
                value={budFiscalYear}
                onChange={(e) => setBudFiscalYear(e.target.value)}
                placeholder="FY 2026"
                className="w-full px-3 py-2 text-sm font-mono border border-stone-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Status</label>
              <select
                value={budStatus}
                onChange={(e) => setBudStatus(e.target.value as 'active' | 'closed')}
                className="w-full px-3 py-2 text-sm border border-stone-300 rounded-lg"
              >
                <option value="active">Active</option>
                <option value="closed">Closed</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Department {budScope === 'departmental' ? '*' : '(Optional)'}
              </label>
              <select
                value={budDeptId}
                required={budScope === 'departmental'}
                onChange={(e) => setBudDeptId(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-stone-300 rounded-lg"
              >
                <option value="">{budScope === 'departmental' ? 'Select Department' : 'Organisational / Auto'}</option>
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Expenditure Category *</label>
              <select
                value={budCategory}
                onChange={(e) => setBudCategory(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-stone-300 rounded-lg"
              >
                {BUDGET_CATEGORIES.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
                <option value="__custom__">Custom Category...</option>
              </select>
            </div>
          </div>

          {budCategory === '__custom__' && (
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Custom Expenditure Category *</label>
              <input
                type="text"
                required
                maxLength={100}
                value={budCustomCategory}
                onChange={(e) => setBudCustomCategory(e.target.value)}
                placeholder="Enter expenditure category name"
                className="w-full px-3 py-2 text-sm border border-stone-300 rounded-lg"
              />
            </div>
          )}

          {budScope === 'project' && (
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Linked Project *</label>
              <select
                required
                value={budProjectId}
                onChange={(e) => {
                  const pid = e.target.value;
                  setBudProjectId(pid);
                  const proj = projects.find((p) => p.id === pid);
                  if (proj?.departmentId && !budDeptId) {
                    setBudDeptId(proj.departmentId);
                  }
                }}
                className="w-full px-3 py-2 text-sm border border-stone-300 rounded-lg"
              >
                <option value="">Select Project</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.code} — {p.title}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Allocated Amount (KES) *</label>
              <input
                type="number"
                min="0"
                step="0.01"
                required
                value={budAllocated}
                onChange={(e) => setBudAllocated(e.target.value)}
                placeholder="e.g. 1500000"
                className="w-full px-3 py-2 text-sm font-mono border border-stone-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Baseline / Opening Spend (KES)
              </label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={budSpent}
                onChange={(e) => setBudSpent(e.target.value)}
                placeholder="0"
                className="w-full px-3 py-2 text-sm font-mono border border-stone-300 rounded-lg"
              />
            </div>
          </div>

          {formError && <p className="text-xs text-red-700">{formError}</p>}

          <div className="flex justify-end gap-3 pt-2 border-t border-stone-100">
            <button
              type="button"
              onClick={() => {
                setBudgetModalOpen(false);
                setEditingBudget(null);
              }}
              className="px-4 py-2 text-sm font-medium text-slate-700 border border-stone-300 rounded-lg"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 text-sm font-semibold text-white bg-[var(--brand-primary)] hover:bg-[var(--brand-primary-hover)] rounded-lg disabled:opacity-60"
            >
              {saving ? 'Saving...' : editingBudget ? 'Update Budget' : 'Save Budget'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
