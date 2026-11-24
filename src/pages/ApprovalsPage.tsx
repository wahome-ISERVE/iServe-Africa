import { useMemo, useState } from 'react';
import { doc, serverTimestamp, updateDoc } from 'firebase/firestore';
import { Check, RotateCcw, XCircle, ShieldAlert } from 'lucide-react';
import { db } from '../lib/firebase.ts';
import { OperationType, handleFirestoreError } from '../lib/firestoreError.ts';
import { recordAuditLog, sendNotification } from '../lib/audit.ts';
import { useAuth } from '../context/AuthContext.tsx';
import { useData } from '../context/DataContext.tsx';
import { Modal } from '../components/ui/Modal.tsx';
import { StatusText } from '../components/ui/StatusText.tsx';
import { formatKes, formatNairobiDateTime } from '../types/erp.ts';

type QueueTab = 'all' | 'finance' | 'leave' | 'apprentice' | 'procurement';

interface UnifiedApprovalItem {
  id: string;
  collectionName: 'financeTransactions' | 'leaveRequests' | 'apprenticeReports' | 'procurementRequests';
  category: Exclude<QueueTab, 'all'>;
  refNo: string;
  title: string;
  requesterUid: string;
  requesterName: string;
  amountOrDetail: string;
  status: string;
  createdAt: unknown;
}

export function ApprovalsPage() {
  const { profile } = useAuth();
  const { financeTransactions, leaveRequests, apprenticeReports, procurementRequests } = useData();

  const [tab, setTab] = useState<QueueTab>('all');
  const [selected, setSelected] = useState<UnifiedApprovalItem | null>(null);
  const [decision, setDecision] = useState<'approved' | 'returned' | 'rejected'>('approved');
  const [comment, setComment] = useState('');
  const [score, setScore] = useState<number>(4);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const items = useMemo<UnifiedApprovalItem[]>(() => {
    const list: UnifiedApprovalItem[] = [];

    financeTransactions
      .filter((t) => ['submitted', 'pending_approval', 'approved'].includes(t.status))
      .forEach((t) => {
        list.push({
          id: t.id,
          collectionName: 'financeTransactions',
          category: 'finance',
          refNo: t.txNumber,
          title: t.title,
          requesterUid: t.requestedBy,
          requesterName: t.requestedByName || 'Staff',
          amountOrDetail: `${t.txType.replace(/_/g, ' ')} · ${formatKes(t.amountKes)}`,
          status: t.status,
          createdAt: t.createdAt,
        });
      });

    leaveRequests
      .filter((l) => ['submitted', 'pending_hr'].includes(l.status))
      .forEach((l) => {
        list.push({
          id: l.id,
          collectionName: 'leaveRequests',
          category: 'leave',
          refNo: l.leaveType.toUpperCase(),
          title: `${l.employeeName} — ${l.daysRequested} day(s) ${l.leaveType} leave`,
          requesterUid: l.userId,
          requesterName: l.employeeName,
          amountOrDetail: `${l.startDate} to ${l.endDate}`,
          status: l.status,
          createdAt: l.createdAt,
        });
      });

    apprenticeReports
      .filter((r) => r.status === 'submitted')
      .forEach((r) => {
        list.push({
          id: r.id,
          collectionName: 'apprenticeReports',
          category: 'apprentice',
          refNo: r.reportType.toUpperCase(),
          title: `${r.apprenticeName} — ${r.reportType} report`,
          requesterUid: r.apprenticeUserId,
          requesterName: r.apprenticeName,
          amountOrDetail: `Period starting ${r.periodStart}`,
          status: r.status,
          createdAt: r.createdAt,
        });
      });

    procurementRequests
      .filter((p) => p.status === 'submitted')
      .forEach((p) => {
        list.push({
          id: p.id,
          collectionName: 'procurementRequests',
          category: 'procurement',
          refNo: p.reqNo,
          title: p.title,
          requesterUid: p.requestedBy,
          requesterName: p.requestedByName || 'Staff',
          amountOrDetail: formatKes(p.estimatedKes),
          status: p.status,
          createdAt: p.createdAt,
        });
      });

    return list.filter((item) => tab === 'all' || item.category === tab);
  }, [financeTransactions, leaveRequests, apprenticeReports, procurementRequests, tab]);

  const handleDecision = async () => {
    if (!selected || !profile) return;
    setErrorMsg(null);

    // Separation of duties check (except super_admin testing/override explicitly blocked for non-admins on DB rules)
    if (selected.requesterUid === profile.uid && profile.role !== 'super_admin') {
      setErrorMsg('Separation of duties: you cannot approve or review your own submission.');
      return;
    }

    setSubmitting(true);
    try {
      const ref = doc(db, selected.collectionName, selected.id);
      if (selected.collectionName === 'financeTransactions') {
        const nextStatus = decision === 'approved' && selected.status === 'approved' ? 'paid' : decision;
        await updateDoc(ref, {
          status: nextStatus,
          approverId: profile.uid,
          approverName: profile.displayName,
          approvalComment: comment.trim() || `${nextStatus} by ${profile.displayName}`,
          updatedAt: serverTimestamp(),
        });
      } else if (selected.collectionName === 'leaveRequests') {
        await updateDoc(ref, {
          status: decision,
          approverId: profile.uid,
          approverComment: comment.trim() || `${decision} by ${profile.displayName}`,
          updatedAt: serverTimestamp(),
        });
      } else if (selected.collectionName === 'apprenticeReports') {
        const repStatus = decision === 'rejected' ? 'returned' : decision;
        await updateDoc(ref, {
          status: repStatus,
          supervisorComment: comment.trim() || 'Reviewed.',
          evaluationScore: score,
          updatedAt: serverTimestamp(),
        });
      } else if (selected.collectionName === 'procurementRequests') {
        await updateDoc(ref, {
          status: decision === 'returned' ? 'draft' : decision,
          approverId: profile.uid,
          approvalComment: comment.trim() || `${decision} by ${profile.displayName}`,
          updatedAt: serverTimestamp(),
        });
      }

      await recordAuditLog({
        actorUid: profile.uid,
        actorName: profile.displayName,
        actorRole: profile.role,
        action: `WORKFLOW_${decision.toUpperCase()}`,
        targetCollection: selected.collectionName,
        targetId: selected.id,
        summary: `${decision.toUpperCase()} ${selected.refNo}: ${selected.title}`,
      });

      if (selected.requesterUid && !selected.requesterUid.startsWith('demo_')) {
        await sendNotification({
          recipientUid: selected.requesterUid,
          title: `Request ${decision}: ${selected.refNo}`,
          message: `${profile.displayName} marked "${selected.title}" as ${decision}. ${comment ? `Note: ${comment}` : ''}`,
          category: 'approval',
          linkModule: selected.category === 'apprentice' ? 'apprenticeship' : selected.category,
        });
      }

      setSelected(null);
      setComment('');
    } catch (err) {
      try {
        handleFirestoreError(err, OperationType.UPDATE, `${selected.collectionName}/${selected.id}`);
      } catch (e) {
        setErrorMsg(e instanceof Error ? e.message : 'Unable to process approval.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 font-display">Approval Workflow Engine</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Multi-stage organisational approvals with separation of duties and audit trails
          </p>
        </div>

        <div className="flex items-center gap-1 p-1 bg-stone-200/70 rounded-lg overflow-x-auto">
          {(['all', 'finance', 'leave', 'apprentice', 'procurement'] as QueueTab[]).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap capitalize ${
                tab === t ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {t === 'apprentice' ? 'Apprentice Reports' : t}
            </button>
          ))}
        </div>
      </div>

      <div className="bg-white border border-stone-200 rounded-xl overflow-hidden">
        {items.length === 0 ? (
          <div className="p-12 text-center space-y-1.5">
            <p className="text-sm font-medium text-slate-900">Approval queue is clear</p>
            <p className="text-xs text-slate-500">
              All submitted payments, leave requests, requisitions, and apprentice reports have been actioned.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-stone-100">
            {items.map((item) => {
              const isSelf = item.requesterUid === profile?.uid && profile?.role !== 'super_admin';
              return (
                <div
                  key={`${item.collectionName}-${item.id}`}
                  className="p-4 sm:px-6 flex flex-wrap items-center justify-between gap-4 hover:bg-stone-50/70 transition-colors"
                >
                  <div className="space-y-1 min-w-0">
                    <div className="flex items-center gap-2 text-xs text-slate-500">
                      <span className="font-mono font-semibold text-slate-800">{item.refNo}</span>
                      <span aria-hidden="true">·</span>
                      <span className="capitalize">{item.category}</span>
                      <span aria-hidden="true">·</span>
                      <StatusText status={item.status} />
                    </div>
                    <div className="text-sm font-semibold text-slate-900">{item.title}</div>
                    <div className="text-xs text-slate-500">
                      Submitted by {item.requesterName} <span aria-hidden="true">·</span>{' '}
                      <span className="font-mono">{item.amountOrDetail}</span> <span aria-hidden="true">·</span>{' '}
                      {formatNairobiDateTime(item.createdAt)}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {isSelf ? (
                      <span className="inline-flex items-center gap-1.5 text-xs text-amber-700 font-medium">
                        <ShieldAlert className="w-3.5 h-3.5" />
                        Self-approval restricted
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => {
                          setSelected(item);
                          setDecision(item.status === 'approved' ? 'approved' : 'approved');
                          setComment('');
                          setErrorMsg(null);
                        }}
                        className="px-3.5 py-2 text-xs font-semibold text-white bg-[var(--brand-primary)] hover:bg-[var(--brand-primary-hover)] rounded-lg transition-colors"
                      >
                        Review & Action
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <Modal
        open={Boolean(selected)}
        onClose={() => setSelected(null)}
        title={selected ? `Review ${selected.refNo}` : 'Review'}
        subtitle={selected?.title}
        maxWidthClass="max-w-lg"
      >
        {selected && (
          <div className="space-y-4">
            <div className="bg-stone-50 border border-stone-200 rounded-lg p-3.5 text-xs space-y-1">
              <div>
                <span className="text-slate-500">Requester:</span>{' '}
                <strong className="text-slate-900">{selected.requesterName}</strong>
              </div>
              <div>
                <span className="text-slate-500">Details:</span>{' '}
                <span className="font-mono text-slate-900">{selected.amountOrDetail}</span>
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="block text-xs font-medium text-slate-700">Decision</label>
              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => setDecision('approved')}
                  className={`flex items-center justify-center gap-1.5 py-2 px-3 text-xs font-medium rounded-lg border ${
                    decision === 'approved'
                      ? 'bg-emerald-50 border-emerald-700 text-emerald-900'
                      : 'bg-white border-stone-300 text-slate-700'
                  }`}
                >
                  <Check className="w-3.5 h-3.5" />
                  {selected.status === 'approved' && selected.collectionName === 'financeTransactions'
                    ? 'Mark Paid'
                    : 'Approve'}
                </button>
                <button
                  type="button"
                  onClick={() => setDecision('returned')}
                  className={`flex items-center justify-center gap-1.5 py-2 px-3 text-xs font-medium rounded-lg border ${
                    decision === 'returned'
                      ? 'bg-amber-50 border-amber-700 text-amber-900'
                      : 'bg-white border-stone-300 text-slate-700'
                  }`}
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  Return
                </button>
                <button
                  type="button"
                  onClick={() => setDecision('rejected')}
                  className={`flex items-center justify-center gap-1.5 py-2 px-3 text-xs font-medium rounded-lg border ${
                    decision === 'rejected'
                      ? 'bg-red-50 border-red-700 text-red-900'
                      : 'bg-white border-stone-300 text-slate-700'
                  }`}
                >
                  <XCircle className="w-3.5 h-3.5" />
                  Reject
                </button>
              </div>
            </div>

            {selected.collectionName === 'apprenticeReports' && (
              <div className="space-y-1.5">
                <label htmlFor="eval-score" className="block text-xs font-medium text-slate-700">
                  Supervisor Evaluation Score (1–5)
                </label>
                <select
                  id="eval-score"
                  value={score}
                  onChange={(e) => setScore(Number(e.target.value))}
                  className="w-full px-3 py-2 text-sm border border-stone-300 rounded-lg"
                >
                  <option value={5}>5 — Exemplary Ministry Growth</option>
                  <option value={4}>4 — Strong & Consistent</option>
                  <option value={3}>3 — Satisfactory</option>
                  <option value={2}>2 — Needs Guidance</option>
                  <option value={1}>1 — Immediate Support Required</option>
                </select>
              </div>
            )}

            <div className="space-y-1.5">
              <label htmlFor="approval-comment" className="block text-xs font-medium text-slate-700">
                Reviewer Comment / Audit Note
              </label>
              <textarea
                id="approval-comment"
                rows={3}
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="Enter justification, payment voucher reference, or revision guidance..."
                className="w-full px-3 py-2 text-sm border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-900/20"
              />
            </div>

            {errorMsg && <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">{errorMsg}</div>}

            <div className="flex justify-end gap-3 pt-2 border-t border-stone-100">
              <button
                type="button"
                onClick={() => setSelected(null)}
                className="px-4 py-2 text-sm font-medium text-slate-700 border border-stone-300 rounded-lg hover:bg-stone-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={submitting}
                onClick={() => void handleDecision()}
                className="px-4 py-2 text-sm font-semibold text-white bg-[var(--brand-primary)] hover:bg-[var(--brand-primary-hover)] rounded-lg disabled:opacity-60"
              >
                {submitting ? 'Saving...' : 'Submit Decision'}
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
