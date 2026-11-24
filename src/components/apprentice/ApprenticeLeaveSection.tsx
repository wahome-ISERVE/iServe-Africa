import React, { useEffect, useMemo, useState } from 'react';
import { collection, doc, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';
import { CalendarDays, Plus, Upload, Paperclip, Info, XCircle } from 'lucide-react';
import { ORG_ID, db } from '../../lib/firebase.ts';
import { OperationType, handleFirestoreError } from '../../lib/firestoreError.ts';
import { recordAuditLog, sendNotification } from '../../lib/audit.ts';
import { calculateWorkingDays, computeApprenticeLeaveSummary } from '../../lib/leaveUtils.ts';
import { processDocumentUpload } from '../../lib/fileUpload.ts';
import { useAuth } from '../../context/AuthContext.tsx';
import { useData } from '../../context/DataContext.tsx';
import { DataTable, ColumnDef } from '../ui/DataTable.tsx';
import { Modal } from '../ui/Modal.tsx';
import { StatusText } from '../ui/StatusText.tsx';
import { AttachmentPreviewModal } from './AttachmentPreviewModal.tsx';
import { Apprentice, LeaveRequest, formatNairobiDate } from '../../types/erp.ts';

interface ApprenticeLeaveSectionProps {
  apprenticeRecord: Apprentice | null;
  autoOpenNew?: boolean;
  onConsumeAutoOpen?: () => void;
}

export function ApprenticeLeaveSection({
  apprenticeRecord,
  autoOpenNew,
  onConsumeAutoOpen,
}: ApprenticeLeaveSectionProps) {
  const { profile } = useAuth();
  const { leaveRequests, leavePolicy, directory } = useData();

  const [modalOpen, setModalOpen] = useState(false);
  const [leaveType, setLeaveType] = useState<LeaveRequest['leaveType']>('annual');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [reason, setReason] = useState('');
  const [emergencyContact, setEmergencyContact] = useState(apprenticeRecord?.emergencyContact || '');
  const [attachmentName, setAttachmentName] = useState('');
  const [attachmentDataUrl, setAttachmentDataUrl] = useState('');
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [previewDoc, setPreviewDoc] = useState<{ title: string; fileName: string; dataUrl: string } | null>(null);

  const uid = profile?.uid || '';

  const myLeaves = useMemo(
    () => leaveRequests.filter((r) => r.userId === uid),
    [leaveRequests, uid]
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

  const workingBreakdown = useMemo(
    () => calculateWorkingDays(startDate, endDate, leavePolicy.publicHolidays || []),
    [startDate, endDate, leavePolicy.publicHolidays]
  );

  const resetForm = () => {
    setLeaveType('annual');
    setStartDate('');
    setEndDate('');
    setReason('');
    setEmergencyContact(apprenticeRecord?.emergencyContact || '');
    setAttachmentName('');
    setAttachmentDataUrl('');
    setFormError(null);
  };

  useEffect(() => {
    if (autoOpenNew) {
      resetForm();
      setModalOpen(true);
      onConsumeAutoOpen?.();
    }
  }, [autoOpenNew, onConsumeAutoOpen]);

  const handleAttachmentChange = async (file: File | undefined) => {
    if (!file) return;
    setFormError(null);
    try {
      const processed = await processDocumentUpload(file, {
        allowPdf: true,
        allowImages: true,
        maxDataUrlLength: 440000,
      });
      setAttachmentName(processed.fileName);
      setAttachmentDataUrl(processed.dataUrl);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Unable to attach supporting document.');
    }
  };

  const handleSubmitLeave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile) return;
    setFormError(null);
    setNotice(null);

    if (!startDate || !endDate) {
      setFormError('Select both start date and end date.');
      return;
    }
    if (endDate < startDate) {
      setFormError('End date must be on or after the start date.');
      return;
    }
    if (workingBreakdown.workingDays <= 0) {
      setFormError('Selected date range contains 0 working days (only weekends or public holidays).');
      return;
    }
    if (leaveType === 'annual' && workingBreakdown.workingDays > leaveSummary.remainingLeaveDays) {
      setFormError(
        `Requested ${workingBreakdown.workingDays} working day(s) exceeds your confirmed remaining annual leave balance of ${leaveSummary.remainingLeaveDays} day(s).`
      );
      return;
    }
    if (reason.trim().length < 3) {
      setFormError('Please provide a clear reason and handover notes.');
      return;
    }

    const sup = directory.find((d) => d.role === 'apprentice_supervisor');
    const supervisorId = apprenticeRecord?.supervisorId || sup?.uid || '';

    setSaving(true);
    const ref = doc(collection(db, 'leaveRequests'));
    try {
      await setDoc(ref, {
        orgId: ORG_ID,
        userId: profile.uid,
        employeeName: apprenticeRecord?.fullName || profile.displayName,
        departmentId: profile.departmentId || 'apprenticeship',
        supervisorId,
        applicantRole: 'apprentice',
        leaveYear: startDate.slice(0, 4) || leaveSummary.leaveYear,
        leaveType,
        startDate,
        endDate,
        daysRequested: workingBreakdown.workingDays,
        reason: reason.trim(),
        emergencyContact: emergencyContact.trim(),
        attachmentName,
        attachmentDataUrl,
        status: 'submitted',
        isDemo: false,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      await recordAuditLog({
        actorUid: profile.uid,
        actorName: profile.displayName,
        actorRole: profile.role,
        action: 'SUBMIT_APPRENTICE_LEAVE',
        targetCollection: 'leaveRequests',
        targetId: ref.id,
        summary: `Submitted ${workingBreakdown.workingDays}-day ${leaveType} leave (${startDate} to ${endDate})`,
      });

      if (supervisorId && supervisorId !== profile.uid && !supervisorId.startsWith('demo_')) {
        await sendNotification({
          recipientUid: supervisorId,
          title: 'New Apprentice Leave Request',
          message: `${apprenticeRecord?.fullName || profile.displayName} requested ${workingBreakdown.workingDays} working day(s) of ${leaveType} leave (${startDate} to ${endDate}).`,
          category: 'leave',
          linkModule: 'approvals',
        });
      }

      setModalOpen(false);
      resetForm();
      setNotice('Leave application submitted to your supervisor for initial review.');
    } catch (err) {
      try {
        handleFirestoreError(err, OperationType.CREATE, `leaveRequests/${ref.id}`);
      } catch (e2) {
        setFormError(e2 instanceof Error ? e2.message : 'Unable to submit leave request.');
      }
    } finally {
      setSaving(false);
    }
  };

  const handleCancelPending = async (leave: LeaveRequest) => {
    if (!profile) return;
    try {
      await updateDoc(doc(db, 'leaveRequests', leave.id), {
        status: 'cancelled',
        updatedAt: serverTimestamp(),
      });
      await recordAuditLog({
        actorUid: profile.uid,
        actorName: profile.displayName,
        actorRole: profile.role,
        action: 'CANCEL_LEAVE_REQUEST',
        targetCollection: 'leaveRequests',
        targetId: leave.id,
        summary: `Cancelled ${leave.daysRequested}-day ${leave.leaveType} leave application`,
      });
      setNotice('Leave application cancelled.');
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `leaveRequests/${leave.id}`);
    }
  };

  const columns: ColumnDef<LeaveRequest>[] = [
    {
      key: 'createdAt',
      header: 'Application Date',
      sortable: true,
      sortValue: (r) => r.startDate,
      render: (r) => (
        <div>
          <div className="font-mono text-xs text-slate-900">{formatNairobiDate(r.createdAt) || r.startDate}</div>
          <div className="text-[11px] text-slate-500 capitalize">{r.leaveType.replace(/_/g, ' ')} leave</div>
        </div>
      ),
    },
    {
      key: 'dates',
      header: 'Leave Dates',
      render: (r) => (
        <div className="font-mono text-xs text-slate-800">
          {r.startDate} → {r.endDate}
        </div>
      ),
    },
    {
      key: 'days',
      header: 'Days Requested',
      align: 'right',
      sortable: true,
      sortValue: (r) => r.daysRequested,
      render: (r) => <span className="font-mono font-semibold text-slate-900">{r.daysRequested} d</span>,
    },
    {
      key: 'status',
      header: 'Approval Status',
      sortable: true,
      sortValue: (r) => r.status,
      render: (r) => <StatusText status={r.status} />,
    },
    {
      key: 'comments',
      header: 'Approver Comments',
      render: (r) => (
        <div className="text-xs text-slate-600 space-y-0.5 max-w-xs">
          {r.supervisorComment && (
            <div>
              <span className="font-medium text-slate-700">Supervisor:</span> {r.supervisorComment}
            </div>
          )}
          {r.hrComment && (
            <div>
              <span className="font-medium text-slate-700">HR:</span> {r.hrComment}
            </div>
          )}
          {!r.supervisorComment && !r.hrComment && (
            <div>{r.approverComment || 'Awaiting review'}</div>
          )}
        </div>
      ),
    },
    {
      key: 'actions',
      header: 'Actions',
      align: 'right',
      render: (r) => (
        <div className="flex items-center justify-end gap-2">
          {r.attachmentDataUrl && (
            <button
              type="button"
              onClick={() =>
                setPreviewDoc({
                  title: 'Leave Supporting Document',
                  fileName: r.attachmentName || 'supporting_document',
                  dataUrl: r.attachmentDataUrl!,
                })
              }
              className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-emerald-800 border border-emerald-200 bg-emerald-50 rounded-lg"
            >
              <Paperclip className="w-3.5 h-3.5" />
              Doc
            </button>
          )}
          {(r.status === 'submitted' || r.status === 'pending_hr') && (
            <button
              type="button"
              onClick={() => void handleCancelPending(r)}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-red-700 border border-red-200 bg-red-50 rounded-lg hover:bg-red-100"
            >
              <XCircle className="w-3.5 h-3.5" />
              Cancel
            </button>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 font-display">Leave Management</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Track your {leaveSummary.totalEntitlement}-day annual leave entitlement, working-day calendar, and HR approvals
          </p>
        </div>

        <button
          type="button"
          onClick={() => {
            resetForm();
            setModalOpen(true);
          }}
          className="inline-flex items-center gap-1.5 px-4 py-2.5 text-xs font-semibold text-white bg-[var(--brand-primary)] hover:bg-[var(--brand-primary-hover)] rounded-lg min-h-[44px]"
        >
          <Plus className="w-4 h-4" />
          Apply for Leave
        </button>
      </div>

      {notice && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-xs text-emerald-900">
          {notice}
        </div>
      )}

      {/* 4 Leave Balance Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white border border-stone-200 rounded-xl p-4 space-y-1">
          <div className="text-xs text-slate-500">Annual Leave Entitlement ({leaveSummary.leaveYear})</div>
          <div className="text-2xl font-bold text-slate-900 font-mono tabular-nums">
            {leaveSummary.totalEntitlement} days
          </div>
          <div className="text-xs text-slate-500">
            {leaveSummary.baseEntitlement} base{leaveSummary.carryForwardDays > 0 ? ` + ${leaveSummary.carryForwardDays} carry-forward` : ' days per year'}
          </div>
        </div>

        <div className="bg-white border border-stone-200 rounded-xl p-4 space-y-1">
          <div className="text-xs text-slate-500">Approved Leave Days Used</div>
          <div className="text-2xl font-bold text-slate-900 font-mono tabular-nums">
            {leaveSummary.approvedDaysUsed} days
          </div>
          <div className="text-xs text-slate-500">Deducted after final HR approval</div>
        </div>

        <div className="bg-white border border-stone-200 rounded-xl p-4 space-y-1">
          <div className="text-xs text-slate-500">Leave Days Pending Approval</div>
          <div className="text-2xl font-bold text-amber-700 font-mono tabular-nums">
            {leaveSummary.pendingApprovalDays} days
          </div>
          <div className="text-xs text-slate-500">Not deducted until approved</div>
        </div>

        <div className="bg-white border border-stone-200 rounded-xl p-4 space-y-1">
          <div className="text-xs text-slate-500">Remaining Approved Leave Balance</div>
          <div className="text-2xl font-bold text-emerald-800 font-mono tabular-nums">
            {leaveSummary.remainingLeaveDays} days
          </div>
          <div className="text-xs text-slate-500">
            {leaveSummary.totalEntitlement} entitlement − {leaveSummary.approvedDaysUsed} approved
          </div>
        </div>
      </div>

      {/* Policy Info Strip */}
      <div className="bg-stone-50 border border-stone-200 rounded-xl p-4 flex items-start gap-3 text-xs text-slate-600">
        <Info className="w-4 h-4 text-emerald-800 shrink-0 mt-0.5" />
        <div className="space-y-1">
          <div className="font-semibold text-slate-800">
            Working-Day Calendar & Approval Workflow ({leaveSummary.leaveYear})
          </div>
          <p>
            Weekends (Saturday & Sunday) and {(leavePolicy.publicHolidays || []).length} HR-configured public holiday(s) are automatically excluded when counting leave days. Applications flow from Apprentice → Assigned Supervisor → HR Verification.
          </p>
        </div>
      </div>

      {/* Leave History Table */}
      <DataTable
        rows={myLeaves}
        columns={columns}
        rowKey={(r) => r.id}
        searchPlaceholder="Search leave applications by type, dates, or status..."
        searchFilter={(r, q) =>
          r.leaveType.toLowerCase().includes(q) ||
          r.startDate.toLowerCase().includes(q) ||
          r.status.toLowerCase().includes(q) ||
          (r.reason || '').toLowerCase().includes(q)
        }
        emptyTitle="No leave applications submitted"
        emptyDescription="Use the Apply for Leave button above to request annual or other leave."
      />

      {/* Leave Application Modal */}
      <Modal
        open={modalOpen}
        onClose={() => {
          setModalOpen(false);
          resetForm();
        }}
        title="Apply for Leave"
        subtitle={`Confirmed Remaining Annual Leave: ${leaveSummary.remainingLeaveDays} day(s) | Pending: ${leaveSummary.pendingApprovalDays} day(s)`}
        maxWidthClass="max-w-lg"
      >
        <form onSubmit={(e) => void handleSubmitLeave(e)} className="space-y-4">
          {/* Leave balance indicator bar */}
          <div className="p-3 bg-emerald-50/70 border border-emerald-200 rounded-lg space-y-1.5 text-xs">
            <div className="flex items-center justify-between font-medium text-emerald-950">
              <span>Annual Leave Balance Indicator</span>
              <span className="font-mono font-bold">
                {leaveSummary.remainingLeaveDays} / {leaveSummary.totalEntitlement} days remaining
              </span>
            </div>
            <div className="w-full h-2 bg-stone-200 rounded-full overflow-hidden">
              <div
                className="h-full bg-[var(--brand-primary)] transition-all"
                style={{
                  width: `${Math.min(
                    100,
                    Math.round((leaveSummary.remainingLeaveDays / Math.max(1, leaveSummary.totalEntitlement)) * 100)
                  )}%`,
                }}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Leave Type *</label>
              <select
                value={leaveType}
                onChange={(e) => setLeaveType(e.target.value as LeaveRequest['leaveType'])}
                className="w-full px-3 py-2 text-sm border border-stone-300 rounded-lg min-h-[42px]"
              >
                <option value="annual">Annual Leave (Primary)</option>
                <option value="sick">Sick Leave</option>
                <option value="compassionate">Compassionate Leave</option>
                <option value="study">Study Leave</option>
                <option value="maternity_paternity">Maternity / Paternity</option>
                <option value="unpaid">Unpaid Leave</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Emergency Contact (Where Applicable)
              </label>
              <input
                type="text"
                maxLength={200}
                value={emergencyContact}
                onChange={(e) => setEmergencyContact(e.target.value)}
                placeholder="Name & phone number"
                className="w-full px-3 py-2 text-sm border border-stone-300 rounded-lg min-h-[42px]"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Start Date *</label>
              <input
                type="date"
                required
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-stone-300 rounded-lg min-h-[42px]"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">End Date *</label>
              <input
                type="date"
                required
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-stone-300 rounded-lg min-h-[42px]"
              />
            </div>
          </div>

          {/* Calculated Working Days Display */}
          <div className="p-3 bg-stone-50 border border-stone-200 rounded-lg flex items-center justify-between gap-4 text-xs">
            <div className="flex items-center gap-2 text-slate-700">
              <CalendarDays className="w-4 h-4 text-emerald-800 shrink-0" />
              <div>
                <div className="font-medium text-slate-900">Working Days Requested</div>
                <div className="text-[11px] text-slate-500">
                  Excludes {workingBreakdown.weekendDays} weekend day(s) & {workingBreakdown.holidayDays} public holiday(s)
                </div>
              </div>
            </div>
            <div className="text-lg font-bold font-mono text-slate-900 tabular-nums shrink-0">
              {workingBreakdown.workingDays} d
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Reason for Leave & Handover Notes *</label>
            <textarea
              rows={3}
              required
              maxLength={1000}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Provide reason for leave and ministry responsibilities handover..."
              className="w-full px-3 py-2 text-sm border border-stone-300 rounded-lg"
            />
          </div>

          <div className="space-y-1.5">
            <label className="block text-xs font-medium text-slate-700">
              Supporting Document Upload (Optional — Medical / Exam Letter)
            </label>
            <label className="inline-flex items-center gap-2 px-3 py-2 text-xs font-medium text-slate-700 bg-stone-50 hover:bg-stone-100 border border-stone-300 rounded-lg cursor-pointer min-h-[40px]">
              <Upload className="w-3.5 h-3.5" />
              <span>{attachmentName || 'Attach PDF, JPG, or PNG'}</span>
              <input
                type="file"
                accept="application/pdf,image/jpeg,image/png"
                className="hidden"
                onChange={(e) => {
                  void handleAttachmentChange(e.target.files?.[0]);
                  e.currentTarget.value = '';
                }}
              />
            </label>
          </div>

          {formError && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">
              {formError}
            </div>
          )}

          <div className="flex justify-end gap-3 pt-2 border-t border-stone-100">
            <button
              type="button"
              onClick={() => {
                setModalOpen(false);
                resetForm();
              }}
              className="px-4 py-2 text-sm font-medium text-slate-700 border border-stone-300 rounded-lg min-h-[40px]"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 text-sm font-semibold text-white bg-[var(--brand-primary)] hover:bg-[var(--brand-primary-hover)] rounded-lg disabled:opacity-60 min-h-[40px]"
            >
              {saving ? 'Submitting...' : 'Submit Leave Application'}
            </button>
          </div>
        </form>
      </Modal>

      {previewDoc && (
        <AttachmentPreviewModal
          open={Boolean(previewDoc)}
          onClose={() => setPreviewDoc(null)}
          title={previewDoc.title}
          fileName={previewDoc.fileName}
          dataUrl={previewDoc.dataUrl}
        />
      )}
    </div>
  );
}
