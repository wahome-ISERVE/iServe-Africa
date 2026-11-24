import React, { useEffect, useMemo, useState } from 'react';
import { collection, deleteDoc, doc, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';
import {
  Car,
  GraduationCap,
  HeartPulse,
  Lock,
  Plus,
  Upload,
  FileText,
  Trash2,
  Pencil,
  Eye,
  Paperclip,
} from 'lucide-react';
import { ORG_ID, db } from '../../lib/firebase.ts';
import { OperationType, handleFirestoreError } from '../../lib/firestoreError.ts';
import { recordAuditLog, sendNotification } from '../../lib/audit.ts';
import { ProcessedUpload, processDocumentUpload } from '../../lib/fileUpload.ts';
import { useAuth } from '../../context/AuthContext.tsx';
import { useData } from '../../context/DataContext.tsx';
import { DataTable, ColumnDef } from '../ui/DataTable.tsx';
import { Modal } from '../ui/Modal.tsx';
import { StatusText } from '../ui/StatusText.tsx';
import { AttachmentPreviewModal } from './AttachmentPreviewModal.tsx';
import {
  Apprentice,
  ImprestCategory,
  ImprestRecord,
  ImprestReceipt,
  ImprestRetirement,
  formatKes,
} from '../../types/erp.ts';

interface ImprestManagementSectionProps {
  apprenticeRecord: Apprentice | null;
  autoOpenNew?: boolean;
  onConsumeAutoOpen?: () => void;
}

const CATEGORY_META: Record<
  ImprestCategory,
  { title: string; subtitle: string; Icon: typeof Car; confidential?: boolean }
> = {
  transport: {
    title: 'Transport Imprest',
    subtitle: 'Ministry travel, destination details, JPG/PNG receipts, and PDF accounting sheet',
    Icon: Car,
  },
  pd: {
    title: 'PD Imprest',
    subtitle: 'Personal development activity funding, expenditure breakdown, and supporting receipts',
    Icon: GraduationCap,
  },
  medical: {
    title: 'Medical Imprest',
    subtitle: 'Restricted strictly to you, authorised Finance, and HR personnel',
    Icon: HeartPulse,
    confidential: true,
  },
};

export function ImprestManagementSection({
  apprenticeRecord,
  autoOpenNew,
  onConsumeAutoOpen,
}: ImprestManagementSectionProps) {
  const { profile } = useAuth();
  const { imprestRecords, imprestRetirements, imprestReceipts, directory } = useData();

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<ImprestRetirement | null>(null);
  const [viewing, setViewing] = useState<ImprestRetirement | null>(null);
  const [previewDoc, setPreviewDoc] = useState<{
    title: string;
    fileName: string;
    mimeType?: string;
    dataUrl: string;
  } | null>(null);

  const [category, setCategory] = useState<ImprestCategory>('transport');
  const [linkedRecordId, setLinkedRecordId] = useState('');
  const [amountReceived, setAmountReceived] = useState('');
  const [dateReceived, setDateReceived] = useState(new Date().toISOString().slice(0, 10));
  const [purpose, setPurpose] = useState('');
  const [destination, setDestination] = useState('');
  const [travelDate, setTravelDate] = useState(new Date().toISOString().slice(0, 10));
  const [pdActivity, setPdActivity] = useState('');
  const [medicalPurpose, setMedicalPurpose] = useState('');
  const [expenditureDate, setExpenditureDate] = useState(new Date().toISOString().slice(0, 10));
  const [expenditureDescription, setExpenditureDescription] = useState('');
  const [expenditureBreakdown, setExpenditureBreakdown] = useState('');
  const [actualSpent, setActualSpent] = useState('');
  const [comments, setComments] = useState('');

  // Transport PDF accounting sheet
  const [accountingSheetName, setAccountingSheetName] = useState('');
  const [accountingSheetDataUrl, setAccountingSheetDataUrl] = useState('');

  // Queued new receipts + existing saved receipts when editing
  const [queuedReceipts, setQueuedReceipts] = useState<
    (ProcessedUpload & { docKind: 'receipt' | 'supporting' })[]
  >([]);

  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const uid = profile?.uid || '';

  const myRecords = useMemo(
    () => imprestRecords.filter((r) => r.apprenticeUserId === uid),
    [imprestRecords, uid]
  );
  const myRetirements = useMemo(
    () => imprestRetirements.filter((r) => r.apprenticeUserId === uid),
    [imprestRetirements, uid]
  );

  // Live Imprest balance math
  const receivedNum = Math.max(0, Number(amountReceived) || 0);
  const spentNum = Math.max(0, Number(actualSpent) || 0);
  const unspentBalanceKes = Math.max(0, receivedNum - spentNum);
  const additionalRequiredKes = Math.max(0, spentNum - receivedNum);

  const openNewForCategory = (cat: ImprestCategory, record?: ImprestRecord) => {
    setEditing(null);
    setCategory(cat);
    setLinkedRecordId(record?.id || '');
    setAmountReceived(record ? String(record.amountReceivedKes) : '');
    setDateReceived(record?.dateReceived || new Date().toISOString().slice(0, 10));
    setPurpose(record?.purpose || '');
    setDestination('');
    setTravelDate(new Date().toISOString().slice(0, 10));
    setPdActivity(record && cat === 'pd' ? record.purpose : '');
    setMedicalPurpose(record && cat === 'medical' ? record.purpose : '');
    setExpenditureDate(new Date().toISOString().slice(0, 10));
    setExpenditureDescription('');
    setExpenditureBreakdown('');
    setActualSpent('');
    setComments('');
    setAccountingSheetName('');
    setAccountingSheetDataUrl('');
    setQueuedReceipts([]);
    setFormError(null);
    setModalOpen(true);
  };

  useEffect(() => {
    if (autoOpenNew) {
      openNewForCategory('transport');
      onConsumeAutoOpen?.();
    }
  }, [autoOpenNew, onConsumeAutoOpen]);

  const openEdit = (ret: ImprestRetirement) => {
    setEditing(ret);
    setCategory(ret.category);
    setLinkedRecordId(ret.imprestRecordId || '');
    setAmountReceived(String(ret.amountReceivedKes));
    setDateReceived(ret.dateReceived);
    setPurpose(ret.purpose || '');
    setDestination(ret.destination || '');
    setTravelDate(ret.travelDate || new Date().toISOString().slice(0, 10));
    setPdActivity(ret.pdActivity || '');
    setMedicalPurpose(ret.medicalPurpose || '');
    setExpenditureDate(ret.expenditureDate || new Date().toISOString().slice(0, 10));
    setExpenditureDescription(ret.expenditureDescription || '');
    setExpenditureBreakdown(ret.expenditureBreakdown || '');
    setActualSpent(String(ret.actualSpentKes));
    setComments(ret.comments || '');
    setAccountingSheetName(ret.accountingSheetName || '');
    setAccountingSheetDataUrl(ret.accountingSheetDataUrl || '');
    setQueuedReceipts([]);
    setFormError(null);
    setModalOpen(true);
  };

  const handleMultiReceiptUpload = async (
    files: FileList | null,
    docKind: 'receipt' | 'supporting'
  ) => {
    if (!files || files.length === 0) return;
    setFormError(null);
    const added: (ProcessedUpload & { docKind: 'receipt' | 'supporting' })[] = [];
    for (const file of Array.from(files)) {
      try {
        const processed = await processDocumentUpload(file, {
          allowPdf: category === 'transport' ? docKind === 'supporting' || true : true,
          allowImages: true,
          maxDataUrlLength: 680000,
        });
        added.push({ ...processed, docKind });
      } catch (err) {
        setFormError(err instanceof Error ? err.message : 'Unable to process receipt.');
        return;
      }
    }
    setQueuedReceipts((prev) => [...prev, ...added]);
  };

  const handleAccountingSheetUpload = async (file: File | undefined) => {
    if (!file) return;
    setFormError(null);
    try {
      const processed = await processDocumentUpload(file, {
        allowPdf: true,
        allowImages: false,
        maxDataUrlLength: 640000,
      });
      setAccountingSheetName(processed.fileName);
      setAccountingSheetDataUrl(processed.dataUrl);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Upload a valid PDF accounting sheet.');
    }
  };

  const existingSavedReceipts = useMemo(
    () => (editing ? imprestReceipts.filter((r) => r.retirementId === editing.id) : []),
    [imprestReceipts, editing]
  );

  const handleDeleteSavedReceipt = async (receipt: ImprestReceipt) => {
    try {
      await deleteDoc(doc(db, 'imprestReceipts', receipt.id));
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `imprestReceipts/${receipt.id}`);
    }
  };

  const saveImprest = async (targetStatus: 'draft' | 'submitted') => {
    if (!profile) return;
    setFormError(null);
    setNotice(null);

    if (!Number.isFinite(receivedNum) || receivedNum <= 0) {
      setFormError('Amount received must be a positive KES amount.');
      return;
    }
    if (!dateReceived) {
      setFormError('Date received is required.');
      return;
    }
    if (!Number.isFinite(spentNum) || spentNum < 0) {
      setFormError('Actual amount spent must be a valid non-negative KES amount.');
      return;
    }

    if (category === 'transport' && (!purpose.trim() || !destination.trim() || !travelDate || !expenditureBreakdown.trim())) {
      setFormError('Transport imprest requires purpose of travel, destination, date of travel, and expenditure breakdown.');
      return;
    }
    if (category === 'pd' && (!pdActivity.trim() || !expenditureBreakdown.trim())) {
      setFormError('PD imprest requires the PD activity and expenditure breakdown.');
      return;
    }
    if (category === 'medical' && (!medicalPurpose.trim() || !expenditureDate || !expenditureDescription.trim())) {
      setFormError('Medical imprest requires medical purpose, date of expenditure, and expenditure description.');
      return;
    }

    const totalReceipts = existingSavedReceipts.length + queuedReceipts.length;
    if (targetStatus === 'submitted' && totalReceipts === 0 && !accountingSheetDataUrl) {
      setFormError('Upload at least one receipt (or PDF accounting sheet) before submitting.');
      return;
    }

    setSaving(true);
    const nowIso = new Date().toISOString();
    const refNo =
      editing?.referenceNo ||
      `IMP-${category.toUpperCase().slice(0, 3)}-${String(Math.floor(1000 + Math.random() * 9000))}`;

    const prevRevs = (() => {
      if (!editing?.revisionHistoryJson) return [];
      try {
        const parsed = JSON.parse(editing.revisionHistoryJson);
        return Array.isArray(parsed) ? parsed : [];
      } catch {
        return [];
      }
    })();

    const nextRevs = [
      ...prevRevs,
      {
        timestamp: nowIso,
        actor: profile.displayName,
        action: targetStatus === 'draft' ? 'Saved Draft' : editing?.status === 'returned' ? 'Revised & Resubmitted' : 'Submitted',
        amountReceivedKes: receivedNum,
        actualSpentKes: spentNum,
      },
    ].slice(-15);

    try {
      const retirementRef = editing
        ? doc(db, 'imprestRetirements', editing.id)
        : doc(collection(db, 'imprestRetirements'));

      // Never silently overwrite originalAmountReceivedKes once created
      const originalAmountReceivedKes = editing ? editing.originalAmountReceivedKes : receivedNum;

      const commonPayload = {
        imprestRecordId: linkedRecordId,
        amountReceivedKes: receivedNum,
        dateReceived,
        purpose: purpose.trim(),
        destination: destination.trim(),
        travelDate,
        pdActivity: pdActivity.trim(),
        medicalPurpose: medicalPurpose.trim(),
        expenditureDate,
        expenditureDescription: expenditureDescription.trim(),
        expenditureBreakdown: expenditureBreakdown.trim(),
        actualSpentKes: spentNum,
        unspentBalanceKes,
        additionalRequiredKes,
        comments: comments.trim(),
        accountingSheetName,
        accountingSheetDataUrl,
        receiptCount: totalReceipts,
        status: targetStatus,
        submittedAt: targetStatus === 'submitted' ? nowIso : editing?.submittedAt || '',
        revisionHistoryJson: JSON.stringify(nextRevs),
      };

      if (editing) {
        await updateDoc(retirementRef, {
          ...commonPayload,
          updatedAt: serverTimestamp(),
        });
      } else {
        await setDoc(retirementRef, {
          orgId: ORG_ID,
          referenceNo: refNo,
          apprenticeId: apprenticeRecord?.id || profile.uid,
          apprenticeUserId: profile.uid,
          apprenticeName: apprenticeRecord?.fullName || profile.displayName,
          category,
          originalAmountReceivedKes,
          ...commonPayload,
          isDemo: false,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }

      // Persist queued receipts individually
      for (const item of queuedReceipts) {
        const recRef = doc(collection(db, 'imprestReceipts'));
        await setDoc(recRef, {
          orgId: ORG_ID,
          retirementId: retirementRef.id,
          apprenticeUserId: profile.uid,
          category,
          docKind: item.docKind,
          fileName: item.fileName,
          mimeType: item.mimeType,
          fileSizeKb: item.fileSizeKb,
          dataUrl: item.dataUrl,
          createdAt: serverTimestamp(),
        });
      }

      await recordAuditLog({
        actorUid: profile.uid,
        actorName: profile.displayName,
        actorRole: profile.role,
        action: targetStatus === 'draft' ? 'SAVE_IMPREST_DRAFT' : 'SUBMIT_IMPREST_RETIREMENT',
        targetCollection: 'imprestRetirements',
        targetId: retirementRef.id,
        summary: `${targetStatus === 'draft' ? 'Saved draft' : 'Submitted'} ${category.toUpperCase()} imprest ${refNo} (${formatKes(spentNum)} spent of ${formatKes(receivedNum)})`,
      });

      if (targetStatus === 'submitted') {
        const financeManagers = directory.filter((d) => d.role === 'finance_officer');
        for (const fin of financeManagers.slice(0, 3)) {
          if (fin.uid !== profile.uid && !fin.uid.startsWith('demo_')) {
            await sendNotification({
              recipientUid: fin.uid,
              title: `Imprest Submitted (${category.toUpperCase()})`,
              message: `${profile.displayName} submitted ${refNo} for Finance review (${formatKes(spentNum)} spent).`,
              category: 'finance',
              linkModule: 'finance',
            });
          }
        }
      }

      setModalOpen(false);
      setNotice(
        targetStatus === 'draft'
          ? `Imprest draft ${refNo} saved.`
          : `Imprest retirement ${refNo} submitted to Finance Manager for review.`
      );
    } catch (err) {
      try {
        handleFirestoreError(err, editing ? OperationType.UPDATE : OperationType.CREATE, 'imprestRetirements');
      } catch (e2) {
        setFormError(e2 instanceof Error ? e2.message : 'Unable to save imprest retirement.');
      }
    } finally {
      setSaving(false);
    }
  };

  const columns: ColumnDef<ImprestRetirement>[] = [
    {
      key: 'ref',
      header: 'Reference & Category',
      sortable: true,
      sortValue: (r) => r.referenceNo,
      render: (r) => (
        <div>
          <div className="font-mono text-xs font-semibold text-slate-900">{r.referenceNo}</div>
          <div className="text-[11px] text-slate-500 capitalize flex items-center gap-1">
            {r.category === 'medical' && <Lock className="w-3 h-3 text-amber-700" />}
            <span>{r.category === 'pd' ? 'PD Imprest' : `${r.category} Imprest`}</span>
          </div>
        </div>
      ),
    },
    {
      key: 'amounts',
      header: 'Financial Reconciliation',
      render: (r) => (
        <div className="text-xs font-mono tabular-nums space-y-0.5">
          <div className="text-slate-900">
            Received: <span className="font-semibold">{formatKes(r.amountReceivedKes)}</span> ({r.dateReceived})
          </div>
          <div className="text-slate-600">
            Spent: {formatKes(r.actualSpentKes)} ·{' '}
            {r.additionalRequiredKes > 0 ? (
              <span className="text-amber-700 font-semibold">
                Add&apos;l Req: {formatKes(r.additionalRequiredKes)}
              </span>
            ) : (
              <span className="text-emerald-800 font-semibold">
                Unspent: {formatKes(r.unspentBalanceKes)}
              </span>
            )}
          </div>
        </div>
      ),
    },
    {
      key: 'comment',
      header: 'Finance Comments',
      render: (r) => (
        <span className="text-xs text-slate-600 line-clamp-2">
          {r.financeComment || 'Awaiting Finance review'}
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
      header: 'Actions',
      align: 'right',
      render: (r) => (
        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={() => setViewing(r)}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-slate-700 bg-white border border-stone-300 rounded-lg hover:bg-stone-50"
          >
            <Eye className="w-3.5 h-3.5" />
            Details
          </button>
          {(r.status === 'draft' || r.status === 'returned') && (
            <button
              type="button"
              onClick={() => openEdit(r)}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-white bg-[var(--brand-primary)] rounded-lg"
            >
              <Pencil className="w-3.5 h-3.5" />
              {r.status === 'returned' ? 'Correct' : 'Edit'}
            </button>
          )}
        </div>
      ),
    },
  ];

  const viewingReceipts = useMemo(
    () => (viewing ? imprestReceipts.filter((rec) => rec.retirementId === viewing.id) : []),
    [imprestReceipts, viewing]
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 font-display">Imprest Management</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Account for Transport, Personal Development (PD), and Medical imprests with supporting receipts
          </p>
        </div>
      </div>

      {notice && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-xs text-emerald-900">
          {notice}
        </div>
      )}

      {/* 3 Separate Category Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {(['transport', 'pd', 'medical'] as ImprestCategory[]).map((cat) => {
          const meta = CATEGORY_META[cat];
          const Icon = meta.Icon;
          const catRetirements = myRetirements.filter((r) => r.category === cat);
          const catIssued = myRecords.filter((rec) => rec.category === cat && rec.status === 'issued');
          const catTotalReceived = catRetirements.reduce((s, r) => s + r.amountReceivedKes, 0);
          const catTotalSpent = catRetirements.reduce((s, r) => s + r.actualSpentKes, 0);

          return (
            <div key={cat} className="bg-white border border-stone-200 rounded-xl p-5 flex flex-col justify-between space-y-4">
              <div className="space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="p-2 rounded-lg bg-stone-100 text-emerald-900">
                    <Icon className="w-5 h-5" />
                  </div>
                  {meta.confidential && (
                    <span className="inline-flex items-center gap-1 text-[11px] font-medium text-amber-800">
                      <Lock className="w-3 h-3" />
                      Finance & HR Only
                    </span>
                  )}
                </div>
                <div>
                  <h2 className="text-base font-semibold text-slate-900 font-display">{meta.title}</h2>
                  <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">{meta.subtitle}</p>
                </div>

                <div className="pt-2 border-t border-stone-100 grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <div className="text-slate-400">Submissions</div>
                    <div className="font-mono font-semibold text-slate-900 tabular-nums">
                      {catRetirements.length} ({catIssued.length} issued)
                    </div>
                  </div>
                  <div>
                    <div className="text-slate-400">Accounted / Received</div>
                    <div className="font-mono font-semibold text-slate-900 tabular-nums truncate">
                      {formatKes(catTotalSpent)} / {formatKes(catTotalReceived)}
                    </div>
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={() => openNewForCategory(cat)}
                className="w-full inline-flex items-center justify-center gap-1.5 px-4 py-2.5 text-xs font-semibold text-white bg-[var(--brand-primary)] hover:bg-[var(--brand-primary-hover)] rounded-lg min-h-[44px]"
              >
                <Plus className="w-4 h-4" />
                Submit {meta.title}
              </button>
            </div>
          );
        })}
      </div>

      {/* Finance-Issued Outstanding Imprests Linked to Apprentice */}
      {myRecords.filter((rec) => rec.status === 'issued').length > 0 && (
        <div className="bg-white border border-stone-200 rounded-xl p-5 space-y-3">
          <h3 className="text-sm font-semibold text-slate-900 font-display">
            Issued Imprests Awaiting Accounting
          </h3>
          <div className="divide-y divide-stone-100">
            {myRecords
              .filter((rec) => rec.status === 'issued')
              .map((rec) => (
                <div key={rec.id} className="py-3 flex flex-wrap items-center justify-between gap-3 text-xs">
                  <div className="space-y-0.5">
                    <div className="font-semibold text-slate-900">
                      <span className="font-mono">{rec.referenceNo}</span> ·{' '}
                      <span className="capitalize">{rec.category} Imprest</span>
                    </div>
                    <div className="text-slate-500">
                      {formatKes(rec.amountReceivedKes)} issued on {rec.dateReceived} — {rec.purpose}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => openNewForCategory(rec.category, rec)}
                    className="px-3.5 py-2 text-xs font-semibold text-white bg-[var(--brand-primary)] rounded-lg min-h-[40px]"
                  >
                    Retire This Imprest
                  </button>
                </div>
              ))}
          </div>
        </div>
      )}

      {/* Submission History Table */}
      <DataTable
        rows={myRetirements}
        columns={columns}
        rowKey={(r) => r.id}
        searchPlaceholder="Search imprest reference, purpose, or status..."
        searchFilter={(r, q) =>
          r.referenceNo.toLowerCase().includes(q) ||
          r.category.toLowerCase().includes(q) ||
          (r.purpose || r.medicalPurpose || r.pdActivity || '').toLowerCase().includes(q) ||
          r.status.toLowerCase().includes(q)
        }
        emptyTitle="No imprest accounting records submitted"
        emptyDescription="Select one of the three imprest categories above to save a draft or submit accounting documents."
      />

      {/* Imprest Create / Edit Modal */}
      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={
          editing
            ? `${editing.status === 'returned' ? 'Correct Returned' : 'Edit Draft'} ${CATEGORY_META[category].title}`
            : `Submit ${CATEGORY_META[category].title}`
        }
        subtitle="Original amount received is preserved for audit integrity"
        maxWidthClass="max-w-2xl"
      >
        <div className="space-y-4">
          {category === 'medical' && (
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg flex items-center gap-2 text-xs text-amber-900">
              <Lock className="w-4 h-4 shrink-0" />
              <span>
                Confidential Medical Document: Accessible only to you and specifically authorised Finance and HR personnel.
              </span>
            </div>
          )}

          {editing?.status === 'returned' && editing.financeComment && (
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-900">
              <strong>Finance Review Comment:</strong> {editing.financeComment}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Amount Received (KES) *</label>
              <input
                type="number"
                min="1"
                step="0.01"
                required
                value={amountReceived}
                onChange={(e) => setAmountReceived(e.target.value)}
                placeholder="e.g. 5000"
                className="w-full px-3 py-2 text-sm font-mono border border-stone-300 rounded-lg min-h-[42px]"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Date Received *</label>
              <input
                type="date"
                required
                value={dateReceived}
                onChange={(e) => setDateReceived(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-stone-300 rounded-lg min-h-[42px]"
              />
            </div>
          </div>

          {category === 'transport' && (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Purpose of Travel *</label>
                  <input
                    type="text"
                    required
                    maxLength={600}
                    value={purpose}
                    onChange={(e) => setPurpose(e.target.value)}
                    placeholder="e.g. Regional campus outreach"
                    className="w-full px-3 py-2 text-sm border border-stone-300 rounded-lg min-h-[42px]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Travel Destination *</label>
                  <input
                    type="text"
                    required
                    maxLength={200}
                    value={destination}
                    onChange={(e) => setDestination(e.target.value)}
                    placeholder="e.g. Nakuru"
                    className="w-full px-3 py-2 text-sm border border-stone-300 rounded-lg min-h-[42px]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Date of Travel *</label>
                  <input
                    type="date"
                    required
                    value={travelDate}
                    onChange={(e) => setTravelDate(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-stone-300 rounded-lg min-h-[42px]"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Expenditure Breakdown *</label>
                <textarea
                  rows={3}
                  required
                  maxLength={2500}
                  value={expenditureBreakdown}
                  onChange={(e) => setExpenditureBreakdown(e.target.value)}
                  placeholder="Itemise shuttle fare, local matatu, meals, etc. with KES amounts"
                  className="w-full px-3 py-2 text-sm border border-stone-300 rounded-lg"
                />
              </div>
            </>
          )}

          {category === 'pd' && (
            <>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">PD Activity *</label>
                <input
                  type="text"
                  required
                  maxLength={400}
                  value={pdActivity}
                  onChange={(e) => setPdActivity(e.target.value)}
                  placeholder="e.g. Partnership development conference / donor visits"
                  className="w-full px-3 py-2 text-sm border border-stone-300 rounded-lg min-h-[42px]"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Expenditure Breakdown *</label>
                <textarea
                  rows={3}
                  required
                  maxLength={2500}
                  value={expenditureBreakdown}
                  onChange={(e) => setExpenditureBreakdown(e.target.value)}
                  placeholder="Break down each PD expense line item and amount..."
                  className="w-full px-3 py-2 text-sm border border-stone-300 rounded-lg"
                />
              </div>
            </>
          )}

          {category === 'medical' && (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Medical Purpose *</label>
                  <input
                    type="text"
                    required
                    maxLength={400}
                    value={medicalPurpose}
                    onChange={(e) => setMedicalPurpose(e.target.value)}
                    placeholder="e.g. Outpatient consultation & prescription"
                    className="w-full px-3 py-2 text-sm border border-stone-300 rounded-lg min-h-[42px]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Date of Expenditure *</label>
                  <input
                    type="date"
                    required
                    value={expenditureDate}
                    onChange={(e) => setExpenditureDate(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-stone-300 rounded-lg min-h-[42px]"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Expenditure Description *</label>
                <textarea
                  rows={3}
                  required
                  maxLength={1500}
                  value={expenditureDescription}
                  onChange={(e) => setExpenditureDescription(e.target.value)}
                  placeholder="Describe clinic visit, pharmacy items, or medical service covered..."
                  className="w-full px-3 py-2 text-sm border border-stone-300 rounded-lg"
                />
              </div>
            </>
          )}

          {/* Actual Spent + Live Calculation */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 items-end bg-stone-50 border border-stone-200 rounded-lg p-3.5">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Actual Amount Spent (KES) *</label>
              <input
                type="number"
                min="0"
                step="0.01"
                required
                value={actualSpent}
                onChange={(e) => setActualSpent(e.target.value)}
                placeholder="0.00"
                className="w-full px-3 py-2 text-sm font-mono border border-stone-300 rounded-lg bg-white min-h-[42px]"
              />
            </div>
            <div>
              <div className="text-xs text-slate-500">Unspent Balance (Received − Spent)</div>
              <div className="text-base font-bold font-mono text-emerald-800 tabular-nums mt-1">
                {formatKes(unspentBalanceKes)}
              </div>
            </div>
            <div>
              <div className="text-xs text-slate-500">Additional Amount Required</div>
              <div
                className={`text-base font-bold font-mono tabular-nums mt-1 ${
                  additionalRequiredKes > 0 ? 'text-amber-700' : 'text-slate-400'
                }`}
              >
                {formatKes(additionalRequiredKes)}
              </div>
            </div>
          </div>

          {/* Uploads */}
          <div className="space-y-3">
            {category === 'transport' && (
              <div className="p-3 border border-stone-200 rounded-lg space-y-2">
                <div className="text-xs font-medium text-slate-700">Upload Accounting Sheet (PDF)</div>
                <label className="inline-flex items-center gap-2 px-3 py-2 text-xs font-medium text-emerald-900 bg-emerald-50 border border-emerald-200 rounded-lg cursor-pointer min-h-[40px]">
                  <FileText className="w-3.5 h-3.5" />
                  <span>{accountingSheetName || 'Upload Accounting Sheet PDF'}</span>
                  <input
                    type="file"
                    accept="application/pdf,.pdf"
                    className="hidden"
                    onChange={(e) => {
                      void handleAccountingSheetUpload(e.target.files?.[0]);
                      e.currentTarget.value = '';
                    }}
                  />
                </label>
              </div>
            )}

            <div className="p-3 border border-stone-200 rounded-lg space-y-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs font-medium text-slate-700">
                  {category === 'transport'
                    ? 'Receipt Uploads (JPG, JPEG, PNG — Multiple Allowed)'
                    : category === 'pd'
                      ? 'Supporting Receipts & Additional Documents (PDF, JPG, PNG)'
                      : 'Supporting Medical Receipts (PDF, JPG, PNG)'}
                </span>
                <div className="flex flex-wrap gap-2">
                  <label className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-stone-50 hover:bg-stone-100 border border-stone-300 rounded-lg cursor-pointer min-h-[38px]">
                    <Upload className="w-3.5 h-3.5" />
                    Add Receipt(s)
                    <input
                      type="file"
                      multiple
                      accept={category === 'transport' ? 'image/jpeg,image/png' : 'application/pdf,image/jpeg,image/png'}
                      className="hidden"
                      onChange={(e) => {
                        void handleMultiReceiptUpload(e.target.files, 'receipt');
                        e.currentTarget.value = '';
                      }}
                    />
                  </label>
                  {category === 'pd' && (
                    <label className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-stone-50 hover:bg-stone-100 border border-stone-300 rounded-lg cursor-pointer min-h-[38px]">
                      <Paperclip className="w-3.5 h-3.5" />
                      Add Supporting Doc
                      <input
                        type="file"
                        multiple
                        accept="application/pdf,image/jpeg,image/png"
                        className="hidden"
                        onChange={(e) => {
                          void handleMultiReceiptUpload(e.target.files, 'supporting');
                          e.currentTarget.value = '';
                        }}
                      />
                    </label>
                  )}
                </div>
              </div>

              {(existingSavedReceipts.length > 0 || queuedReceipts.length > 0) && (
                <div className="divide-y divide-stone-100 border border-stone-200 rounded-lg text-xs">
                  {existingSavedReceipts.map((r) => (
                    <div key={r.id} className="px-3 py-2 flex items-center justify-between gap-2">
                      <span className="font-mono text-slate-800 truncate">{r.fileName}</span>
                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          type="button"
                          onClick={() =>
                            setPreviewDoc({
                              title: r.fileName,
                              fileName: r.fileName,
                              mimeType: r.mimeType,
                              dataUrl: r.dataUrl,
                            })
                          }
                          className="text-emerald-800 hover:underline"
                        >
                          Preview
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleDeleteSavedReceipt(r)}
                          className="text-red-600 hover:text-red-800"
                          aria-label="Remove receipt"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                  {queuedReceipts.map((r, idx) => (
                    <div key={`${r.fileName}-${idx}`} className="px-3 py-2 flex items-center justify-between gap-2 bg-emerald-50/40">
                      <span className="font-mono text-slate-800 truncate">
                        {r.fileName} ({r.fileSizeKb} KB · Ready)
                      </span>
                      <button
                        type="button"
                        onClick={() => setQueuedReceipts((prev) => prev.filter((_, i) => i !== idx))}
                        className="text-red-600 hover:text-red-800 shrink-0"
                        aria-label="Remove queued file"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Comments (Optional)</label>
            <textarea
              rows={2}
              maxLength={1500}
              value={comments}
              onChange={(e) => setComments(e.target.value)}
              placeholder="Additional notes for Finance reconciliation..."
              className="w-full px-3 py-2 text-sm border border-stone-300 rounded-lg"
            />
          </div>

          {formError && <p className="text-xs text-red-700">{formError}</p>}

          <div className="flex flex-wrap justify-end gap-3 pt-2 border-t border-stone-100">
            <button
              type="button"
              onClick={() => setModalOpen(false)}
              className="px-4 py-2 text-sm font-medium text-slate-700 border border-stone-300 rounded-lg min-h-[40px]"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={() => void saveImprest('draft')}
              className="px-4 py-2 text-sm font-medium text-slate-800 bg-stone-100 hover:bg-stone-200 border border-stone-300 rounded-lg disabled:opacity-60 min-h-[40px]"
            >
              Save Draft
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={() => void saveImprest('submitted')}
              className="px-4 py-2 text-sm font-semibold text-white bg-[var(--brand-primary)] hover:bg-[var(--brand-primary-hover)] rounded-lg disabled:opacity-60 min-h-[40px]"
            >
              {saving ? 'Submitting...' : 'Submit Accounting'}
            </button>
          </div>
        </div>
      </Modal>

      {/* Imprest Detail Modal */}
      <Modal
        open={Boolean(viewing)}
        onClose={() => setViewing(null)}
        title={viewing ? `${viewing.referenceNo} — ${CATEGORY_META[viewing.category].title}` : 'Imprest Details'}
        subtitle={viewing ? `Date received: ${viewing.dateReceived}` : ''}
        maxWidthClass="max-w-2xl"
      >
        {viewing && (
          <div className="space-y-4 text-xs">
            <div className="flex items-center justify-between pb-3 border-b border-stone-200">
              <StatusText status={viewing.status} />
              {viewing.settledBy && (
                <span className="text-emerald-800 font-medium">Settled by {viewing.settledBy}</span>
              )}
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-stone-50 border border-stone-200 rounded-lg p-3 font-mono tabular-nums">
              <div>
                <div className="text-slate-400">Original Received</div>
                <div className="font-semibold text-slate-900">{formatKes(viewing.originalAmountReceivedKes)}</div>
              </div>
              <div>
                <div className="text-slate-400">Actual Spent</div>
                <div className="font-semibold text-slate-900">{formatKes(viewing.actualSpentKes)}</div>
              </div>
              <div>
                <div className="text-slate-400">Unspent Balance</div>
                <div className="font-semibold text-emerald-800">{formatKes(viewing.unspentBalanceKes)}</div>
              </div>
              <div>
                <div className="text-slate-400">Additional Required</div>
                <div className="font-semibold text-amber-700">{formatKes(viewing.additionalRequiredKes)}</div>
              </div>
            </div>

            <div className="p-3 border border-stone-200 rounded-lg space-y-1.5">
              {viewing.purpose && (
                <div>
                  <span className="font-semibold text-slate-700">Purpose:</span> {viewing.purpose}
                </div>
              )}
              {viewing.destination && (
                <div>
                  <span className="font-semibold text-slate-700">Destination:</span> {viewing.destination} ({viewing.travelDate})
                </div>
              )}
              {viewing.pdActivity && (
                <div>
                  <span className="font-semibold text-slate-700">PD Activity:</span> {viewing.pdActivity}
                </div>
              )}
              {viewing.medicalPurpose && (
                <div>
                  <span className="font-semibold text-slate-700">Medical Purpose:</span> {viewing.medicalPurpose} ({viewing.expenditureDate})
                </div>
              )}
              {(viewing.expenditureBreakdown || viewing.expenditureDescription) && (
                <p className="text-slate-600 whitespace-pre-wrap pt-1">
                  {viewing.expenditureBreakdown || viewing.expenditureDescription}
                </p>
              )}
              {viewing.comments && (
                <div className="text-slate-500 pt-1">Notes: {viewing.comments}</div>
              )}
            </div>

            {viewing.accountingSheetDataUrl && (
              <button
                type="button"
                onClick={() =>
                  setPreviewDoc({
                    title: `Accounting Sheet — ${viewing.referenceNo}`,
                    fileName: viewing.accountingSheetName || 'accounting_sheet.pdf',
                    mimeType: 'application/pdf',
                    dataUrl: viewing.accountingSheetDataUrl!,
                  })
                }
                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-white bg-[var(--brand-primary)] rounded-lg"
              >
                <FileText className="w-3.5 h-3.5" />
                View Accounting Sheet PDF
              </button>
            )}

            <div className="space-y-1.5">
              <div className="font-semibold text-slate-800">Attached Receipts ({viewingReceipts.length})</div>
              {viewingReceipts.length === 0 ? (
                <p className="text-slate-500">No individual receipt files attached.</p>
              ) : (
                <div className="divide-y divide-stone-100 border border-stone-200 rounded-lg">
                  {viewingReceipts.map((rec) => (
                    <div key={rec.id} className="px-3 py-2 flex items-center justify-between gap-2">
                      <span className="font-mono text-slate-800 truncate">{rec.fileName}</span>
                      <button
                        type="button"
                        onClick={() =>
                          setPreviewDoc({
                            title: `Receipt — ${rec.fileName}`,
                            fileName: rec.fileName,
                            mimeType: rec.mimeType,
                            dataUrl: rec.dataUrl,
                          })
                        }
                        className="text-emerald-800 font-medium hover:underline shrink-0"
                      >
                        Preview / Download
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {viewing.financeComment && (
              <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg space-y-1">
                <div className="font-semibold text-emerald-950">
                  Finance Review {viewing.reviewedBy ? `(${viewing.reviewedBy})` : ''}
                </div>
                <p className="text-emerald-900 whitespace-pre-wrap">{viewing.financeComment}</p>
              </div>
            )}
          </div>
        )}
      </Modal>

      {previewDoc && (
        <AttachmentPreviewModal
          open={Boolean(previewDoc)}
          onClose={() => setPreviewDoc(null)}
          title={previewDoc.title}
          fileName={previewDoc.fileName}
          mimeType={previewDoc.mimeType}
          dataUrl={previewDoc.dataUrl}
        />
      )}
    </div>
  );
}
