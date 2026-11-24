import React, { useMemo, useState } from 'react';
import { collection, doc, serverTimestamp, setDoc } from 'firebase/firestore';
import { Plus, Download, CalendarDays, Lock } from 'lucide-react';
import { ORG_ID, db } from '../lib/firebase.ts';
import { OperationType, handleFirestoreError } from '../lib/firestoreError.ts';
import { recordAuditLog } from '../lib/audit.ts';
import { exportToExcel, exportToPdf } from '../lib/exports.ts';
import { enqueueOfflineItem } from '../lib/offlineQueue.ts';
import { useAuth } from '../context/AuthContext.tsx';
import { useData } from '../context/DataContext.tsx';
import { DataTable, ColumnDef } from '../components/ui/DataTable.tsx';
import { Modal } from '../components/ui/Modal.tsx';
import { StatusText } from '../components/ui/StatusText.tsx';
import { ROLE_DEFINITIONS } from '../lib/rbac.ts';
import { DirectoryEntry, Employee, LeaveRequest, formatKes } from '../types/erp.ts';

type HRTab = 'directory' | 'employees' | 'leave' | 'appraisals' | 'payroll';

export function HRPage() {
  const { profile, effectiveRole } = useAuth();
  const { directory, employees, leaveRequests, appraisals, departments } = useData();

  const [tab, setTab] = useState<HRTab>('directory');
  const [empModalOpen, setEmpModalOpen] = useState(false);
  const [leaveModalOpen, setLeaveModalOpen] = useState(false);
  const [appraisalModalOpen, setAppraisalModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formMsg, setFormMsg] = useState<string | null>(null);

  // Employee form
  const [empNo, setEmpNo] = useState('');
  const [fullName, setFullName] = useState('');
  const [workEmail, setWorkEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [deptId, setDeptId] = useState('');
  const [jobTitle, setJobTitle] = useState('');
  const [empStatus, setEmpStatus] = useState<'permanent' | 'contract' | 'probation'>('permanent');
  const [contractEnd, setContractEnd] = useState('');
  const [qualifications, setQualifications] = useState('');
  const [nokName, setNokName] = useState('');
  const [nokRel, setNokRel] = useState('');
  const [emergPhone, setEmergPhone] = useState('');
  const [salaryKes, setSalaryKes] = useState('');

  // Leave form
  const [leaveType, setLeaveType] = useState<LeaveRequest['leaveType']>('annual');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [daysReq, setDaysReq] = useState('1');
  const [leaveReason, setLeaveReason] = useState('');

  // Appraisal form
  const [appEmpName, setAppEmpName] = useState('');
  const [appPeriod, setAppPeriod] = useState('H2 2026');
  const [appObjectives, setAppObjectives] = useState('');
  const [appFeedback, setAppFeedback] = useState('');
  const [appRating, setAppRating] = useState('4');

  const isHRManager = ['super_admin', 'executive_director', 'senior_management', 'hr_officer'].includes(
    effectiveRole
  );

  const handleSaveEmployee = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile) return;
    setFormMsg(null);
    setSaving(true);
    const dept = departments.find((d) => d.id === deptId);
    const ref = doc(collection(db, 'employees'));
    try {
      await setDoc(ref, {
        orgId: ORG_ID,
        empNo: empNo.trim(),
        userId: profile.uid,
        fullName: fullName.trim(),
        workEmail: workEmail.trim(),
        phone: phone.trim(),
        departmentId: dept?.id || 'general',
        departmentName: dept?.name || 'General',
        jobTitle: jobTitle.trim(),
        employmentDate: new Date().toISOString().slice(0, 10),
        employmentStatus: empStatus,
        contractEndDate: contractEnd,
        qualifications: qualifications.trim(),
        emergencyContactName: nokName.trim(),
        emergencyContactPhone: emergPhone.trim(),
        nextOfKinName: nokName.trim(),
        nextOfKinRelation: nokRel.trim(),
        salaryKes: Number(salaryKes) || 0,
        allowancesKes: 0,
        annualLeaveBalance: 21,
        isDemo: false,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      await recordAuditLog({
        actorUid: profile.uid,
        actorName: profile.displayName,
        actorRole: profile.role,
        action: 'CREATE_EMPLOYEE',
        targetCollection: 'employees',
        targetId: ref.id,
        summary: `Registered HR employee record ${empNo.trim()} — ${fullName.trim()}`,
      });
      setEmpModalOpen(false);
      setEmpNo('');
      setFullName('');
      setJobTitle('');
      setSalaryKes('');
    } catch (err) {
      try {
        handleFirestoreError(err, OperationType.CREATE, `employees/${ref.id}`);
      } catch (e2) {
        setFormMsg(e2 instanceof Error ? e2.message : 'Unable to save employee record.');
      }
    } finally {
      setSaving(false);
    }
  };

  const handleSubmitLeave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile) return;
    setFormMsg(null);
    const days = Number(daysReq);
    if (!startDate || !endDate || !Number.isFinite(days) || days <= 0) {
      setFormMsg('Specify valid start date, end date, and number of days.');
      return;
    }

    const payload = {
      orgId: ORG_ID,
      userId: profile.uid,
      employeeName: profile.displayName,
      departmentId: profile.departmentId || '',
      leaveType,
      startDate,
      endDate,
      daysRequested: days,
      reason: leaveReason.trim(),
      status: 'submitted',
      isDemo: false,
    };

    if (!navigator.onLine) {
      enqueueOfflineItem({
        clientRequestId: `leave_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        type: 'leave_request',
        userId: profile.uid,
        userName: profile.displayName,
        userRole: profile.role,
        payload,
      });
      setLeaveModalOpen(false);
      setLeaveReason('');
      setFormMsg('Device offline: leave request queued for automatic sync.');
      return;
    }

    setSaving(true);
    const ref = doc(collection(db, 'leaveRequests'));
    try {
      await setDoc(ref, {
        ...payload,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      await recordAuditLog({
        actorUid: profile.uid,
        actorName: profile.displayName,
        actorRole: profile.role,
        action: 'SUBMIT_LEAVE',
        targetCollection: 'leaveRequests',
        targetId: ref.id,
        summary: `Submitted ${days}-day ${leaveType} leave (${startDate} to ${endDate})`,
      });
      setLeaveModalOpen(false);
      setLeaveReason('');
    } catch (err) {
      try {
        handleFirestoreError(err, OperationType.CREATE, `leaveRequests/${ref.id}`);
      } catch (e2) {
        setFormMsg(e2 instanceof Error ? e2.message : 'Failed to submit leave request.');
      }
    } finally {
      setSaving(false);
    }
  };

  const handleCreateAppraisal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile) return;
    setSaving(true);
    const ref = doc(collection(db, 'appraisals'));
    try {
      await setDoc(ref, {
        orgId: ORG_ID,
        employeeUserId: profile.uid,
        employeeName: appEmpName.trim(),
        reviewerId: profile.uid,
        reviewerName: profile.displayName,
        period: appPeriod.trim(),
        objectives: appObjectives.trim(),
        feedback: appFeedback.trim(),
        rating: Number(appRating) || 4,
        status: 'submitted',
        isDemo: false,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      setAppraisalModalOpen(false);
      setAppEmpName('');
      setAppObjectives('');
      setAppFeedback('');
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, `appraisals/${ref.id}`);
    } finally {
      setSaving(false);
    }
  };

  const totalMonthlyPayroll = useMemo(
    () => employees.reduce((s, e) => s + (e.salaryKes || 0) + (e.allowancesKes || 0), 0),
    [employees]
  );

  const dirCols: ColumnDef<DirectoryEntry>[] = [
    {
      key: 'name',
      header: 'Staff Member',
      sortable: true,
      sortValue: (r) => r.displayName,
      render: (r) => (
        <div>
          <div className="font-medium text-slate-900">{r.displayName}</div>
          <div className="text-xs text-slate-500">{r.jobTitle || 'Staff'}</div>
        </div>
      ),
    },
    {
      key: 'dept',
      header: 'Department',
      sortable: true,
      sortValue: (r) => r.departmentName || '',
      render: (r) => r.departmentName || 'General',
    },
    {
      key: 'role',
      header: 'Role',
      render: (r) => ROLE_DEFINITIONS[r.role]?.label || r.role,
    },
    {
      key: 'status',
      header: 'Status',
      render: (r) => <StatusText status={r.status} />,
    },
  ];

  const empCols: ColumnDef<Employee>[] = [
    {
      key: 'empNo',
      header: 'Emp No',
      sortable: true,
      sortValue: (r) => r.empNo,
      render: (r) => <span className="font-mono text-xs font-semibold text-slate-900">{r.empNo}</span>,
    },
    {
      key: 'fullName',
      header: 'Full Name & Title',
      sortable: true,
      sortValue: (r) => r.fullName,
      render: (r) => (
        <div>
          <div className="font-medium text-slate-900">{r.fullName}</div>
          <div className="text-xs text-slate-500">
            {r.jobTitle} · {r.departmentName || 'General'}
          </div>
        </div>
      ),
    },
    {
      key: 'contact',
      header: 'Contact & Next of Kin',
      render: (r) => (
        <div className="text-xs">
          <div className="text-slate-700">{r.phone || r.workEmail || '—'}</div>
          <div className="text-slate-500">
            Kin: {r.nextOfKinName || '—'} {r.nextOfKinRelation ? `(${r.nextOfKinRelation})` : ''}
          </div>
        </div>
      ),
    },
    {
      key: 'contract',
      header: 'Employment',
      render: (r) => (
        <div className="space-y-0.5">
          <StatusText status={r.employmentStatus} />
          {r.contractEndDate && (
            <div className="text-[11px] font-mono text-slate-500">Ends {r.contractEndDate}</div>
          )}
        </div>
      ),
    },
    {
      key: 'leave',
      header: 'Leave Bal',
      align: 'right',
      render: (r) => <span className="font-mono">{r.annualLeaveBalance ?? 21} d</span>,
    },
  ];

  const leaveCols: ColumnDef<LeaveRequest>[] = [
    {
      key: 'emp',
      header: 'Applicant',
      sortable: true,
      sortValue: (r) => r.employeeName,
      render: (r) => (
        <div>
          <div className="font-medium text-slate-900">{r.employeeName}</div>
          <div className="text-xs text-slate-500 capitalize">{r.leaveType.replace(/_/g, ' ')} leave</div>
        </div>
      ),
    },
    {
      key: 'dates',
      header: 'Dates',
      render: (r) => (
        <span className="font-mono text-xs text-slate-700">
          {r.startDate} → {r.endDate}
        </span>
      ),
    },
    {
      key: 'days',
      header: 'Days',
      align: 'right',
      render: (r) => <span className="font-mono font-semibold">{r.daysRequested}</span>,
    },
    {
      key: 'reason',
      header: 'Reason / Notes',
      render: (r) => <span className="text-xs text-slate-600 line-clamp-2">{r.reason || '—'}</span>,
    },
    {
      key: 'status',
      header: 'Status',
      render: (r) => <StatusText status={r.status} />,
    },
  ];

  const handleExportHR = (format: 'pdf' | 'xlsx') => {
    const cols = [
      { header: 'Emp No', key: 'empNo' },
      { header: 'Full Name', key: 'fullName' },
      { header: 'Department', key: 'departmentName' },
      { header: 'Job Title', key: 'jobTitle' },
      { header: 'Status', key: 'employmentStatus' },
      { header: 'Leave Balance', key: 'leaveBal' },
    ];
    const rows = employees.map((e) => ({
      empNo: e.empNo,
      fullName: e.fullName,
      departmentName: e.departmentName || 'General',
      jobTitle: e.jobTitle,
      employmentStatus: e.employmentStatus,
      leaveBal: e.annualLeaveBalance ?? 21,
    }));
    if (format === 'pdf') {
      exportToPdf({ fileName: 'iServe_HR_Establishment', title: 'Staff Establishment & HR Report', columns: cols, rows });
    } else {
      exportToExcel({ fileName: 'iServe_HR_Establishment', sheetName: 'Employees', title: 'HR Establishment', columns: cols, rows });
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 font-display">Human Resource Management</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Staff directory, protected employee records, leave calendar, appraisals, and payroll summary
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {isHRManager && (
            <>
              <button
                type="button"
                onClick={() => handleExportHR('pdf')}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-700 bg-white border border-stone-300 rounded-lg hover:bg-stone-50"
              >
                <Download className="w-3.5 h-3.5" />
                HR PDF
              </button>
              <button
                type="button"
                onClick={() => handleExportHR('xlsx')}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-700 bg-white border border-stone-300 rounded-lg hover:bg-stone-50"
              >
                <Download className="w-3.5 h-3.5" />
                HR Excel
              </button>
              <button
                type="button"
                onClick={() => setEmpModalOpen(true)}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-slate-800 bg-white border border-stone-300 rounded-lg hover:bg-stone-50"
              >
                <Plus className="w-3.5 h-3.5" />
                Register Employee
              </button>
            </>
          )}
          <button
            type="button"
            onClick={() => setLeaveModalOpen(true)}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-[var(--brand-primary)] hover:bg-[var(--brand-primary-hover)] rounded-lg"
          >
            <CalendarDays className="w-3.5 h-3.5" />
            Apply for Leave
          </button>
        </div>
      </div>

      {formMsg && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-xs text-emerald-900">
          {formMsg}
        </div>
      )}

      {/* Tabs */}
      <div className="flex items-center gap-1 p-1 bg-stone-200/70 rounded-lg w-fit overflow-x-auto">
        {(
          [
            { key: 'directory', label: 'Staff Directory' },
            { key: 'leave', label: 'Leave & Calendar' },
            ...(isHRManager
              ? [
                  { key: 'employees' as HRTab, label: 'Employee Records (PII)' },
                  { key: 'appraisals' as HRTab, label: 'Appraisals' },
                  { key: 'payroll' as HRTab, label: 'Payroll Overview' },
                ]
              : []),
          ] as { key: HRTab; label: string }[]
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

      {tab === 'directory' && (
        <DataTable
          rows={directory}
          columns={dirCols}
          rowKey={(r) => r.id}
          searchPlaceholder="Search staff by name, job title, or department..."
          searchFilter={(r, q) =>
            r.displayName.toLowerCase().includes(q) ||
            (r.jobTitle || '').toLowerCase().includes(q) ||
            (r.departmentName || '').toLowerCase().includes(q)
          }
        />
      )}

      {tab === 'employees' && isHRManager && (
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-xs text-slate-600">
            <Lock className="w-3.5 h-3.5 text-emerald-800" />
            <span>
              Protected under Kenya Data Protection Act: personal contacts, next of kin, and remuneration are visible
              strictly to authorised HR, Executive Leadership, and the record owner.
            </span>
          </div>
          <DataTable
            rows={employees}
            columns={empCols}
            rowKey={(r) => r.id}
            searchPlaceholder="Search employee no, name, or department..."
            searchFilter={(r, q) =>
              r.empNo.toLowerCase().includes(q) ||
              r.fullName.toLowerCase().includes(q) ||
              (r.departmentName || '').toLowerCase().includes(q)
            }
          />
        </div>
      )}

      {tab === 'leave' && (
        <DataTable
          rows={leaveRequests}
          columns={leaveCols}
          rowKey={(r) => r.id}
          searchPlaceholder="Search leave applications..."
          searchFilter={(r, q) =>
            r.employeeName.toLowerCase().includes(q) || r.leaveType.toLowerCase().includes(q)
          }
        />
      )}

      {tab === 'appraisals' && isHRManager && (
        <div className="space-y-4">
          <div className="flex justify-end">
            <button
              type="button"
              onClick={() => setAppraisalModalOpen(true)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-white bg-[var(--brand-primary)] rounded-lg"
            >
              <Plus className="w-3.5 h-3.5" />
              Record Appraisal
            </button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {appraisals.length === 0 ? (
              <div className="col-span-full bg-white border border-stone-200 rounded-xl p-8 text-center text-xs text-slate-500">
                No appraisals logged yet.
              </div>
            ) : (
              appraisals.map((ap) => (
                <div key={ap.id} className="bg-white border border-stone-200 rounded-xl p-5 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="text-sm font-semibold text-slate-900">{ap.employeeName}</div>
                    <StatusText status={ap.status} />
                  </div>
                  <div className="text-xs text-slate-500">
                    Period: {ap.period} · Reviewer: {ap.reviewerName || 'HR'} · Rating:{' '}
                    <span className="font-mono font-semibold text-slate-900">{ap.rating || '—'}/5</span>
                  </div>
                  <p className="text-xs text-slate-700 leading-relaxed">{ap.objectives}</p>
                  {ap.feedback && (
                    <p className="text-xs text-slate-500 pt-2 border-t border-stone-100">{ap.feedback}</p>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {tab === 'payroll' && isHRManager && (
        <div className="bg-white border border-stone-200 rounded-xl p-6 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-stone-100 pb-4">
            <div>
              <h2 className="text-base font-semibold text-slate-900 font-display">
                Payroll Gross Summary & Accounting Integration
              </h2>
              <p className="text-xs text-slate-500">
                Statutory deductions (PAYE, NSSF, SHIF/NHIF) are processed via the organisation’s external payroll
                provider — no unverified statutory formulas are computed here.
              </p>
            </div>
            <div className="text-right">
              <div className="text-xs text-slate-500">Monthly Gross Establishment</div>
              <div className="text-xl font-bold font-mono text-slate-900 tabular-nums">
                {formatKes(totalMonthlyPayroll)}
              </div>
            </div>
          </div>

          <div className="divide-y divide-stone-100 text-sm">
            {employees.map((e) => (
              <div key={e.id} className="py-2.5 flex items-center justify-between gap-4">
                <div>
                  <div className="font-medium text-slate-900">
                    {e.fullName} <span className="text-xs font-mono text-slate-400">({e.empNo})</span>
                  </div>
                  <div className="text-xs text-slate-500">{e.jobTitle}</div>
                </div>
                <div className="text-right font-mono text-xs">
                  <div className="font-semibold text-slate-900">
                    {formatKes((e.salaryKes || 0) + (e.allowancesKes || 0))}
                  </div>
                  <div className="text-slate-500">
                    Base {formatKes(e.salaryKes || 0)} + Allow {formatKes(e.allowancesKes || 0)}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Employee Modal */}
      <Modal open={empModalOpen} onClose={() => setEmpModalOpen(false)} title="Register Employee Record">
        <form onSubmit={handleSaveEmployee} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Employee Number</label>
              <input
                type="text"
                required
                value={empNo}
                onChange={(e) => setEmpNo(e.target.value)}
                placeholder="ISA-021"
                className="w-full px-3 py-2 text-sm font-mono border border-stone-300 rounded-lg"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-slate-700 mb-1">Full Names</label>
              <input
                type="text"
                required
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-stone-300 rounded-lg"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Work Email</label>
              <input
                type="email"
                value={workEmail}
                onChange={(e) => setWorkEmail(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-stone-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Phone</label>
              <input
                type="text"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+254 7..."
                className="w-full px-3 py-2 text-sm border border-stone-300 rounded-lg"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Department</label>
              <select
                required
                value={deptId}
                onChange={(e) => setDeptId(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-stone-300 rounded-lg"
              >
                <option value="">Select Department</option>
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Job Title</label>
              <input
                type="text"
                required
                value={jobTitle}
                onChange={(e) => setJobTitle(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-stone-300 rounded-lg"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Employment Status</label>
              <select
                value={empStatus}
                onChange={(e) => setEmpStatus(e.target.value as typeof empStatus)}
                className="w-full px-3 py-2 text-sm border border-stone-300 rounded-lg"
              >
                <option value="permanent">Permanent</option>
                <option value="contract">Contract</option>
                <option value="probation">Probation</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Contract End (If Fixed)</label>
              <input
                type="date"
                value={contractEnd}
                onChange={(e) => setContractEnd(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-stone-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Monthly Base Salary (KES)</label>
              <input
                type="number"
                min="0"
                value={salaryKes}
                onChange={(e) => setSalaryKes(e.target.value)}
                className="w-full px-3 py-2 text-sm font-mono border border-stone-300 rounded-lg"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Next of Kin Name</label>
              <input
                type="text"
                value={nokName}
                onChange={(e) => setNokName(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-stone-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Relationship</label>
              <input
                type="text"
                value={nokRel}
                onChange={(e) => setNokRel(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-stone-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Emergency Phone</label>
              <input
                type="text"
                value={emergPhone}
                onChange={(e) => setEmergPhone(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-stone-300 rounded-lg"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Qualifications</label>
            <input
              type="text"
              value={qualifications}
              onChange={(e) => setQualifications(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-stone-300 rounded-lg"
            />
          </div>

          <div className="flex justify-end gap-3 pt-2 border-t border-stone-100">
            <button
              type="button"
              onClick={() => setEmpModalOpen(false)}
              className="px-4 py-2 text-sm border border-stone-300 rounded-lg"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 text-sm font-semibold text-white bg-[var(--brand-primary)] rounded-lg"
            >
              {saving ? 'Saving...' : 'Save Employee'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Leave Application Modal */}
      <Modal open={leaveModalOpen} onClose={() => setLeaveModalOpen(false)} title="Leave Application" maxWidthClass="max-w-lg">
        <form onSubmit={handleSubmitLeave} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Leave Type</label>
              <select
                value={leaveType}
                onChange={(e) => setLeaveType(e.target.value as LeaveRequest['leaveType'])}
                className="w-full px-3 py-2 text-sm border border-stone-300 rounded-lg"
              >
                <option value="annual">Annual Leave</option>
                <option value="sick">Sick Leave</option>
                <option value="compassionate">Compassionate Leave</option>
                <option value="study">Study Leave</option>
                <option value="maternity_paternity">Maternity / Paternity</option>
                <option value="unpaid">Unpaid Leave</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Days Requested</label>
              <input
                type="number"
                min="1"
                required
                value={daysReq}
                onChange={(e) => setDaysReq(e.target.value)}
                className="w-full px-3 py-2 text-sm font-mono border border-stone-300 rounded-lg"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Start Date</label>
              <input
                type="date"
                required
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-stone-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">End Date</label>
              <input
                type="date"
                required
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-stone-300 rounded-lg"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Handover / Reason</label>
            <textarea
              rows={3}
              required
              value={leaveReason}
              onChange={(e) => setLeaveReason(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-stone-300 rounded-lg"
            />
          </div>

          <div className="flex justify-end gap-3 pt-2 border-t border-stone-100">
            <button
              type="button"
              onClick={() => setLeaveModalOpen(false)}
              className="px-4 py-2 text-sm border border-stone-300 rounded-lg"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 text-sm font-semibold text-white bg-[var(--brand-primary)] rounded-lg"
            >
              {saving ? 'Submitting...' : 'Submit Application'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Appraisal Modal */}
      <Modal open={appraisalModalOpen} onClose={() => setAppraisalModalOpen(false)} title="Record Performance Appraisal" maxWidthClass="max-w-lg">
        <form onSubmit={handleCreateAppraisal} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Employee Name</label>
              <input
                type="text"
                required
                value={appEmpName}
                onChange={(e) => setAppEmpName(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-stone-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Review Period</label>
              <input
                type="text"
                required
                value={appPeriod}
                onChange={(e) => setAppPeriod(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-stone-300 rounded-lg"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Objectives & Deliverables</label>
            <textarea
              rows={3}
              required
              value={appObjectives}
              onChange={(e) => setAppObjectives(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-stone-300 rounded-lg"
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Rating (1–5)</label>
              <input
                type="number"
                min="1"
                max="5"
                step="0.5"
                value={appRating}
                onChange={(e) => setAppRating(e.target.value)}
                className="w-full px-3 py-2 text-sm font-mono border border-stone-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Supervisor Feedback</label>
              <input
                type="text"
                value={appFeedback}
                onChange={(e) => setAppFeedback(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-stone-300 rounded-lg"
              />
            </div>
          </div>
          <div className="flex justify-end gap-3 pt-2 border-t border-stone-100">
            <button
              type="button"
              onClick={() => setAppraisalModalOpen(false)}
              className="px-4 py-2 text-sm border border-stone-300 rounded-lg"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 text-sm font-semibold text-white bg-[var(--brand-primary)] rounded-lg"
            >
              Save Appraisal
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
