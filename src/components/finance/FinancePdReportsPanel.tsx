import React, { useMemo, useState } from 'react';
import { collection, doc, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';
import { Upload, Eye, Download, RefreshCw, FileText, Users } from 'lucide-react';
import { ORG_ID, db } from '../../lib/firebase.ts';
import { OperationType, handleFirestoreError } from '../../lib/firestoreError.ts';
import { recordAuditLog, sendNotification } from '../../lib/audit.ts';
import { ProcessedUpload, processDocumentUpload, triggerDataUrlDownload } from '../../lib/fileUpload.ts';
import { useAuth } from '../../context/AuthContext.tsx';
import { useData } from '../../context/DataContext.tsx';
import { DataTable, ColumnDef } from '../ui/DataTable.tsx';
import { Modal } from '../ui/Modal.tsx';
import { StatusText } from '../ui/StatusText.tsx';
import { AttachmentPreviewModal } from '../apprentice/AttachmentPreviewModal.tsx';
import { MonthlyPdReport, formatNairobiDate } from '../../types/erp.ts';

const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

function parseVersions(json?: string): { version: number; fileName: string; publishedDate: string; uploadedByName: string; note?: string }[] {
  if (!json) return [];
  try {
    const parsed = JSON.parse(json);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function FinancePdReportsPanel() {
  const { profile, effectiveRole } = useAuth();
  const { apprentices, monthlyPdReports } = useData();

  const now = new Date();
  const [filterMonth, setFilterMonth] = useState<string>('all');
  const [filterYear, setFilterYear] = useState<string>(String(now.getFullYear()));
  const [publishModalOpen, setPublishModalOpen] = useState(false);
  const [replacingReport, setReplacingReport] = useState<MonthlyPdReport | null>(null);
  const [viewingReport, setViewingReport] = useState<MonthlyPdReport | null>(null);

  // Publish form
  const [batchMode, setBatchMode] = useState(false);
  const [singleApprenticeId, setSingleApprenticeId] = useState('');
  const [selectedApprenticeIds, setSelectedApprenticeIds] = useState<string[]>([]);
  const [reportMonth, setReportMonth] = useState<number>(now.getMonth() + 1);
  const [reportYear, setReportYear] = useState<number>(now.getFullYear());
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [publishedDate, setPublishedDate] = useState(now.toISOString().slice(0, 10));
  const [uploadedPdf, setUploadedPdf] = useState<ProcessedUpload | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const canPublish = [
    'super_admin',
    'executive_director',
    'senior_management',
    'finance_officer',
  ].includes(effectiveRole);

  const filteredReports = useMemo(() => {
    return monthlyPdReports.filter((r) => {
      if (filterYear !== 'all' && String(r.reportYear) !== filterYear) return false;
      if (filterMonth !== 'all' && String(r.reportMonth) !== filterMonth) return false;
      return true;
    });
  }, [monthlyPdReports, filterMonth, filterYear]);

  const years = useMemo(() => {
    const set = new Set<number>([now.getFullYear(), now.getFullYear() - 1]);
    monthlyPdReports.forEach((r) => set.add(r.reportYear));
    return Array.from(set).sort((a, b) => b - a);
  }, [monthlyPdReports, now]);

  const openNewPublish = () => {
    setReplacingReport(null);
    setBatchMode(false);
    setSingleApprenticeId('');
    setSelectedApprenticeIds([]);
    setReportMonth(now.getMonth() + 1);
    setReportYear(now.getFullYear());
    setTitle(`Monthly PD Report — ${MONTH_NAMES[now.getMonth()]} ${now.getFullYear()}`);
    setDescription('');
    setPublishedDate(now.toISOString().slice(0, 10));
    setUploadedPdf(null);
    setFormError(null);
    setPublishModalOpen(true);
  };

  const openReplaceReport = (rep: MonthlyPdReport) => {
    setReplacingReport(rep);
    setBatchMode(false);
    setSingleApprenticeId(rep.apprenticeId);
    setSelectedApprenticeIds([]);
    setReportMonth(rep.reportMonth);
    setReportYear(rep.reportYear);
    setTitle(rep.title);
    setDescription(rep.description || '');
    setPublishedDate(new Date().toISOString().slice(0, 10));
    setUploadedPdf(null);
    setFormError(null);
    setPublishModalOpen(true);
  };

  const toggleBatchApprentice = (id: string) => {
    setSelectedApprenticeIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setFormError(null);
    try {
      const processed = await processDocumentUpload(file, {
        allowPdf: true,
        allowImages: false,
        maxDataUrlLength: 720000,
      });
      setUploadedPdf(processed);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Unable to load PDF.');
    }
  };

  const handlePublish = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile || !canPublish) return;
    setFormError(null);
    setNotice(null);

    if (!uploadedPdf) {
      setFormError('Upload the Monthly PD Report PDF document.');
      return;
    }
    const cleanTitle = title.trim();
    if (cleanTitle.length < 2) {
      setFormError('Report title must be at least 2 characters.');
      return;
    }

    const targetApprentices = replacingReport
      ? [
          apprentices.find((a) => a.id === replacingReport.apprenticeId) || {
            id: replacingReport.apprenticeId,
            userId: replacingReport.apprenticeUserId,
            fullName: replacingReport.apprenticeName,
            apprenticeCode: replacingReport.apprenticeCode || '',
          },
        ]
      : batchMode
        ? apprentices.filter((a) => selectedApprenticeIds.includes(a.id))
        : apprentices.filter((a) => a.id === singleApprenticeId);

    if (targetApprentices.length === 0) {
      setFormError('Select at least one apprentice to publish this PD report.');
      return;
    }

    const periodKey = `${reportYear}-${String(reportMonth).padStart(2, '0')}`;
    setSaving(true);
    let publishedCount = 0;

    try {
      for (const app of targetApprentices) {
        const existing =
          replacingReport ||
          monthlyPdReports.find(
            (r) =>
              r.apprenticeUserId === app.userId &&
              r.reportMonth === reportMonth &&
              r.reportYear === reportYear
          );

        if (existing) {
          const prevVersions = parseVersions(existing.versionHistoryJson);
          const nextHistory = [
            ...prevVersions,
            {
              version: existing.version,
              fileName: existing.fileName,
              publishedDate: existing.publishedDate,
              uploadedByName: existing.uploadedByName,
              note: 'Replaced by updated PD report',
            },
          ].slice(-12);

          await updateDoc(doc(db, 'monthlyPdReports', existing.id), {
            title: cleanTitle,
            description: description.trim(),
            publishedDate,
            fileName: uploadedPdf.fileName,
            fileSizeKb: uploadedPdf.fileSizeKb,
            pdfDataUrl: uploadedPdf.dataUrl,
            version: existing.version + 1,
            versionHistoryJson: JSON.stringify(nextHistory),
            uploadedBy: profile.uid,
            uploadedByName: profile.displayName,
            status: 'published',
            updatedAt: serverTimestamp(),
          });

          await recordAuditLog({
            actorUid: profile.uid,
            actorName: profile.displayName,
            actorRole: effectiveRole,
            action: 'UPDATE_MONTHLY_PD_REPORT',
            targetCollection: 'monthlyPdReports',
            targetId: existing.id,
            summary: `Updated Monthly PD Report v${existing.version + 1} for ${app.fullName} (${periodKey})`,
          });
        } else {
          const ref = doc(collection(db, 'monthlyPdReports'));
          await setDoc(ref, {
            orgId: ORG_ID,
            apprenticeId: app.id,
            apprenticeUserId: app.userId,
            apprenticeName: app.fullName,
            apprenticeCode: app.apprenticeCode || '',
            reportMonth,
            reportYear,
            periodKey,
            title: cleanTitle,
            description: description.trim(),
            publishedDate,
            fileName: uploadedPdf.fileName,
            fileSizeKb: uploadedPdf.fileSizeKb,
            pdfDataUrl: uploadedPdf.dataUrl,
            version: 1,
            versionHistoryJson: '[]',
            uploadedBy: profile.uid,
            uploadedByName: profile.displayName,
            status: 'published',
            isDemo: false,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });

          await recordAuditLog({
            actorUid: profile.uid,
            actorName: profile.displayName,
            actorRole: effectiveRole,
            action: 'PUBLISH_MONTHLY_PD_REPORT',
            targetCollection: 'monthlyPdReports',
            targetId: ref.id,
            summary: `Published Monthly PD Report for ${app.fullName} (${periodKey})`,
          });
        }

        if (app.userId && app.userId !== profile.uid && !app.userId.startsWith('demo_')) {
          await sendNotification({
            recipientUid: app.userId,
            title: `Monthly PD Report Published (${MONTH_NAMES[reportMonth - 1]} ${reportYear})`,
            message: `${profile.displayName} published "${cleanTitle}". Open My PD Reports to view or download your statement.`,
            category: 'finance',
            linkModule: 'apprenticeship',
          });
        }
        publishedCount += 1;
      }

      setPublishModalOpen(false);
      setNotice(
        `Published Monthly PD Report for ${publishedCount} apprentice${publishedCount === 1 ? '' : 's'} (${MONTH_NAMES[reportMonth - 1]} ${reportYear}).`
      );
    } catch (err) {
      try {
        handleFirestoreError(err, OperationType.CREATE, 'monthlyPdReports');
      } catch (e2) {
        setFormError(e2 instanceof Error ? e2.message : 'Unable to publish Monthly PD Report.');
      }
    } finally {
      setSaving(false);
    }
  };

  const columns: ColumnDef<MonthlyPdReport>[] = [
    {
      key: 'apprentice',
      header: 'Apprentice',
      sortable: true,
      sortValue: (r) => r.apprenticeName,
      render: (r) => (
        <div>
          <div className="font-medium text-slate-900">{r.apprenticeName}</div>
          <div className="font-mono text-xs text-slate-500">{r.apprenticeCode || r.apprenticeId}</div>
        </div>
      ),
    },
    {
      key: 'period',
      header: 'Period',
      sortable: true,
      sortValue: (r) => r.periodKey,
      render: (r) => (
        <span className="text-xs font-medium text-slate-800">
          {MONTH_NAMES[(r.reportMonth || 1) - 1]} {r.reportYear}
        </span>
      ),
    },
    {
      key: 'title',
      header: 'Report Title & File',
      render: (r) => (
        <div className="text-xs max-w-xs">
          <div className="font-medium text-slate-900 truncate">{r.title}</div>
          <div className="text-slate-500 truncate">
            {r.fileName} · v{r.version}
          </div>
        </div>
      ),
    },
    {
      key: 'published',
      header: 'Published',
      render: (r) => (
        <div className="text-xs">
          <div className="font-mono text-slate-700">{formatNairobiDate(r.publishedDate)}</div>
          <div className="text-slate-400">By {r.uploadedByName}</div>
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (r) => <StatusText status={r.status} />,
    },
    {
      key: 'actions',
      header: 'Actions',
      align: 'right',
      render: (r) => (
        <div className="flex items-center justify-end gap-1.5">
          <button
            type="button"
            onClick={() => setViewingReport(r)}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-slate-700 bg-white border border-stone-300 rounded-lg hover:bg-stone-50"
          >
            <Eye className="w-3.5 h-3.5" />
            View
          </button>
          <button
            type="button"
            onClick={() => triggerDataUrlDownload(r.pdfDataUrl, r.fileName)}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-slate-700 bg-white border border-stone-300 rounded-lg hover:bg-stone-50"
            title="Download PDF"
          >
            <Download className="w-3.5 h-3.5" />
          </button>
          {canPublish && (
            <button
              type="button"
              onClick={() => openReplaceReport(r)}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-emerald-900 bg-emerald-50 border border-emerald-200 rounded-lg hover:bg-emerald-100"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Replace
            </button>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-slate-900 font-display">
            Apprentice Monthly PD Reports
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Upload and publish individual or batch monthly Personal Development (PD) financial PDF reports for apprentices
          </p>
        </div>

        {canPublish && (
          <button
            type="button"
            onClick={openNewPublish}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-[var(--brand-primary)] hover:bg-[var(--brand-primary-hover)] rounded-lg min-h-[40px]"
          >
            <Upload className="w-3.5 h-3.5" />
            Publish Monthly PD Report
          </button>
        )}
      </div>

      {notice && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-xs text-emerald-900">
          {notice}
        </div>
      )}

      {/* Filter Bar */}
      <div className="flex flex-wrap items-center gap-3">
        <select
          value={filterMonth}
          onChange={(e) => setFilterMonth(e.target.value)}
          className="px-3 py-1.5 text-xs bg-white border border-stone-300 rounded-lg min-h-[38px]"
        >
          <option value="all">All Months</option>
          {MONTH_NAMES.map((name, idx) => (
            <option key={name} value={String(idx + 1)}>
              {name}
            </option>
          ))}
        </select>
        <select
          value={filterYear}
          onChange={(e) => setFilterYear(e.target.value)}
          className="px-3 py-1.5 text-xs bg-white border border-stone-300 rounded-lg min-h-[38px]"
        >
          <option value="all">All Years</option>
          {years.map((y) => (
            <option key={y} value={String(y)}>
              {y}
            </option>
          ))}
        </select>
      </div>

      <DataTable
        rows={filteredReports}
        columns={columns}
        rowKey={(r) => r.id}
        searchPlaceholder="Search by apprentice name, code, or report title..."
        searchFilter={(r, q) =>
          r.apprenticeName.toLowerCase().includes(q) ||
          (r.apprenticeCode || '').toLowerCase().includes(q) ||
          r.title.toLowerCase().includes(q)
        }
        emptyTitle="No Monthly PD Reports published for this filter"
        emptyDescription="Use Publish Monthly PD Report to upload PDF statements for one or more apprentices."
      />

      {/* Publish / Replace Modal */}
      <Modal
        open={publishModalOpen}
        onClose={() => setPublishModalOpen(false)}
        title={replacingReport ? `Replace Monthly PD Report (v${replacingReport.version + 1})` : 'Publish Monthly PD Report'}
        subtitle={
          replacingReport
            ? `${replacingReport.apprenticeName} · ${MONTH_NAMES[replacingReport.reportMonth - 1]} ${replacingReport.reportYear}`
            : 'Apprentices receive automatic portal notifications once published'
        }
        maxWidthClass="max-w-xl"
      >
        <form onSubmit={(e) => void handlePublish(e)} className="space-y-4">
          {!replacingReport && (
            <div className="flex items-center justify-between p-3 bg-stone-50 border border-stone-200 rounded-lg">
              <div className="flex items-center gap-2 text-xs font-medium text-slate-800">
                <Users className="w-4 h-4 text-emerald-800" />
                Distribution Mode
              </div>
              <div className="flex items-center gap-2 text-xs">
                <button
                  type="button"
                  onClick={() => setBatchMode(false)}
                  className={`px-2.5 py-1 rounded-md font-medium ${
                    !batchMode ? 'bg-white border border-stone-300 text-slate-900 shadow-sm' : 'text-slate-600'
                  }`}
                >
                  Single Apprentice
                </button>
                <button
                  type="button"
                  onClick={() => setBatchMode(true)}
                  className={`px-2.5 py-1 rounded-md font-medium ${
                    batchMode ? 'bg-white border border-stone-300 text-slate-900 shadow-sm' : 'text-slate-600'
                  }`}
                >
                  Batch Multi-Select
                </button>
              </div>
            </div>
          )}

          {!replacingReport && !batchMode && (
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Select Apprentice *</label>
              <select
                required
                value={singleApprenticeId}
                onChange={(e) => setSingleApprenticeId(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-stone-300 rounded-lg min-h-[42px]"
              >
                <option value="">Choose apprentice...</option>
                {apprentices.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.apprenticeCode} — {a.fullName}
                  </option>
                ))}
              </select>
            </div>
          )}

          {!replacingReport && batchMode && (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <label className="font-medium text-slate-700">
                  Select Apprentices ({selectedApprenticeIds.length} selected) *
                </label>
                <button
                  type="button"
                  onClick={() =>
                    setSelectedApprenticeIds(
                      selectedApprenticeIds.length === apprentices.length ? [] : apprentices.map((a) => a.id)
                    )
                  }
                  className="text-emerald-800 font-medium hover:underline"
                >
                  {selectedApprenticeIds.length === apprentices.length ? 'Clear All' : 'Select All'}
                </button>
              </div>
              <div className="max-h-40 overflow-y-auto border border-stone-300 rounded-lg divide-y divide-stone-100">
                {apprentices.map((a) => (
                  <label key={a.id} className="flex items-center gap-2.5 px-3 py-2 text-xs hover:bg-stone-50 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={selectedApprenticeIds.includes(a.id)}
                      onChange={() => toggleBatchApprentice(a.id)}
                    />
                    <span className="font-mono text-slate-500">{a.apprenticeCode}</span>
                    <span className="font-medium text-slate-900">{a.fullName}</span>
                  </label>
                ))}
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Report Month *</label>
              <select
                disabled={Boolean(replacingReport)}
                value={reportMonth}
                onChange={(e) => {
                  const m = Number(e.target.value);
                  setReportMonth(m);
                  if (!replacingReport) {
                    setTitle(`Monthly PD Report — ${MONTH_NAMES[m - 1]} ${reportYear}`);
                  }
                }}
                className="w-full px-3 py-2 text-sm border border-stone-300 rounded-lg min-h-[42px]"
              >
                {MONTH_NAMES.map((name, idx) => (
                  <option key={name} value={idx + 1}>
                    {name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Report Year *</label>
              <input
                type="number"
                disabled={Boolean(replacingReport)}
                min={2020}
                max={2100}
                required
                value={reportYear}
                onChange={(e) => setReportYear(Number(e.target.value))}
                className="w-full px-3 py-2 text-sm font-mono border border-stone-300 rounded-lg min-h-[42px]"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Publication Date *</label>
              <input
                type="date"
                required
                value={publishedDate}
                onChange={(e) => setPublishedDate(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-stone-300 rounded-lg min-h-[42px]"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Report Title *</label>
            <input
              type="text"
              required
              maxLength={200}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-stone-300 rounded-lg min-h-[42px]"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Description / Finance Notes</label>
            <textarea
              rows={2}
              maxLength={2000}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Summary of personal development funds, receipts reconciled, or balance carried forward..."
              className="w-full px-3 py-2 text-sm border border-stone-300 rounded-lg"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Upload PD Report PDF *</label>
            <div className="flex flex-wrap items-center gap-3">
              <label className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-medium text-slate-800 bg-stone-50 hover:bg-stone-100 border border-stone-300 rounded-lg cursor-pointer min-h-[40px]">
                <FileText className="w-4 h-4 text-emerald-800" />
                {uploadedPdf ? 'Replace PDF File' : 'Select PDF File'}
                <input
                  type="file"
                  accept="application/pdf,.pdf"
                  onChange={(e) => void handleFileChange(e)}
                  className="sr-only"
                />
              </label>
              {uploadedPdf && (
                <span className="text-xs text-emerald-800 font-medium">
                  {uploadedPdf.fileName} ({uploadedPdf.fileSizeKb} KB)
                </span>
              )}
            </div>
          </div>

          {formError && <p className="text-xs text-red-700">{formError}</p>}

          <div className="flex justify-end gap-2 pt-2 border-t border-stone-100">
            <button
              type="button"
              onClick={() => setPublishModalOpen(false)}
              className="px-4 py-2 text-sm border border-stone-300 rounded-lg"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 text-sm font-semibold text-white bg-[var(--brand-primary)] hover:bg-[var(--brand-primary-hover)] rounded-lg disabled:opacity-60"
            >
              {saving ? 'Publishing...' : replacingReport ? 'Update & Republish' : 'Publish Report'}
            </button>
          </div>
        </form>
      </Modal>

      <AttachmentPreviewModal
        open={Boolean(viewingReport)}
        onClose={() => setViewingReport(null)}
        title={viewingReport?.title || 'Monthly PD Report'}
        fileName={viewingReport?.fileName || 'pd-report.pdf'}
        mimeType="application/pdf"
        dataUrl={viewingReport?.pdfDataUrl || ''}
      />
    </div>
  );
}
