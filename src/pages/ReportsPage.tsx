import { useState } from 'react';
import { FileSpreadsheet, FileDown } from 'lucide-react';
import { useData } from '../context/DataContext.tsx';
import { exportToExcel, exportToPdf } from '../lib/exports.ts';
import { formatKes } from '../types/erp.ts';

export function ReportsPage() {
  const {
    departments,
    projects,
    financeTransactions,
    budgets,
    employees,
    apprentices,
    apprenticeReports,
    books,
    bookSales,
    procurementRequests,
  } = useData();

  const [deptId, setDeptId] = useState('all');
  const [projectId, setProjectId] = useState('all');

  const exportFinancePack = (fmt: 'pdf' | 'xlsx') => {
    const filtered = financeTransactions.filter(
      (t) => (deptId === 'all' || t.departmentId === deptId) && (projectId === 'all' || t.projectId === projectId)
    );
    const cols = [
      { header: 'Ref', key: 'txNumber' },
      { header: 'Type', key: 'txType' },
      { header: 'Title', key: 'title' },
      { header: 'Department', key: 'dept' },
      { header: 'Amount (KES)', key: 'amount' },
      { header: 'Status', key: 'status' },
    ];
    const rows = filtered.map((t) => ({
      txNumber: t.txNumber,
      txType: t.txType,
      title: t.title,
      dept: t.departmentName || 'General',
      amount: t.amountKes,
      status: t.status,
    }));
    if (fmt === 'pdf') {
      exportToPdf({ fileName: 'iServe_Financial_Pack', title: 'Financial Transactions & Expenditure Pack', columns: cols, rows });
    } else {
      exportToExcel({ fileName: 'iServe_Financial_Pack', sheetName: 'Finance', title: 'Financial Pack', columns: cols, rows });
    }
  };

  const exportBudgetPack = (fmt: 'pdf' | 'xlsx') => {
    const filtered = budgets.filter((b) => deptId === 'all' || b.departmentId === deptId);
    const cols = [
      { header: 'Budget Line', key: 'title' },
      { header: 'Scope', key: 'scope' },
      { header: 'Department', key: 'dept' },
      { header: 'Allocated (KES)', key: 'alloc' },
      { header: 'Spent (KES)', key: 'spent' },
      { header: 'Remaining (KES)', key: 'rem' },
    ];
    const rows = filtered.map((b) => ({
      title: b.title,
      scope: b.scope,
      dept: b.departmentName || 'Org',
      alloc: b.allocatedKes,
      spent: b.spentKes,
      rem: b.allocatedKes - b.spentKes,
    }));
    if (fmt === 'pdf') {
      exportToPdf({ fileName: 'iServe_Budget_Performance', title: 'Budget Performance vs Actuals', columns: cols, rows });
    } else {
      exportToExcel({ fileName: 'iServe_Budget_Performance', sheetName: 'Budgets', title: 'Budget Performance', columns: cols, rows });
    }
  };

  const exportHRPack = (fmt: 'pdf' | 'xlsx') => {
    const filtered = employees.filter((e) => deptId === 'all' || e.departmentId === deptId);
    const cols = [
      { header: 'Emp No', key: 'empNo' },
      { header: 'Name', key: 'fullName' },
      { header: 'Department', key: 'dept' },
      { header: 'Title', key: 'jobTitle' },
      { header: 'Status', key: 'status' },
      { header: 'Leave Bal', key: 'leave' },
    ];
    const rows = filtered.map((e) => ({
      empNo: e.empNo,
      fullName: e.fullName,
      dept: e.departmentName || '',
      jobTitle: e.jobTitle,
      status: e.employmentStatus,
      leave: e.annualLeaveBalance ?? 21,
    }));
    if (fmt === 'pdf') {
      exportToPdf({ fileName: 'iServe_HR_Establishment', title: 'Staff Establishment & Leave Balances', columns: cols, rows });
    } else {
      exportToExcel({ fileName: 'iServe_HR_Establishment', sheetName: 'Staff', title: 'Staff Establishment', columns: cols, rows });
    }
  };

  const exportApprenticePack = (fmt: 'pdf' | 'xlsx') => {
    const cols = [
      { header: 'Apprentice', key: 'name' },
      { header: 'Report Type', key: 'type' },
      { header: 'Period', key: 'period' },
      { header: 'Score', key: 'score' },
      { header: 'Status', key: 'status' },
    ];
    const rows = apprenticeReports.map((r) => ({
      name: r.apprenticeName,
      type: r.reportType,
      period: r.periodStart,
      score: r.evaluationScore ?? '—',
      status: r.status,
    }));
    if (fmt === 'pdf') {
      exportToPdf({ fileName: 'iServe_Apprentice_Compliance', title: 'Apprentice Reporting & Evaluation Report', columns: cols, rows });
    } else {
      exportToExcel({ fileName: 'iServe_Apprentice_Compliance', sheetName: 'ApprenticeReports', title: 'Apprentice Compliance', columns: cols, rows });
    }
  };

  const exportBookstorePack = (fmt: 'pdf' | 'xlsx') => {
    const cols = [
      { header: 'Receipt No', key: 'receipt' },
      { header: 'Customer', key: 'customer' },
      { header: 'Method', key: 'method' },
      { header: 'Items', key: 'items' },
      { header: 'Total (KES)', key: 'total' },
    ];
    const rows = bookSales.map((s) => ({
      receipt: s.receiptNo,
      customer: s.customerName || 'Walk-in',
      method: s.paymentMethod,
      items: s.itemCount,
      total: s.totalKes,
    }));
    if (fmt === 'pdf') {
      exportToPdf({ fileName: 'iServe_Bookstore_Sales', title: 'Bookstore POS Sales Report', columns: cols, rows });
    } else {
      exportToExcel({ fileName: 'iServe_Bookstore_Sales', sheetName: 'BookSales', title: 'Bookstore Sales', columns: cols, rows });
    }
  };

  const exportProjectsPack = (fmt: 'pdf' | 'xlsx') => {
    const filtered = projects.filter(
      (p) => (deptId === 'all' || p.departmentId === deptId) && (projectId === 'all' || p.id === projectId)
    );
    const cols = [
      { header: 'Code', key: 'code' },
      { header: 'Title', key: 'title' },
      { header: 'Donor', key: 'donor' },
      { header: 'Budget (KES)', key: 'budget' },
      { header: 'Spent (KES)', key: 'spent' },
      { header: 'Progress %', key: 'progress' },
    ];
    const rows = filtered.map((p) => ({
      code: p.code,
      title: p.title,
      donor: p.donorFunded ? p.donorName || 'Donor' : 'Internal',
      budget: p.budgetKes,
      spent: p.spentKes,
      progress: p.progressPct,
    }));
    if (fmt === 'pdf') {
      exportToPdf({ fileName: 'iServe_Project_Donor_Report', title: 'Projects & Donor Expenditure Report', columns: cols, rows });
    } else {
      exportToExcel({ fileName: 'iServe_Project_Donor_Report', sheetName: 'Projects', title: 'Projects Report', columns: cols, rows });
    }
  };

  const reportPacks = [
    {
      title: 'Financial Expenditure & Payments',
      desc: `${financeTransactions.length} transaction(s) tracked in KES`,
      onPdf: () => exportFinancePack('pdf'),
      onXlsx: () => exportFinancePack('xlsx'),
    },
    {
      title: 'Budget Performance vs Actuals',
      desc: `${budgets.length} organisational, departmental & project budget lines`,
      onPdf: () => exportBudgetPack('pdf'),
      onXlsx: () => exportBudgetPack('xlsx'),
    },
    {
      title: 'HR Establishment & Leave Balances',
      desc: `${employees.length} employee record(s) across ${departments.length} department(s)`,
      onPdf: () => exportHRPack('pdf'),
      onXlsx: () => exportHRPack('xlsx'),
    },
    {
      title: 'Apprenticeship Compliance & Evaluations',
      desc: `${apprentices.length} apprentice(s) · ${apprenticeReports.length} report(s)`,
      onPdf: () => exportApprenticePack('pdf'),
      onXlsx: () => exportApprenticePack('xlsx'),
    },
    {
      title: 'Bookstore Sales & Inventory Valuation',
      desc: `${books.length} title(s) · ${formatKes(bookSales.reduce((s, b) => s + b.totalKes, 0))} recorded sales`,
      onPdf: () => exportBookstorePack('pdf'),
      onXlsx: () => exportBookstorePack('xlsx'),
    },
    {
      title: 'Projects & Donor Funding Report',
      desc: `${projects.length} project(s) · ${procurementRequests.length} procurement requisition(s)`,
      onPdf: () => exportProjectsPack('pdf'),
      onXlsx: () => exportProjectsPack('xlsx'),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 font-display">Organisational Reports & Exports</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Generate branded PDF and Excel (.xlsx) reports filtered by department and project
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <select
            value={deptId}
            onChange={(e) => setDeptId(e.target.value)}
            className="px-3 py-1.5 text-xs bg-white border border-stone-300 rounded-lg"
          >
            <option value="all">All Departments</option>
            {departments.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>

          <select
            value={projectId}
            onChange={(e) => setProjectId(e.target.value)}
            className="px-3 py-1.5 text-xs bg-white border border-stone-300 rounded-lg"
          >
            <option value="all">All Projects</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.code} — {p.title}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {reportPacks.map((pack) => (
          <div key={pack.title} className="bg-white border border-stone-200 rounded-xl p-5 flex flex-col justify-between gap-4">
            <div className="space-y-1">
              <h2 className="text-sm font-semibold text-slate-900 font-display">{pack.title}</h2>
              <p className="text-xs text-slate-500">{pack.desc}</p>
            </div>
            <div className="flex items-center gap-2 pt-2 border-t border-stone-100">
              <button
                type="button"
                onClick={pack.onPdf}
                className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium text-white bg-[var(--brand-primary)] hover:bg-[var(--brand-primary-hover)] rounded-lg"
              >
                <FileDown className="w-3.5 h-3.5" />
                Download PDF
              </button>
              <button
                type="button"
                onClick={pack.onXlsx}
                className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-700 bg-white border border-stone-300 hover:bg-stone-50 rounded-lg"
              >
                <FileSpreadsheet className="w-3.5 h-3.5" />
                Excel (.xlsx)
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
