import React, { useMemo, useState } from 'react';
import { collection, doc, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';
import {
  Plus,
  Eye,
  Lock,
  Check,
  RotateCcw,
  CheckCircle2,
  Clock,
  Paperclip,
} from 'lucide-react';
import { ORG_ID, db } from '../../lib/firebase.ts';
import { OperationType, handleFirestoreError } from '../../lib/firestoreError.ts';
import { recordAuditLog, sendNotification } from '../../lib/audit.ts';
import { useAuth } from '../../context/AuthContext.tsx';
import { useData } from '../../context/DataContext.tsx';
import { DataTable, ColumnDef } from '../ui/DataTable.tsx';
import { Modal } from '../ui/Modal.tsx';
import { StatusText } from '../ui/StatusText.tsx';
import { AttachmentPreviewModal } from '../apprentice/AttachmentPreviewModal.tsx';
import {
  ImprestCategory,
  ImprestRecord,
  ImprestRetirement,
  formatKes,
} from '../../types/erp.ts';

interface PreviewDocState {
  title: string;
  fileName: string;
  mimeType?: string;
  dataUrl: string;
}

export function FinanceImprestPanel() {
  const { profile, effectiveRole } = useAuth();
  const { apprentices, imprestRecords, imprestRetirements, imprestReceipts } = useData();

  const [catFilter, setCatFilter] = useState<'all' | ImprestCategory>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | ImprestRetirement['status']>('all');
  const [issueModalOpen, setIssueModalOpen] = useState(false);
  const [reviewItem, setReviewItem] = useState<ImprestRetirement | null>(null);
  const [reviewComment, setReviewComment] = useState('');
  const [previewDoc, setPreviewDoc] = useState<PreviewDocState | null>(null);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Issue imprest form state
  const [selectedAppId, setSelectedAppId] = useState('');
  const [issueCategory, setIssueCategory] = useState<ImprestCategory>('transport');
  const [issueAmount, setIssueAmount] = useState('');
  const [issueDate, setIssueDate] = useState(new Date().toISOString().slice(0, 10));
  const [issuePurpose, setIssuePurpose] = useState('');

  const canManageImprest = [
    'super_admin',
    'executive_director',
    'senior_management',
    'finance_officer',
  ].includes(effectiveRole);

  const stats = useMemo(() => {
    const issuedOpen = imprestRecords.filter((r) => r.status === 'issued').length;
    const pendingReview = imprestRetirements.filter((r) => ['submitted', 'under_review'].includes(r.status)).length;
    const returnedCount = imprestRetirements.filter((r) => r.status === 'returned').length;
    const settledTotal = imprestRetirements
      .filter((r) => r.status === 'settled')
      .reduce((s, r) => s + r.actualSpentKes, 0);
    return { issuedOpen, pendingReview, returnedCount, settledTotal };
  }, [imprestRecords, imprestRetirements]);

  const filteredRetirements = useMemo(() => {
    return imprestRetirements.filter((r) => {
      if (catFilter !== 'all' && r.category !== catFilter) return false;
      if (statusFilter !== 'all' && r.status !== statusFilter) return false;
      return true;
    });
  }, [imprestRetirements, catFilter, statusFilter]);

  const linkedReceipts = useMemo(() => {
    if (!reviewItem) return [];
    return imprestReceipts.filter((rc) => rc.retirementId === reviewItem.id);
  }, [imprestReceipts, reviewItem]);

  const handleIssueImprest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile || !canManageImprest) return;
    setErrorMsg(null);
    setNotice(null);

    const apprentice = apprentices.find((a) => a.id === selectedAppId);
    const amt = Number(issueAmount);
    if (!apprentice) {
      setErrorMsg('Select an apprentice from the registry.');
      return;
    }
    if (!Number.isFinite(amt) || amt <= 0) {
      setErrorMsg('Enter a valid positive KES amount.');
      return;
    }
    if (!issueDate || issuePurpose.trim().length < 2) {
      setErrorMsg('Provide date received and imprest purpose.');
      return;
    }

    const prefix = issueCategory === 'transport' ? 'TRN' : issueCategory === 'pd' ? 'PD' : 'MED';
    const referenceNo = `IMP-${prefix}-${String(Math.floor(1000 + Math.random() * 9000))}`;
    const ref = doc(collection(db, 'imprestRecords'));

    setSaving(true);
    try {
      await setDoc(ref, {
        orgId: ORG_ID,
        referenceNo,
        apprenticeId: apprentice.id,
        apprenticeUserId: apprentice.userId,
        apprenticeName: apprentice.fullName,
        category: issueCategory,
        amountReceivedKes: amt,
        dateReceived: issueDate,
        purpose: issuePurpose.trim(),
        issuedBy: profile.uid,
        issuedByName: profile.displayName,
        status: 'issued',
        isDemo: false,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      await recordAuditLog({
        actorUid: profile.uid,
        actorName: profile.displayName,
        actorRole: effectiveRole,
        action: 'ISSUE_APPRENTICE_IMPREST',
        targetCollection: 'imprestRecords',
        targetId: ref.id,
        summary: `Issued ${issueCategory.toUpperCase()} imprest ${referenceNo} (${formatKes(amt)}) to ${apprentice.fullName}`,
      });

      if (apprentice.userId && apprentice.userId !== profile.uid && !apprentice.userId.startsWith('demo_')) {
        await sendNotification({
          recipientUid: apprentice.userId,
          title: `New ${issueCategory.toUpperCase()} Imprest Issued (${referenceNo})`,
          message: `Finance issued ${formatKes(amt)} on ${issueDate} for: ${issuePurpose.trim()}. Submit receipts in Imprest Management once incurred.`,
          category: 'finance',
          linkModule: 'apprenticeship',
        });
      }

      setIssueModalOpen(false);
      setSelectedAppId('');
      setIssueAmount('');
      setIssuePurpose('');
      setNotice(`Issued imprest ${referenceNo} (${formatKes(amt)}) to ${apprentice.fullName}.`);
    } catch (err) {
      try {
        handleFirestoreError(err, OperationType.CREATE, 'imprestRecords');
      } catch (e2) {
        setErrorMsg(e2 instanceof Error ? e2.message : 'Unable to issue imprest record.');
      }
    } finally {
      setSaving(false);
    }
  };

  const handleReviewDecision = async (
    nextStatus: 'under_review' | 'returned' | 'approved' | 'settled'
  ) => {
    if (!profile || !reviewItem || !canManageImprest) return;
    setErrorMsg(null);
    setNotice(null);

    if (reviewItem.apprenticeUserId === profile.uid && effectiveRole !== 'super_admin') {
      setErrorMsg('Separation of duties: Finance cannot review or settle their own imprest submission.');
      return;
    }
    if (nextStatus === 'returned' && reviewComment.trim().length < 3) {
      setErrorMsg('Please enter clear correction guidance when returning an imprest for revision.');
      return;
    }

    const nowIso = new Date().toISOString();
    setSaving(true);
    try {
      const updatePayload: Record<string, unknown> = {
        status: nextStatus,
        financeComment:
          reviewComment.trim() ||
          reviewItem.financeComment ||
          (nextStatus === 'settled'
            ? 'Imprest settled by Finance.'
            : nextStatus === 'approved'
              ? 'Receipts verified and approved.'
              : 'Under Finance review.'),
        reviewedBy: profile.displayName,
        reviewedAt: nowIso,
        updatedAt: serverTimestamp(),
      };

      if (nextStatus === 'settled') {
        updatePayload.settledBy = profile.displayName;
        updatePayload.settledAt = nowIso;
      }

      await updateDoc(doc(db, 'imprestRetirements', reviewItem.id), updatePayload);

      if (reviewItem.imprestRecordId && (nextStatus === 'approved' || nextStatus === 'settled')) {
        await updateDoc(doc(db, 'imprestRecords', reviewItem.imprestRecordId), {
          status: nextStatus === 'settled' ? 'settled' : 'retired',
          updatedAt: serverTimestamp(),
        });
      }

      await recordAuditLog({
        actorUid: profile.uid,
        actorName: profile.displayName,
        actorRole: effectiveRole,
        action: `IMPREST_${nextStatus.toUpperCase()}`,
        targetCollection: 'imprestRetirements',
        targetId: reviewItem.id,
        summary: `Marked ${reviewItem.category.toUpperCase()} imprest ${reviewItem.referenceNo} (${reviewItem.apprenticeName}) as ${nextStatus}`,
      });

      if (reviewItem.apprenticeUserId && !reviewItem.apprenticeUserId.startsWith('demo_')) {
        await sendNotification({
          recipientUid: reviewItem.apprenticeUserId,
          title: `Imprest ${reviewItem.referenceNo}: ${nextStatus.replace(/_/g, ' ')}`,
          message: `Finance Manager (${profile.displayName}) updated your ${reviewItem.category.toUpperCase()} imprest ${reviewItem.referenceNo} to ${nextStatus.replace(/_/g, ' ')}.${reviewComment.trim() ? ` Note: ${reviewComment.trim()}` : ''}`,
          category: 'finance',
          linkModule: 'apprenticeship',
        });
      }

      setNotice(`Imprest ${reviewItem.referenceNo} updated to ${nextStatus.replace(/_/g, ' ')}.`);
      setReviewItem(null);
      setReviewComment('');
    } catch (err) {
      try {
        handleFirestoreError(err, OperationType.UPDATE, `imprestRetirements/${reviewItem.id}`);
      } catch (e2) {
        setErrorMsg(e2 instanceof Error ? e2.message : 'Unable to update imprest retirement.');
      }
    } finally {
      setSaving(false);
    }
  };

  const columns: ColumnDef<ImprestRetirement>[] = [
    {
      key: 'ref',
      header: 'Ref & Apprentice',
      sortable: true,
      sortValue: (r) => r.referenceNo,
      render: (r) => (
        <div>
          <div className="flex items-center gap-1.5">
            <span className="font-mono text-xs font-semibold text-slate-900">{r.referenceNo}</span>
            {r.category === 'medical' && (
              <span title="Restricted Medical Record">
                <Lock className="w-3 h-3 text-amber-700" />
              </span>
            )}
          </div>
          <div className="text-xs text-slate-500">
            {r.apprenticeName} · <span className="uppercase">{r.category}</span>
          </div>
        </div>
      ),
    },
    {
      key: 'purpose',
      header: 'Purpose & Date',
      render: (r) => (
        <div className="text-xs max-w-xs">
          <div className="text-slate-800 line-clamp-1">
            {r.purpose || r.pdActivity || r.medicalPurpose || r.destination || '—'}
          </div>
          <div className="text-slate-400 font-mono">Received {r.dateReceived}</div>
        </div>
      ),
    },
    {
      key: 'received',
      header: 'Received',
      align: 'right',
      render: (r) => <span className="font-mono text-xs tabular-nums">{formatKes(r.amountReceivedKes)}</span>,
    },
    {
      key: 'spent',
      header: 'Actual Spent',
      align: 'right',
      render: (r) => <span className="font-mono text-xs font-semibold text-slate-900 tabular-nums">{formatKes(r.actualSpentKes)}</span>,
    },
    {
      key: 'balance',
      header: 'Unspent / Extra',
      align: 'right',
      render: (r) =>
        r.additionalRequiredKes > 0 ? (
          <span className="font-mono text-xs font-semibold text-amber-700 tabular-nums">
            +{formatKes(r.additionalRequiredKes)} extra
          </span>
        ) : (
          <span className="font-mono text-xs text-emerald-800 tabular-nums">
            {formatKes(r.unspentBalanceKes)} unspent
          </span>
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
      header: 'Review',
      align: 'right',
      render: (r) => (
        <button
          type="button"
          onClick={() => {
            setReviewItem(r);
            setReviewComment(r.financeComment || '');
            setErrorMsg(null);
          }}
          className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-emerald-900 bg-white border border-stone-300 rounded-lg hover:bg-stone-50"
        >
          <Eye className="w-3.5 h-3.5" />
          Inspect
        </button>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-slate-900 font-display">
            Apprentice Imprest Issuance &amp; Accountability
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Link issued imprests to apprentices, review Transport/PD/Medical receipts, and mark settled retirements
          </p>
        </div>

        {canManageImprest && (
          <button
            type="button"
            onClick={() => {
              setErrorMsg(null);
              setIssueModalOpen(true);
            }}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-[var(--brand-primary)] hover:bg-[var(--brand-primary-hover)] rounded-lg min-h-[40px]"
          >
            <Plus className="w-3.5 h-3.5" />
            Issue / Link Imprest
          </button>
        )}
      </div>

      {notice && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-xs text-emerald-900">
          {notice}
        </div>
      )}

      {/* KPI Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white border border-stone-200 rounded-xl p-4 space-y-1">
          <div className="text-xs text-slate-500">Issued &amp; Unretired Imprests</div>
          <div className="text-xl font-bold font-mono text-slate-900 tabular-nums">{stats.issuedOpen}</div>
        </div>
        <div className="bg-white border border-stone-200 rounded-xl p-4 space-y-1">
          <div className="text-xs text-slate-500">Pending Finance Review</div>
          <div className="text-xl font-bold font-mono text-amber-700 tabular-nums">{stats.pendingReview}</div>
        </div>
        <div className="bg-white border border-stone-200 rounded-xl p-4 space-y-1">
          <div className="text-xs text-slate-500">Returned for Revision</div>
          <div className="text-xl font-bold font-mono text-slate-900 tabular-nums">{stats.returnedCount}</div>
        </div>
        <div className="bg-white border border-stone-200 rounded-xl p-4 space-y-1">
          <div className="text-xs text-slate-500">Total Settled Expenditure</div>
          <div className="text-xl font-bold font-mono text-emerald-800 tabular-nums">
            {formatKes(stats.settledTotal)}
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1 p-1 bg-stone-200/70 rounded-lg">
          {(['all', 'transport', 'pd', 'medical'] as const).map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => setCatFilter(cat)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md capitalize transition-colors ${
                catFilter === cat ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {cat === 'pd' ? 'PD Imprest' : cat === 'all' ? 'All Categories' : `${cat} Imprest`}
            </button>
          ))}
        </div>

        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as 'all' | ImprestRetirement['status'])}
          className="px-3 py-1.5 text-xs bg-white border border-stone-300 rounded-lg min-h-[36px]"
        >
          <option value="all">All Statuses</option>
          <option value="submitted">Submitted</option>
          <option value="under_review">Under Finance Review</option>
          <option value="returned">Returned for Revision</option>
          <option value="approved">Approved</option>
          <option value="settled">Settled</option>
          <option value="draft">Draft</option>
        </select>
      </div>

      <DataTable
        rows={filteredRetirements}
        columns={columns}
        rowKey={(r) => r.id}
        searchPlaceholder="Search by reference, apprentice name, or purpose..."
        searchFilter={(r, q) =>
          r.referenceNo.toLowerCase().includes(q) ||
          r.apprenticeName.toLowerCase().includes(q) ||
          (r.purpose || '').toLowerCase().includes(q) ||
          r.category.toLowerCase().includes(q)
        }
        emptyTitle="No apprentice imprest retirements found"
        emptyDescription="Submitted Transport, PD, and Medical imprest accountings will appear here."
      />

      {/* Issued Imprest Records Summary */}
      {imprestRecords.length > 0 && (
        <div className="bg-white border border-stone-200 rounded-xl p-5 space-y-3">
          <h3 className="text-sm font-semibold text-slate-900 font-display">Issued Imprest Ledger</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-stone-200 text-slate-500">
                  <th className="py-2 pr-3 font-medium">Ref No</th>
                  <th className="py-2 pr-3 font-medium">Apprentice</th>
                  <th className="py-2 pr-3 font-medium">Category</th>
                  <th className="py-2 pr-3 font-medium">Purpose</th>
                  <th className="py-2 pr-3 font-medium">Issued Date</th>
                  <th className="py-2 pr-3 font-medium text-right">Amount</th>
                  <th className="py-2 font-medium text-right">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {imprestRecords.slice(0, 12).map((rec: ImprestRecord) => (
                  <tr key={rec.id}>
                    <td className="py-2.5 pr-3 font-mono font-semibold text-slate-900">{rec.referenceNo}</td>
                    <td className="py-2.5 pr-3 text-slate-800">{rec.apprenticeName}</td>
                    <td className="py-2.5 pr-3 uppercase text-slate-600">{rec.category}</td>
                    <td className="py-2.5 pr-3 text-slate-600 max-w-xs truncate">{rec.purpose}</td>
                    <td className="py-2.5 pr-3 font-mono text-slate-500">{rec.dateReceived}</td>
                    <td className="py-2.5 pr-3 font-mono text-right text-slate-900 tabular-nums">
                      {formatKes(rec.amountReceivedKes)}
                    </td>
                    <td className="py-2.5 text-right">
                      <StatusText status={rec.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Issue New Imprest Modal */}
      <Modal
        open={issueModalOpen}
        onClose={() => setIssueModalOpen(false)}
        title="Issue / Link Imprest to Apprentice"
        subtitle="Creates a tracked imprest disbursement visible in the apprentice's Imprest Management portal"
        maxWidthClass="max-w-lg"
      >
        <form onSubmit={(e) => void handleIssueImprest(e)} className="space-y-4">
          {errorMsg && (
            <div className="p-2.5 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">{errorMsg}</div>
          )}

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Apprentice *</label>
            <select
              required
              value={selectedAppId}
              onChange={(e) => setSelectedAppId(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-stone-300 rounded-lg min-h-[42px]"
            >
              <option value="">Select Apprentice...</option>
              {apprentices.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.apprenticeCode} — {a.fullName} ({a.cohortName || 'Cohort'})
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Category *</label>
              <select
                value={issueCategory}
                onChange={(e) => setIssueCategory(e.target.value as ImprestCategory)}
                className="w-full px-3 py-2 text-sm border border-stone-300 rounded-lg min-h-[42px]"
              >
                <option value="transport">Transport Imprest</option>
                <option value="pd">PD Imprest</option>
                <option value="medical">Medical Imprest</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Amount (KES) *</label>
              <input
                type="number"
                min="1"
                step="0.01"
                required
                value={issueAmount}
                onChange={(e) => setIssueAmount(e.target.value)}
                placeholder="e.g. 8500"
                className="w-full px-3 py-2 text-sm font-mono border border-stone-300 rounded-lg min-h-[42px]"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Date Issued *</label>
              <input
                type="date"
                required
                value={issueDate}
                onChange={(e) => setIssueDate(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-stone-300 rounded-lg min-h-[42px]"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Purpose / Activity *</label>
            <textarea
              rows={2}
              required
              maxLength={500}
              value={issuePurpose}
              onChange={(e) => setIssuePurpose(e.target.value)}
              placeholder="e.g. Eldoret ministry travel facilitation / Q4 PD medical consultation"
              className="w-full px-3 py-2 text-sm border border-stone-300 rounded-lg"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-stone-100">
            <button
              type="button"
              onClick={() => setIssueModalOpen(false)}
              className="px-4 py-2 text-sm border border-stone-300 rounded-lg"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 text-sm font-semibold text-white bg-[var(--brand-primary)] rounded-lg disabled:opacity-60"
            >
              {saving ? 'Issuing...' : 'Issue Imprest'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Finance Review & Settlement Modal */}
      <Modal
        open={Boolean(reviewItem)}
        onClose={() => setReviewItem(null)}
        title={reviewItem ? `Finance Review: ${reviewItem.referenceNo}` : 'Inspect Imprest'}
        subtitle={
          reviewItem
            ? `${reviewItem.apprenticeName} · ${reviewItem.category.toUpperCase()} IMPREST`
            : ''
        }
        maxWidthClass="max-w-2xl"
      >
        {reviewItem && (
          <div className="space-y-4 text-xs">
            <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-stone-200">
              <StatusText status={reviewItem.status} />
              <div className="text-slate-500">
                Original Issued: <strong className="font-mono">{formatKes(reviewItem.originalAmountReceivedKes)}</strong>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-stone-50 border border-stone-200 rounded-lg p-3">
              <div>
                <div className="text-slate-400">Amount Received</div>
                <div className="font-mono font-semibold text-slate-900">{formatKes(reviewItem.amountReceivedKes)}</div>
              </div>
              <div>
                <div className="text-slate-400">Actual Spent</div>
                <div className="font-mono font-semibold text-slate-900">{formatKes(reviewItem.actualSpentKes)}</div>
              </div>
              <div>
                <div className="text-slate-400">Unspent Balance</div>
                <div className="font-mono font-semibold text-emerald-800">{formatKes(reviewItem.unspentBalanceKes)}</div>
              </div>
              <div>
                <div className="text-slate-400">Additional Req.</div>
                <div className="font-mono font-semibold text-amber-700">{formatKes(reviewItem.additionalRequiredKes)}</div>
              </div>
            </div>

            <div className="p-3 border border-stone-200 rounded-lg space-y-1.5">
              {reviewItem.purpose && (
                <div>
                  <span className="text-slate-500">Purpose:</span>{' '}
                  <strong className="text-slate-900">{reviewItem.purpose}</strong>
                </div>
              )}
              {reviewItem.destination && (
                <div>
                  <span className="text-slate-500">Destination / Travel Date:</span>{' '}
                  <span className="text-slate-800">{reviewItem.destination} ({reviewItem.travelDate || '—'})</span>
                </div>
              )}
              {reviewItem.pdActivity && (
                <div>
                  <span className="text-slate-500">PD Activity:</span>{' '}
                  <strong className="text-slate-900">{reviewItem.pdActivity}</strong>
                </div>
              )}
              {reviewItem.medicalPurpose && (
                <div>
                  <span className="text-slate-500">Medical Purpose:</span>{' '}
                  <strong className="text-slate-900">{reviewItem.medicalPurpose} ({reviewItem.expenditureDate || '—'})</strong>
                </div>
              )}
              {(reviewItem.expenditureBreakdown || reviewItem.expenditureDescription) && (
                <div className="pt-1">
                  <div className="text-slate-500 font-medium">Expenditure Breakdown / Description:</div>
                  <p className="text-slate-800 whitespace-pre-wrap mt-0.5">
                    {reviewItem.expenditureBreakdown || reviewItem.expenditureDescription}
                  </p>
                </div>
              )}
              {reviewItem.comments && (
                <div className="pt-1">
                  <div className="text-slate-500 font-medium">Apprentice Comments:</div>
                  <p className="text-slate-700 whitespace-pre-wrap">{reviewItem.comments}</p>
                </div>
              )}
            </div>

            {/* Attached Accounting Sheet & Receipts */}
            <div className="space-y-2">
              <div className="font-semibold text-slate-800">Supporting Documents &amp; Receipts</div>
              <div className="flex flex-wrap gap-2">
                {reviewItem.accountingSheetDataUrl && (
                  <button
                    type="button"
                    onClick={() =>
                      setPreviewDoc({
                        title: `Accounting Sheet — ${reviewItem.referenceNo}`,
                        fileName: reviewItem.accountingSheetName || 'accounting-sheet.pdf',
                        mimeType: 'application/pdf',
                        dataUrl: reviewItem.accountingSheetDataUrl || '',
                      })
                    }
                    className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-emerald-900 bg-emerald-50 border border-emerald-200 rounded-lg hover:bg-emerald-100"
                  >
                    <Paperclip className="w-3.5 h-3.5" />
                    {reviewItem.accountingSheetName || 'Accounting Sheet (PDF)'}
                  </button>
                )}

                {linkedReceipts.map((rc) => (
                  <button
                    key={rc.id}
                    type="button"
                    onClick={() =>
                      setPreviewDoc({
                        title: `${rc.docKind === 'supporting' ? 'Supporting Doc' : 'Receipt'} — ${rc.fileName}`,
                        fileName: rc.fileName,
                        mimeType: rc.mimeType,
                        dataUrl: rc.dataUrl,
                      })
                    }
                    className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-700 bg-stone-50 border border-stone-300 rounded-lg hover:bg-stone-100"
                  >
                    <Paperclip className="w-3.5 h-3.5" />
                    {rc.fileName}
                  </button>
                ))}

                {!reviewItem.accountingSheetDataUrl && linkedReceipts.length === 0 && (
                  <p className="text-slate-400">No attachments uploaded on this retirement.</p>
                )}
              </div>
            </div>

            {canManageImprest && ['submitted', 'under_review', 'approved', 'returned'].includes(reviewItem.status) && (
              <div className="space-y-3 pt-2 border-t border-stone-200">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Finance Review Comment (Required when returning for revision)
                  </label>
                  <textarea
                    rows={2}
                    value={reviewComment}
                    onChange={(e) => setReviewComment(e.target.value)}
                    placeholder="Enter receipt verification notes, balance instructions, or revision guidance..."
                    className="w-full px-3 py-2 text-sm border border-stone-300 rounded-lg"
                  />
                </div>

                {errorMsg && <p className="text-xs text-red-700">{errorMsg}</p>}

                <div className="flex flex-wrap items-center justify-end gap-2">
                  {reviewItem.status === 'submitted' && (
                    <button
                      type="button"
                      disabled={saving}
                      onClick={() => void handleReviewDecision('under_review')}
                      className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-800 bg-stone-100 hover:bg-stone-200 border border-stone-300 rounded-lg"
                    >
                      <Clock className="w-3.5 h-3.5" />
                      Under Finance Review
                    </button>
                  )}
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => void handleReviewDecision('returned')}
                    className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-amber-900 bg-amber-50 hover:bg-amber-100 border border-amber-200 rounded-lg"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    Return for Revision
                  </button>
                  {['submitted', 'under_review', 'returned'].includes(reviewItem.status) && (
                    <button
                      type="button"
                      disabled={saving}
                      onClick={() => void handleReviewDecision('approved')}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-emerald-950 bg-emerald-100 hover:bg-emerald-200 border border-emerald-300 rounded-lg"
                    >
                      <Check className="w-3.5 h-3.5" />
                      Approve
                    </button>
                  )}
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => void handleReviewDecision('settled')}
                    className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-[var(--brand-primary)] hover:bg-[var(--brand-primary-hover)] rounded-lg"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    Mark Settled
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </Modal>

      <AttachmentPreviewModal
        open={Boolean(previewDoc)}
        onClose={() => setPreviewDoc(null)}
        title={previewDoc?.title || 'Document'}
        fileName={previewDoc?.fileName || 'document'}
        mimeType={previewDoc?.mimeType}
        dataUrl={previewDoc?.dataUrl || ''}
      />
    </div>
  );
}
