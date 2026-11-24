import React, { useEffect, useMemo, useState } from 'react';
import { collection, doc, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';
import { Plus, Pencil, History, WifiOff, Eye, Download } from 'lucide-react';
import { ORG_ID, db } from '../../lib/firebase.ts';
import { OperationType, handleFirestoreError } from '../../lib/firestoreError.ts';
import { recordAuditLog, sendNotification } from '../../lib/audit.ts';
import { exportToPdf } from '../../lib/exports.ts';
import { enqueueOfflineItem } from '../../lib/offlineQueue.ts';
import { useAuth } from '../../context/AuthContext.tsx';
import { useData } from '../../context/DataContext.tsx';
import { DataTable, ColumnDef } from '../ui/DataTable.tsx';
import { Modal } from '../ui/Modal.tsx';
import { StatusText } from '../ui/StatusText.tsx';
import { Apprentice, ApprenticeReport, formatKes, formatNairobiDateTime } from '../../types/erp.ts';

interface ApprenticeReportsSectionProps {
  apprenticeRecord: Apprentice | null;
  autoOpenNew?: boolean;
  onConsumeAutoOpen?: () => void;
}

interface RevisionEntry {
  timestamp: string;
  actor: string;
  action: string;
  note?: string;
}

function parseRevisions(json?: string): RevisionEntry[] {
  if (!json) return [];
  try {
    const parsed = JSON.parse(json);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

const REPORT_TYPE_LABEL: Record<ApprenticeReport['reportType'], string> = {
  daily: 'Daily Activity Report',
  weekly: 'Weekly Report',
  monthly: 'Monthly Report',
  activity: 'Special Activity Report',
  reflection: 'Reflection Report',
};

export function ApprenticeReportsSection({
  apprenticeRecord,
  autoOpenNew,
  onConsumeAutoOpen,
}: ApprenticeReportsSectionProps) {
  const { profile } = useAuth();
  const { apprenticeReports, directory } = useData();

  const [statusFilter, setStatusFilter] = useState<'all' | ApprenticeReport['status']>('all');
  const [modalOpen, setModalOpen] = useState(false);
  const [editingReport, setEditingReport] = useState<ApprenticeReport | null>(null);
  const [viewingReport, setViewingReport] = useState<ApprenticeReport | null>(null);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [repFormError, setRepFormError] = useState<string | null>(null);

  // Current report submission form fields (exact fields preserved)
  const [repType, setRepType] = useState<ApprenticeReport['reportType']>('weekly');
  const [repStart, setRepStart] = useState(new Date().toISOString().slice(0, 10));
  const [repEnd, setRepEnd] = useState(new Date().toISOString().slice(0, 10));
  const [repMonthlyTarget, setRepMonthlyTarget] = useState('');
  const [repAmountRaised, setRepAmountRaised] = useState('');
  const [repDeficit, setRepDeficit] = useState('0');
  const [repCallsMade, setRepCallsMade] = useState('');
  const [repNewPartners, setRepNewPartners] = useState('');
  const [repTotalActivePartners, setRepTotalActivePartners] = useState('');
  const [repThingsWorked, setRepThingsWorked] = useState('');
  const [repThingsDidNotWork, setRepThingsDidNotWork] = useState('');
  const [repNextWeekTarget, setRepNextWeekTarget] = useState('');
  const [repNextWeekPartners, setRepNextWeekPartners] = useState('');
  const [repNextWeekCalls, setRepNextWeekCalls] = useState('');
  const [repNextWeekAppointments, setRepNextWeekAppointments] = useState('');
  const [repWorkProgress, setRepWorkProgress] = useState('');
  const [repPersonalDevotion, setRepPersonalDevotion] = useState('');
  const [repMentorship, setRepMentorship] = useState('');
  const [repStatus, setRepStatus] = useState<'draft' | 'submitted'>('submitted');

  const uid = profile?.uid || '';

  const myReports = useMemo(() => {
    const mine = apprenticeReports.filter((r) => r.apprenticeUserId === uid);
    return statusFilter === 'all' ? mine : mine.filter((r) => r.status === statusFilter);
  }, [apprenticeReports, uid, statusFilter]);

  const resetForm = () => {
    setEditingReport(null);
    setRepType('weekly');
    setRepStart(new Date().toISOString().slice(0, 10));
    setRepEnd(new Date().toISOString().slice(0, 10));
    setRepMonthlyTarget('');
    setRepAmountRaised('');
    setRepDeficit('0');
    setRepCallsMade('');
    setRepNewPartners('');
    setRepTotalActivePartners('');
    setRepThingsWorked('');
    setRepThingsDidNotWork('');
    setRepNextWeekTarget('');
    setRepNextWeekPartners('');
    setRepNextWeekCalls('');
    setRepNextWeekAppointments('');
    setRepWorkProgress('');
    setRepPersonalDevotion('');
    setRepMentorship('');
    setRepStatus('submitted');
    setRepFormError(null);
  };

  useEffect(() => {
    if (autoOpenNew) {
      resetForm();
      setModalOpen(true);
      onConsumeAutoOpen?.();
    }
  }, [autoOpenNew, onConsumeAutoOpen]);

  const openEditReport = (report: ApprenticeReport) => {
    setEditingReport(report);
    setRepType(report.reportType);
    setRepStart(report.periodStart);
    setRepEnd(report.periodEnd || report.periodStart);
    setRepMonthlyTarget(report.monthlyTargetKes !== undefined ? String(report.monthlyTargetKes) : '');
    setRepAmountRaised(report.amountRaisedKes !== undefined ? String(report.amountRaisedKes) : '');
    setRepDeficit(report.deficitKes !== undefined ? String(report.deficitKes) : '0');
    setRepCallsMade(report.callsMadeThisWeek !== undefined ? String(report.callsMadeThisWeek) : '');
    setRepNewPartners(report.newPartnersApproached !== undefined ? String(report.newPartnersApproached) : '');
    setRepTotalActivePartners(report.totalActivePartners !== undefined ? String(report.totalActivePartners) : '');
    setRepThingsWorked(report.thingsWorked || report.lessonsLearned || '');
    setRepThingsDidNotWork(report.thingsDidNotWork || report.challenges || '');
    setRepNextWeekTarget(report.nextWeekTargetAmountKes !== undefined ? String(report.nextWeekTargetAmountKes) : '');
    setRepNextWeekPartners(report.nextWeekPartnersToReachOut !== undefined ? String(report.nextWeekPartnersToReachOut) : '');
    setRepNextWeekCalls(report.nextWeekCallsToMake !== undefined ? String(report.nextWeekCallsToMake) : '');
    setRepNextWeekAppointments(report.nextWeekNewAppointments !== undefined ? String(report.nextWeekNewAppointments) : '');
    setRepWorkProgress(report.workProgress || report.activities || '');
    setRepPersonalDevotion(report.personalDevotion || '');
    setRepMentorship(report.mentorshipUpdate || '');
    setRepStatus('submitted');
    setRepFormError(null);
    setModalOpen(true);
  };

  const handleReportFinancialChange = (nextTarget: string, nextRaised: string) => {
    setRepMonthlyTarget(nextTarget);
    setRepAmountRaised(nextRaised);
    const targetNum = Number(nextTarget);
    const raisedNum = Number(nextRaised);
    if (Number.isFinite(targetNum) && Number.isFinite(raisedNum)) {
      setRepDeficit(String(Math.max(0, targetNum - raisedNum)));
    }
  };

  const handleSaveOrSubmit = async (e: React.FormEvent, queueOffline = false) => {
    e.preventDefault();
    if (!profile) return;
    setRepFormError(null);
    setNotice(null);

    if (!repStart || !repEnd || repEnd < repStart) {
      setRepFormError('Period End date must be on or after Period Start date.');
      return;
    }

    const monthlyTargetKes = Number(repMonthlyTarget);
    const amountRaisedKes = Number(repAmountRaised);
    const deficitKes = Number(repDeficit === '' ? Math.max(0, monthlyTargetKes - amountRaisedKes) : repDeficit);
    const callsMadeThisWeek = Number(repCallsMade);
    const newPartnersApproached = Number(repNewPartners);
    const totalActivePartners = Number(repTotalActivePartners);
    const nextWeekTargetAmountKes = Number(repNextWeekTarget);
    const nextWeekPartnersToReachOut = Number(repNextWeekPartners);
    const nextWeekCallsToMake = Number(repNextWeekCalls);
    const nextWeekNewAppointments = Number(repNextWeekAppointments);

    const worked = repThingsWorked.trim();
    const didNotWork = repThingsDidNotWork.trim();
    const workProgress = repWorkProgress.trim();
    const personalDevotion = repPersonalDevotion.trim();
    const mentorshipUpdate = repMentorship.trim();

    if (repMonthlyTarget === '' || !Number.isFinite(monthlyTargetKes) || monthlyTargetKes < 0) {
      setRepFormError('Monthly target (Ksh) must be a valid non-negative number.');
      return;
    }
    if (repAmountRaised === '' || !Number.isFinite(amountRaisedKes) || amountRaisedKes < 0) {
      setRepFormError('Amount raised so far since the first day of the month must be a valid non-negative number.');
      return;
    }
    if (!Number.isFinite(deficitKes) || deficitKes < 0) {
      setRepFormError('Deficit (Ksh) must be a valid non-negative number.');
      return;
    }
    if (repCallsMade === '' || !Number.isInteger(callsMadeThisWeek) || callsMadeThisWeek < 0 || callsMadeThisWeek > 100000) {
      setRepFormError('Number of calls made this week must be a whole number (0–100,000).');
      return;
    }
    if (repNewPartners === '' || !Number.isInteger(newPartnersApproached) || newPartnersApproached < 0 || newPartnersApproached > 100000) {
      setRepFormError('Number of new partners approached must be a whole number (0–100,000).');
      return;
    }
    if (repTotalActivePartners === '' || !Number.isInteger(totalActivePartners) || totalActivePartners < 0 || totalActivePartners > 1000000) {
      setRepFormError('Total number of active partners must be a whole number (0–1,000,000).');
      return;
    }
    if (worked.length < 3 || worked.length > 3000) {
      setRepFormError('Please enter three things that worked (3–3,000 characters).');
      return;
    }
    if (didNotWork.length < 3 || didNotWork.length > 3000) {
      setRepFormError('Please enter three things that did not work (3–3,000 characters).');
      return;
    }
    if (repNextWeekTarget === '' || !Number.isFinite(nextWeekTargetAmountKes) || nextWeekTargetAmountKes < 0) {
      setRepFormError("Next week's target amount must be a valid non-negative number.");
      return;
    }
    if (repNextWeekPartners === '' || !Number.isInteger(nextWeekPartnersToReachOut) || nextWeekPartnersToReachOut < 0) {
      setRepFormError('Number of partners to reach out to next week must be a whole number.');
      return;
    }
    if (repNextWeekCalls === '' || !Number.isInteger(nextWeekCallsToMake) || nextWeekCallsToMake < 0) {
      setRepFormError('Number of calls to make next week must be a whole number.');
      return;
    }
    if (repNextWeekAppointments === '' || !Number.isInteger(nextWeekNewAppointments) || nextWeekNewAppointments < 0) {
      setRepFormError('Number of new appointments to make next week must be a whole number.');
      return;
    }
    if (workProgress.length < 3 || workProgress.length > 3000) {
      setRepFormError('Please complete the Work Progress section (3–3,000 characters).');
      return;
    }
    if (personalDevotion.length < 3 || personalDevotion.length > 3000) {
      setRepFormError('Please complete the Personal Devotion section (3–3,000 characters).');
      return;
    }
    if (mentorshipUpdate.length < 3 || mentorshipUpdate.length > 3000) {
      setRepFormError('Please complete the Mentorship section (3–3,000 characters).');
      return;
    }

    const sup = directory.find((d) => d.role === 'apprentice_supervisor');
    const supervisorId = apprenticeRecord?.supervisorId || sup?.uid || profile.uid;
    const clientRequestId = editingReport?.clientRequestId || `rep_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const nowIso = new Date().toISOString();

    const activitiesSummary = [
      `Target: ${formatKes(monthlyTargetKes)} | Raised: ${formatKes(amountRaisedKes)} | Deficit: ${formatKes(deficitKes)}`,
      `Calls: ${callsMadeThisWeek} | New Partners: ${newPartnersApproached} | Active Partners: ${totalActivePartners}`,
      `Worked: ${worked}`,
    ]
      .join(' — ')
      .slice(0, 3000);

    const prevRevisions = parseRevisions(editingReport?.revisionHistoryJson);
    const nextRevisions: RevisionEntry[] = [
      ...prevRevisions,
      {
        timestamp: nowIso,
        actor: profile.displayName,
        action:
          repStatus === 'draft'
            ? editingReport
              ? 'Updated Draft'
              : 'Saved Draft'
            : editingReport?.status === 'returned'
              ? 'Revised & Resubmitted'
              : 'Submitted Report',
      },
    ].slice(-20);

    const commonFields = {
      reportType: repType,
      periodStart: repStart,
      periodEnd: repEnd,
      monthlyTargetKes,
      amountRaisedKes,
      deficitKes,
      callsMadeThisWeek,
      newPartnersApproached,
      totalActivePartners,
      thingsWorked: worked,
      thingsDidNotWork: didNotWork,
      nextWeekTargetAmountKes,
      nextWeekPartnersToReachOut,
      nextWeekCallsToMake,
      nextWeekNewAppointments,
      workProgress,
      personalDevotion,
      mentorshipUpdate,
      activities: activitiesSummary,
      lessonsLearned: worked.slice(0, 2000),
      challenges: didNotWork.slice(0, 2000),
      status: repStatus,
      submittedAt: repStatus === 'submitted' ? nowIso : editingReport?.submittedAt || '',
      revisionCount: (editingReport?.revisionCount ?? 0) + (editingReport ? 1 : 0),
      revisionHistoryJson: JSON.stringify(nextRevisions),
    };

    if (!editingReport && (queueOffline || !navigator.onLine)) {
      enqueueOfflineItem({
        clientRequestId,
        type: 'apprentice_report',
        userId: profile.uid,
        userName: profile.displayName,
        userRole: profile.role,
        payload: {
          orgId: ORG_ID,
          apprenticeId: apprenticeRecord?.id || profile.uid,
          apprenticeUserId: profile.uid,
          apprenticeName: apprenticeRecord?.fullName || profile.displayName,
          supervisorId,
          ...commonFields,
          clientRequestId,
          isDemo: false,
        },
      });
      setModalOpen(false);
      resetForm();
      setNotice('Device offline or queued: Report saved to Offline Sync Queue for automatic synchronisation.');
      return;
    }

    setSaving(true);
    try {
      if (editingReport) {
        await updateDoc(doc(db, 'apprenticeReports', editingReport.id), {
          ...commonFields,
          updatedAt: serverTimestamp(),
        });
        await recordAuditLog({
          actorUid: profile.uid,
          actorName: profile.displayName,
          actorRole: profile.role,
          action: repStatus === 'draft' ? 'UPDATE_APPRENTICE_DRAFT' : 'SUBMIT_APPRENTICE_REPORT',
          targetCollection: 'apprenticeReports',
          targetId: editingReport.id,
          summary: `${repStatus === 'draft' ? 'Updated draft' : 'Submitted'} ${repType} report (${repStart} to ${repEnd})`,
        });
        if (repStatus === 'submitted' && supervisorId && supervisorId !== profile.uid && !supervisorId.startsWith('demo_')) {
          await sendNotification({
            recipientUid: supervisorId,
            title: `Apprentice Report Submitted`,
            message: `${profile.displayName} submitted a ${REPORT_TYPE_LABEL[repType]} (${repStart} to ${repEnd}).`,
            category: 'report',
            linkModule: 'apprenticeship',
          });
        }
        setNotice(repStatus === 'draft' ? 'Draft updated.' : 'Report submitted for supervisor review.');
      } else {
        const ref = doc(collection(db, 'apprenticeReports'));
        await setDoc(ref, {
          orgId: ORG_ID,
          apprenticeId: apprenticeRecord?.id || profile.uid,
          apprenticeUserId: profile.uid,
          apprenticeName: apprenticeRecord?.fullName || profile.displayName,
          supervisorId,
          ...commonFields,
          clientRequestId,
          isDemo: false,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        await recordAuditLog({
          actorUid: profile.uid,
          actorName: profile.displayName,
          actorRole: profile.role,
          action: repStatus === 'draft' ? 'SAVE_APPRENTICE_DRAFT' : 'SUBMIT_APPRENTICE_REPORT',
          targetCollection: 'apprenticeReports',
          targetId: ref.id,
          summary: `${repStatus === 'draft' ? 'Saved draft' : 'Submitted'} ${repType} report (${repStart} to ${repEnd})`,
        });
        if (repStatus === 'submitted' && supervisorId && supervisorId !== profile.uid && !supervisorId.startsWith('demo_')) {
          await sendNotification({
            recipientUid: supervisorId,
            title: `Apprentice Report Submitted`,
            message: `${profile.displayName} submitted a ${REPORT_TYPE_LABEL[repType]} (${repStart} to ${repEnd}).`,
            category: 'report',
            linkModule: 'apprenticeship',
          });
        }
        setNotice(repStatus === 'draft' ? 'Report draft saved.' : 'Report submitted for supervisor review.');
      }

      setModalOpen(false);
      resetForm();
    } catch (err) {
      try {
        handleFirestoreError(err, editingReport ? OperationType.UPDATE : OperationType.CREATE, 'apprenticeReports');
      } catch (e2) {
        setRepFormError(e2 instanceof Error ? e2.message : 'Unable to save report.');
      }
    } finally {
      setSaving(false);
    }
  };

  const handleDownloadReportPdf = (report: ApprenticeReport) => {
    const title = `${REPORT_TYPE_LABEL[report.reportType] || report.reportType} — ${report.apprenticeName}`;
    const subtitle = `Period: ${report.periodStart} to ${report.periodEnd || report.periodStart} | Status: ${report.status.toUpperCase()}`;
    const columns = [
      { header: 'Section / Metric', key: 'section' },
      { header: 'Details', key: 'content' },
    ];
    const rows = [
      { section: 'Apprentice Name', content: report.apprenticeName },
      { section: 'Report Type', content: REPORT_TYPE_LABEL[report.reportType] || report.reportType },
      { section: 'Period Start', content: report.periodStart },
      { section: 'Period End', content: report.periodEnd || report.periodStart },
      { section: 'Status', content: report.status.toUpperCase() },
      { section: 'Monthly Target (KES)', content: report.monthlyTargetKes !== undefined ? formatKes(report.monthlyTargetKes) : '—' },
      { section: 'Amount Raised (KES)', content: report.amountRaisedKes !== undefined ? formatKes(report.amountRaisedKes) : '—' },
      { section: 'Deficit (KES)', content: report.deficitKes !== undefined ? formatKes(report.deficitKes) : '—' },
      { section: 'Calls Made This Week', content: String(report.callsMadeThisWeek ?? 0) },
      { section: 'New Partners Approached', content: String(report.newPartnersApproached ?? 0) },
      { section: 'Total Active Partners', content: String(report.totalActivePartners ?? 0) },
      { section: 'Three Things That Worked', content: report.thingsWorked || report.lessonsLearned || '—' },
      { section: 'Three Things That Did Not Work', content: report.thingsDidNotWork || report.challenges || '—' },
      { section: "Next Week's Target (KES)", content: report.nextWeekTargetAmountKes !== undefined ? formatKes(report.nextWeekTargetAmountKes) : '—' },
      { section: 'Partners to Reach Out To Next Week', content: String(report.nextWeekPartnersToReachOut ?? 0) },
      { section: 'Calls to Make Next Week', content: String(report.nextWeekCallsToMake ?? 0) },
      { section: 'New Appointments Next Week', content: String(report.nextWeekNewAppointments ?? 0) },
      { section: 'Work Progress', content: report.workProgress || report.activities || '—' },
      { section: 'Personal Devotion', content: report.personalDevotion || '—' },
      { section: 'Mentorship', content: report.mentorshipUpdate || '—' },
      { section: 'Supervisor Feedback', content: report.supervisorComment || 'Awaiting supervisor feedback' },
      { section: 'Evaluation Score', content: report.evaluationScore ? `${report.evaluationScore}/5` : '—' },
    ];

    exportToPdf({
      fileName: `apprentice-report-${report.reportType}-${report.periodStart}`,
      title,
      subtitle,
      columns,
      rows,
      orientation: 'portrait',
    });
  };

  const columns: ColumnDef<ApprenticeReport>[] = [
    {
      key: 'period',
      header: 'Report & Period',
      sortable: true,
      sortValue: (r) => r.periodStart,
      render: (r) => (
        <div>
          <div className="font-medium text-slate-900">{REPORT_TYPE_LABEL[r.reportType] || r.reportType}</div>
          <div className="font-mono text-xs text-slate-500">
            {r.periodStart} {r.periodEnd ? `→ ${r.periodEnd}` : ''}
          </div>
          {r.submittedAt && (
            <div className="text-[11px] text-slate-400">Submitted {formatNairobiDateTime(r.submittedAt)}</div>
          )}
        </div>
      ),
    },
    {
      key: 'summary',
      header: 'Ministry & Fundraising Summary',
      render: (r) => (
        <div className="space-y-1 max-w-md text-xs">
          <p className="text-slate-800 line-clamp-2">{r.workProgress || r.activities}</p>
          {typeof r.monthlyTargetKes === 'number' && (
            <div className="font-mono text-[11px] text-slate-500 tabular-nums">
              Raised {formatKes(r.amountRaisedKes ?? 0)} / {formatKes(r.monthlyTargetKes)} · Calls: {r.callsMadeThisWeek ?? 0}
            </div>
          )}
        </div>
      ),
    },
    {
      key: 'feedback',
      header: 'Supervisor Feedback',
      render: (r) => (
        <div className="text-xs space-y-0.5 max-w-xs">
          <div className="text-slate-700 line-clamp-2">{r.supervisorComment || 'Awaiting supervisor feedback'}</div>
          {r.evaluationScore && (
            <div className="font-mono text-[11px] text-emerald-800 font-semibold">Score: {r.evaluationScore}/5</div>
          )}
        </div>
      ),
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
      header: 'Actions',
      align: 'right',
      render: (r) => (
        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={() => handleDownloadReportPdf(r)}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-slate-700 bg-white border border-stone-300 rounded-lg hover:bg-stone-50"
            title="Download formatted PDF report"
          >
            <Download className="w-3.5 h-3.5" />
            PDF
          </button>
          <button
            type="button"
            onClick={() => setViewingReport(r)}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-slate-700 bg-white border border-stone-300 rounded-lg hover:bg-stone-50"
          >
            <Eye className="w-3.5 h-3.5" />
            View
          </button>
          {(r.status === 'draft' || r.status === 'returned') && (
            <button
              type="button"
              onClick={() => openEditReport(r)}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-white bg-[var(--brand-primary)] hover:bg-[var(--brand-primary-hover)] rounded-lg"
            >
              <Pencil className="w-3.5 h-3.5" />
              {r.status === 'returned' ? 'Revise' : 'Edit Draft'}
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
          <h1 className="text-2xl font-bold text-slate-900 font-display">My Reports</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Submit Daily, Weekly, Monthly, or Special Activity reports, manage drafts, and review supervisor feedback
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
          New Apprentice Report
        </button>
      </div>

      {notice && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-xs text-emerald-900">
          {notice}
        </div>
      )}

      {/* Status Filter Tabs */}
      <div className="flex items-center gap-1 p-1 bg-stone-200/70 rounded-lg w-fit overflow-x-auto max-w-full">
        {(
          [
            { key: 'all', label: 'All Reports' },
            { key: 'draft', label: 'Drafts' },
            { key: 'submitted', label: 'Submitted' },
            { key: 'under_review', label: 'Under Review' },
            { key: 'approved', label: 'Approved' },
            { key: 'returned', label: 'Returned for Revision' },
          ] as { key: 'all' | ApprenticeReport['status']; label: string }[]
        ).map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setStatusFilter(t.key)}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
              statusFilter === t.key ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <DataTable
        rows={myReports}
        columns={columns}
        rowKey={(r) => r.id}
        searchPlaceholder="Search reports by type, period, or progress..."
        searchFilter={(r, q) =>
          r.reportType.toLowerCase().includes(q) ||
          r.periodStart.toLowerCase().includes(q) ||
          (r.workProgress || '').toLowerCase().includes(q) ||
          r.activities.toLowerCase().includes(q)
        }
        emptyTitle="No reports found"
        emptyDescription="Use the New Apprentice Report button to save a draft or submit your report."
      />

      {/* Submit / Edit Report Modal (Full Current Form) */}
      <Modal
        open={modalOpen}
        onClose={() => {
          setModalOpen(false);
          resetForm();
        }}
        title={
          editingReport
            ? editingReport.status === 'returned'
              ? 'Revise & Resubmit Apprentice Report'
              : 'Edit Draft Report'
            : 'Submit Apprentice Report'
        }
        subtitle="Complete partnership metrics, reflections, weekly targets, and ministry updates"
        maxWidthClass="max-w-3xl"
      >
        <form onSubmit={(e) => void handleSaveOrSubmit(e, false)} className="space-y-5">
          {editingReport?.status === 'returned' && editingReport.supervisorComment && (
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-900 space-y-1">
              <div className="font-semibold">Supervisor Feedback ({editingReport.reviewedBy || 'Supervisor'}):</div>
              <p>{editingReport.supervisorComment}</p>
            </div>
          )}

          {/* Row 1: Report type, Period start, Period end */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Report type *</label>
              <select
                value={repType}
                onChange={(e) => setRepType(e.target.value as ApprenticeReport['reportType'])}
                className="w-full px-3 py-2 text-sm border border-stone-300 rounded-lg min-h-[42px]"
              >
                <option value="daily">Daily Activity Report</option>
                <option value="weekly">Weekly Report</option>
                <option value="monthly">Monthly Report</option>
                <option value="activity">Special Activity Report</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Period start *</label>
              <input
                type="date"
                required
                value={repStart}
                onChange={(e) => setRepStart(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-stone-300 rounded-lg min-h-[42px]"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Period end *</label>
              <input
                type="date"
                required
                value={repEnd}
                onChange={(e) => setRepEnd(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-stone-300 rounded-lg min-h-[42px]"
              />
            </div>
          </div>

          {/* Row 2: Monthly Target, Amount Raised, Deficit */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Monthly target (Ksh) *</label>
              <input
                type="number"
                min="0"
                step="0.01"
                required
                value={repMonthlyTarget}
                onChange={(e) => handleReportFinancialChange(e.target.value, repAmountRaised)}
                placeholder="e.g. 50000"
                className="w-full px-3 py-2 text-sm font-mono border border-stone-300 rounded-lg min-h-[42px]"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Amount raised so far since first day of month (Ksh) *
              </label>
              <input
                type="number"
                min="0"
                step="0.01"
                required
                value={repAmountRaised}
                onChange={(e) => handleReportFinancialChange(repMonthlyTarget, e.target.value)}
                placeholder="e.g. 32000"
                className="w-full px-3 py-2 text-sm font-mono border border-stone-300 rounded-lg min-h-[42px]"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Deficit (Ksh) *</label>
              <input
                type="number"
                min="0"
                step="0.01"
                required
                value={repDeficit}
                onChange={(e) => setRepDeficit(e.target.value)}
                placeholder="0"
                className="w-full px-3 py-2 text-sm font-mono border border-stone-300 rounded-lg bg-stone-50 min-h-[42px]"
              />
            </div>
          </div>

          {/* Row 3: Calls, New Partners, Total Active Partners */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Number of calls made this week *</label>
              <input
                type="number"
                min="0"
                step="1"
                required
                value={repCallsMade}
                onChange={(e) => setRepCallsMade(e.target.value)}
                placeholder="e.g. 18"
                className="w-full px-3 py-2 text-sm font-mono border border-stone-300 rounded-lg min-h-[42px]"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Number of new partners approached this week *
              </label>
              <input
                type="number"
                min="0"
                step="1"
                required
                value={repNewPartners}
                onChange={(e) => setRepNewPartners(e.target.value)}
                placeholder="e.g. 6"
                className="w-full px-3 py-2 text-sm font-mono border border-stone-300 rounded-lg min-h-[42px]"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Total number of active partners *</label>
              <input
                type="number"
                min="0"
                step="1"
                required
                value={repTotalActivePartners}
                onChange={(e) => setRepTotalActivePartners(e.target.value)}
                placeholder="e.g. 42"
                className="w-full px-3 py-2 text-sm font-mono border border-stone-300 rounded-lg min-h-[42px]"
              />
            </div>
          </div>

          {/* Paragraph inputs: 3 things worked & 3 things did not work */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Three things that worked this week *
              </label>
              <textarea
                rows={3}
                required
                maxLength={3000}
                value={repThingsWorked}
                onChange={(e) => setRepThingsWorked(e.target.value)}
                placeholder="1. ...&#10;2. ...&#10;3. ..."
                className="w-full px-3 py-2 text-sm border border-stone-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Three things that did not work this week *
              </label>
              <textarea
                rows={3}
                required
                maxLength={3000}
                value={repThingsDidNotWork}
                onChange={(e) => setRepThingsDidNotWork(e.target.value)}
                placeholder="1. ...&#10;2. ...&#10;3. ..."
                className="w-full px-3 py-2 text-sm border border-stone-300 rounded-lg"
              />
            </div>
          </div>

          {/* 5-Column Next Week Planning Table */}
          <div className="space-y-1.5">
            <div className="text-xs font-semibold text-slate-800">Next Week Targets & Outreach Plan</div>
            <div className="overflow-x-auto border border-stone-200 rounded-lg">
              <table className="w-full text-left border-collapse text-xs min-w-[640px]">
                <thead>
                  <tr className="bg-stone-50 border-b border-stone-200 text-slate-600 font-semibold">
                    <th className="px-3 py-2">Planning Horizon</th>
                    <th className="px-3 py-2">Next week&apos;s target amount (Ksh)</th>
                    <th className="px-3 py-2">Number of partners to reach out to</th>
                    <th className="px-3 py-2">Number of calls to make next week</th>
                    <th className="px-3 py-2">Number of new appointments to make next week</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="bg-white">
                    <td className="px-3 py-2.5 font-medium text-slate-700 whitespace-nowrap">Next Week Plan</td>
                    <td className="px-2 py-2">
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        required
                        value={repNextWeekTarget}
                        onChange={(e) => setRepNextWeekTarget(e.target.value)}
                        placeholder="0"
                        className="w-full px-2.5 py-1.5 text-xs font-mono border border-stone-300 rounded-md"
                      />
                    </td>
                    <td className="px-2 py-2">
                      <input
                        type="number"
                        min="0"
                        step="1"
                        required
                        value={repNextWeekPartners}
                        onChange={(e) => setRepNextWeekPartners(e.target.value)}
                        placeholder="0"
                        className="w-full px-2.5 py-1.5 text-xs font-mono border border-stone-300 rounded-md"
                      />
                    </td>
                    <td className="px-2 py-2">
                      <input
                        type="number"
                        min="0"
                        step="1"
                        required
                        value={repNextWeekCalls}
                        onChange={(e) => setRepNextWeekCalls(e.target.value)}
                        placeholder="0"
                        className="w-full px-2.5 py-1.5 text-xs font-mono border border-stone-300 rounded-md"
                      />
                    </td>
                    <td className="px-2 py-2">
                      <input
                        type="number"
                        min="0"
                        step="1"
                        required
                        value={repNextWeekAppointments}
                        onChange={(e) => setRepNextWeekAppointments(e.target.value)}
                        placeholder="0"
                        className="w-full px-2.5 py-1.5 text-xs font-mono border border-stone-300 rounded-md"
                      />
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* Paragraph inputs: Work Progress, Personal Devotion, Mentorship */}
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Work progress *</label>
              <textarea
                rows={3}
                required
                maxLength={3000}
                value={repWorkProgress}
                onChange={(e) => setRepWorkProgress(e.target.value)}
                placeholder="any challenges,any praises,anything I should help with"
                className="w-full px-3 py-2 text-sm border border-stone-300 rounded-lg"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Personal devotion *</label>
                <textarea
                  rows={3}
                  required
                  maxLength={3000}
                  value={repPersonalDevotion}
                  onChange={(e) => setRepPersonalDevotion(e.target.value)}
                  placeholder="any highlight from what you are reading"
                  className="w-full px-3 py-2 text-sm border border-stone-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Mentorship *</label>
                <textarea
                  rows={3}
                  required
                  maxLength={3000}
                  value={repMentorship}
                  onChange={(e) => setRepMentorship(e.target.value)}
                  placeholder="how is your mentorship going?"
                  className="w-full px-3 py-2 text-sm border border-stone-300 rounded-lg"
                />
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-stone-100">
            <div className="flex items-center gap-3 text-xs">
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input
                  type="radio"
                  checked={repStatus === 'submitted'}
                  onChange={() => setRepStatus('submitted')}
                />
                Submit to Supervisor
              </label>
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input
                  type="radio"
                  checked={repStatus === 'draft'}
                  onChange={() => setRepStatus('draft')}
                />
                Save as Draft
              </label>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {!editingReport && (
                <button
                  type="button"
                  onClick={(e) => void handleSaveOrSubmit(e as unknown as React.FormEvent, true)}
                  className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-amber-800 bg-amber-50 border border-amber-200 rounded-lg hover:bg-amber-100 min-h-[40px]"
                >
                  <WifiOff className="w-3.5 h-3.5" />
                  Save Offline
                </button>
              )}
              <button
                type="submit"
                disabled={saving}
                className="px-4 py-2 text-sm font-semibold text-white bg-[var(--brand-primary)] hover:bg-[var(--brand-primary-hover)] rounded-lg disabled:opacity-60 min-h-[40px]"
              >
                {saving
                  ? 'Saving...'
                  : repStatus === 'draft'
                    ? 'Save Draft'
                    : editingReport?.status === 'returned'
                      ? 'Resubmit Report'
                      : 'Submit Report'}
              </button>
            </div>
          </div>

          {repFormError && <p className="text-xs text-red-700">{repFormError}</p>}
        </form>
      </Modal>

      {/* Report Detail & Revision History Modal */}
      <Modal
        open={Boolean(viewingReport)}
        onClose={() => setViewingReport(null)}
        title={viewingReport ? REPORT_TYPE_LABEL[viewingReport.reportType] : 'Report Detail'}
        subtitle={viewingReport ? `${viewingReport.periodStart} to ${viewingReport.periodEnd || viewingReport.periodStart}` : ''}
        maxWidthClass="max-w-2xl"
      >
        {viewingReport && (
          <div className="space-y-4 text-xs">
            <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-stone-200">
              <StatusText status={viewingReport.status} />
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => handleDownloadReportPdf(viewingReport)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-[var(--brand-primary)] hover:bg-[var(--brand-primary-hover)] rounded-lg shadow-sm"
                >
                  <Download className="w-3.5 h-3.5" />
                  Download PDF Report
                </button>
                <div className="text-slate-500">
                  {viewingReport.submittedAt
                    ? `Submitted ${formatNairobiDateTime(viewingReport.submittedAt)}`
                    : 'Saved as draft'}
                </div>
              </div>
            </div>

            {typeof viewingReport.monthlyTargetKes === 'number' && (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 bg-stone-50 border border-stone-200 rounded-lg p-3">
                <div>
                  <div className="text-slate-400">Monthly Target</div>
                  <div className="font-mono font-semibold text-slate-900">{formatKes(viewingReport.monthlyTargetKes)}</div>
                </div>
                <div>
                  <div className="text-slate-400">Amount Raised</div>
                  <div className="font-mono font-semibold text-emerald-800">{formatKes(viewingReport.amountRaisedKes ?? 0)}</div>
                </div>
                <div>
                  <div className="text-slate-400">Deficit</div>
                  <div className="font-mono font-semibold text-amber-700">{formatKes(viewingReport.deficitKes ?? 0)}</div>
                </div>
                <div>
                  <div className="text-slate-400">Calls Made</div>
                  <div className="font-mono font-semibold text-slate-900">{viewingReport.callsMadeThisWeek ?? 0}</div>
                </div>
                <div>
                  <div className="text-slate-400">New Partners</div>
                  <div className="font-mono font-semibold text-slate-900">{viewingReport.newPartnersApproached ?? 0}</div>
                </div>
                <div>
                  <div className="text-slate-400">Active Partners</div>
                  <div className="font-mono font-semibold text-slate-900">{viewingReport.totalActivePartners ?? 0}</div>
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="p-3 border border-stone-200 rounded-lg space-y-1">
                <div className="font-semibold text-slate-800">What Worked</div>
                <p className="text-slate-600 whitespace-pre-wrap">{viewingReport.thingsWorked || viewingReport.lessonsLearned || '—'}</p>
              </div>
              <div className="p-3 border border-stone-200 rounded-lg space-y-1">
                <div className="font-semibold text-slate-800">What Did Not Work</div>
                <p className="text-slate-600 whitespace-pre-wrap">{viewingReport.thingsDidNotWork || viewingReport.challenges || '—'}</p>
              </div>
            </div>

            <div className="space-y-2">
              <div className="p-3 border border-stone-200 rounded-lg space-y-1">
                <div className="font-semibold text-slate-800">Work Progress</div>
                <p className="text-slate-600 whitespace-pre-wrap">{viewingReport.workProgress || viewingReport.activities}</p>
              </div>
              {viewingReport.personalDevotion && (
                <div className="p-3 border border-stone-200 rounded-lg space-y-1">
                  <div className="font-semibold text-slate-800">Personal Devotion</div>
                  <p className="text-slate-600 whitespace-pre-wrap">{viewingReport.personalDevotion}</p>
                </div>
              )}
              {viewingReport.mentorshipUpdate && (
                <div className="p-3 border border-stone-200 rounded-lg space-y-1">
                  <div className="font-semibold text-slate-800">Mentorship</div>
                  <p className="text-slate-600 whitespace-pre-wrap">{viewingReport.mentorshipUpdate}</p>
                </div>
              )}
            </div>

            {viewingReport.supervisorComment && (
              <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg space-y-1">
                <div className="font-semibold text-emerald-950">
                  Supervisor Feedback {viewingReport.reviewedBy ? `(${viewingReport.reviewedBy})` : ''}{' '}
                  {viewingReport.evaluationScore ? `· Score ${viewingReport.evaluationScore}/5` : ''}
                </div>
                <p className="text-emerald-900 whitespace-pre-wrap">{viewingReport.supervisorComment}</p>
              </div>
            )}

            {parseRevisions(viewingReport.revisionHistoryJson).length > 0 && (
              <div className="space-y-1.5 pt-2 border-t border-stone-200">
                <div className="flex items-center gap-1.5 font-semibold text-slate-800">
                  <History className="w-3.5 h-3.5" />
                  Submission & Revision History
                </div>
                <div className="divide-y divide-stone-100 border border-stone-200 rounded-lg">
                  {parseRevisions(viewingReport.revisionHistoryJson).map((rev, idx) => (
                    <div key={idx} className="px-3 py-2 flex items-center justify-between gap-2">
                      <div>
                        <span className="font-medium text-slate-900">{rev.action}</span>{' '}
                        <span className="text-slate-500">by {rev.actor}</span>
                        {rev.note && <div className="text-slate-500">{rev.note}</div>}
                      </div>
                      <span className="font-mono text-[11px] text-slate-400 shrink-0">
                        {formatNairobiDateTime(rev.timestamp)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}
