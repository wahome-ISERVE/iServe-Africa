import React, { useEffect, useMemo, useState } from 'react';
import { collection, doc, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';
import { Plus, Star, Upload, FileText, Pencil, Eye, Paperclip } from 'lucide-react';
import { ORG_ID, db } from '../../lib/firebase.ts';
import { OperationType, handleFirestoreError } from '../../lib/firestoreError.ts';
import { recordAuditLog, sendNotification } from '../../lib/audit.ts';
import { processDocumentUpload } from '../../lib/fileUpload.ts';
import { useAuth } from '../../context/AuthContext.tsx';
import { useData } from '../../context/DataContext.tsx';
import { DataTable, ColumnDef } from '../ui/DataTable.tsx';
import { Modal } from '../ui/Modal.tsx';
import { StatusText } from '../ui/StatusText.tsx';
import { AttachmentPreviewModal } from './AttachmentPreviewModal.tsx';
import { Apprentice, BookReview, formatNairobiDateTime } from '../../types/erp.ts';

interface BookReviewsSectionProps {
  apprenticeRecord: Apprentice | null;
  autoOpenNew?: boolean;
  onConsumeAutoOpen?: () => void;
}

export function BookReviewsSection({
  apprenticeRecord,
  autoOpenNew,
  onConsumeAutoOpen,
}: BookReviewsSectionProps) {
  const { profile } = useAuth();
  const { bookReviews, directory } = useData();

  const [tab, setTab] = useState<'all' | 'draft' | 'submitted' | 'approved'>('all');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<BookReview | null>(null);
  const [viewing, setViewing] = useState<BookReview | null>(null);
  const [previewDoc, setPreviewDoc] = useState<{
    title: string;
    fileName: string;
    mimeType?: string;
    dataUrl: string;
  } | null>(null);

  const [bookTitle, setBookTitle] = useState('');
  const [author, setAuthor] = useState('');
  const [dateCompleted, setDateCompleted] = useState(new Date().toISOString().slice(0, 10));
  const [summary, setSummary] = useState('');
  const [lessonsLearned, setLessonsLearned] = useState('');
  const [overallReview, setOverallReview] = useState('');
  const [rating, setRating] = useState<number>(5);
  const [coverOrSupportName, setCoverOrSupportName] = useState('');
  const [coverOrSupportMime, setCoverOrSupportMime] = useState('');
  const [coverOrSupportDataUrl, setCoverOrSupportDataUrl] = useState('');
  const [pdfAttachmentName, setPdfAttachmentName] = useState('');
  const [pdfAttachmentDataUrl, setPdfAttachmentDataUrl] = useState('');

  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const uid = profile?.uid || '';

  const myReviews = useMemo(() => {
    const mine = bookReviews.filter((r) => r.apprenticeUserId === uid);
    if (tab === 'all') return mine;
    if (tab === 'submitted') return mine.filter((r) => r.status === 'submitted' || r.status === 'under_review' || r.status === 'returned');
    return mine.filter((r) => r.status === tab);
  }, [bookReviews, uid, tab]);

  const resetForm = () => {
    setEditing(null);
    setBookTitle('');
    setAuthor('');
    setDateCompleted(new Date().toISOString().slice(0, 10));
    setSummary('');
    setLessonsLearned('');
    setOverallReview('');
    setRating(5);
    setCoverOrSupportName('');
    setCoverOrSupportMime('');
    setCoverOrSupportDataUrl('');
    setPdfAttachmentName('');
    setPdfAttachmentDataUrl('');
    setFormError(null);
  };

  useEffect(() => {
    if (autoOpenNew) {
      resetForm();
      setModalOpen(true);
      onConsumeAutoOpen?.();
    }
  }, [autoOpenNew, onConsumeAutoOpen]);

  const openEdit = (rev: BookReview) => {
    setEditing(rev);
    setBookTitle(rev.bookTitle);
    setAuthor(rev.author);
    setDateCompleted(rev.dateCompleted);
    setSummary(rev.summary);
    setLessonsLearned(rev.lessonsLearned);
    setOverallReview(rev.overallReview);
    setRating(rev.rating || 5);
    setCoverOrSupportName(rev.coverOrSupportName || '');
    setCoverOrSupportMime(rev.coverOrSupportMime || '');
    setCoverOrSupportDataUrl(rev.coverOrSupportDataUrl || '');
    setPdfAttachmentName(rev.pdfAttachmentName || '');
    setPdfAttachmentDataUrl(rev.pdfAttachmentDataUrl || '');
    setFormError(null);
    setModalOpen(true);
  };

  const handleCoverUpload = async (file: File | undefined) => {
    if (!file) return;
    setFormError(null);
    try {
      const processed = await processDocumentUpload(file, {
        allowPdf: true,
        allowImages: true,
        maxDataUrlLength: 440000,
        maxImageWidth: 1024,
      });
      setCoverOrSupportName(processed.fileName);
      setCoverOrSupportMime(processed.mimeType);
      setCoverOrSupportDataUrl(processed.dataUrl);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Unable to attach file.');
    }
  };

  const handlePdfUpload = async (file: File | undefined) => {
    if (!file) return;
    setFormError(null);
    try {
      const processed = await processDocumentUpload(file, {
        allowPdf: true,
        allowImages: false,
        maxDataUrlLength: 640000,
      });
      setPdfAttachmentName(processed.fileName);
      setPdfAttachmentDataUrl(processed.dataUrl);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Unable to attach PDF.');
    }
  };

  const saveReview = async (targetStatus: 'draft' | 'submitted') => {
    if (!profile) return;
    setFormError(null);
    setNotice(null);

    if (bookTitle.trim().length < 2 || author.trim().length < 2 || !dateCompleted) {
      setFormError('Book title, author, and date completed are required.');
      return;
    }
    if (summary.trim().length < 5 || lessonsLearned.trim().length < 5 || overallReview.trim().length < 5) {
      setFormError('Summary, main lessons learned, and overall review must each be at least 5 characters.');
      return;
    }

    const sup = directory.find((d) => d.role === 'apprentice_supervisor');
    const supervisorId = apprenticeRecord?.supervisorId || sup?.uid || profile.uid;
    const nowIso = new Date().toISOString();

    const payload = {
      bookTitle: bookTitle.trim(),
      author: author.trim(),
      dateCompleted,
      summary: summary.trim(),
      lessonsLearned: lessonsLearned.trim(),
      overallReview: overallReview.trim(),
      rating,
      coverOrSupportName,
      coverOrSupportMime,
      coverOrSupportDataUrl,
      pdfAttachmentName,
      pdfAttachmentDataUrl,
      status: targetStatus,
      submittedAt: targetStatus === 'submitted' ? nowIso : editing?.submittedAt || '',
    };

    setSaving(true);
    try {
      if (editing) {
        await updateDoc(doc(db, 'bookReviews', editing.id), {
          ...payload,
          updatedAt: serverTimestamp(),
        });
        await recordAuditLog({
          actorUid: profile.uid,
          actorName: profile.displayName,
          actorRole: profile.role,
          action: targetStatus === 'draft' ? 'UPDATE_BOOK_REVIEW_DRAFT' : 'SUBMIT_BOOK_REVIEW',
          targetCollection: 'bookReviews',
          targetId: editing.id,
          summary: `${targetStatus === 'draft' ? 'Saved draft' : 'Submitted'} book review for "${bookTitle.trim()}"`,
        });
      } else {
        const ref = doc(collection(db, 'bookReviews'));
        await setDoc(ref, {
          orgId: ORG_ID,
          apprenticeId: apprenticeRecord?.id || profile.uid,
          apprenticeUserId: profile.uid,
          apprenticeName: apprenticeRecord?.fullName || profile.displayName,
          supervisorId,
          ...payload,
          isDemo: false,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        await recordAuditLog({
          actorUid: profile.uid,
          actorName: profile.displayName,
          actorRole: profile.role,
          action: targetStatus === 'draft' ? 'SAVE_BOOK_REVIEW_DRAFT' : 'SUBMIT_BOOK_REVIEW',
          targetCollection: 'bookReviews',
          targetId: ref.id,
          summary: `${targetStatus === 'draft' ? 'Saved draft' : 'Submitted'} book review for "${bookTitle.trim()}"`,
        });
      }

      if (targetStatus === 'submitted' && supervisorId && supervisorId !== profile.uid && !supervisorId.startsWith('demo_')) {
        await sendNotification({
          recipientUid: supervisorId,
          title: 'Book Review Submitted',
          message: `${profile.displayName} submitted a book review for "${bookTitle.trim()}" (${rating}/5 stars).`,
          category: 'report',
          linkModule: 'apprenticeship',
        });
      }

      setModalOpen(false);
      resetForm();
      setNotice(
        targetStatus === 'draft'
          ? 'Book review saved as draft.'
          : 'Book review submitted for supervisor review.'
      );
    } catch (err) {
      try {
        handleFirestoreError(err, editing ? OperationType.UPDATE : OperationType.CREATE, 'bookReviews');
      } catch (e2) {
        setFormError(e2 instanceof Error ? e2.message : 'Unable to save book review.');
      }
    } finally {
      setSaving(false);
    }
  };

  const columns: ColumnDef<BookReview>[] = [
    {
      key: 'bookTitle',
      header: 'Book & Author',
      sortable: true,
      sortValue: (r) => r.bookTitle,
      render: (r) => (
        <div className="flex items-start gap-2.5">
          {r.coverOrSupportDataUrl && r.coverOrSupportMime?.startsWith('image/') && (
            <img
              src={r.coverOrSupportDataUrl}
              alt={r.bookTitle}
              className="w-9 h-12 rounded object-cover border border-stone-200 shrink-0"
            />
          )}
          <div>
            <div className="font-medium text-slate-900">{r.bookTitle}</div>
            <div className="text-xs text-slate-500">
              {r.author} · Completed {r.dateCompleted}
            </div>
          </div>
        </div>
      ),
    },
    {
      key: 'rating',
      header: 'Rating',
      sortable: true,
      sortValue: (r) => r.rating,
      render: (r) => (
        <div className="flex items-center gap-1 font-mono text-xs text-amber-700 font-semibold">
          <Star className="w-3.5 h-3.5 fill-amber-500 text-amber-500" />
          <span>{r.rating}/5</span>
        </div>
      ),
    },
    {
      key: 'attachments',
      header: 'Attachments',
      render: (r) => (
        <div className="flex flex-wrap items-center gap-2 text-xs">
          {r.pdfAttachmentDataUrl && (
            <button
              type="button"
              onClick={() =>
                setPreviewDoc({
                  title: `Book Review PDF — ${r.bookTitle}`,
                  fileName: r.pdfAttachmentName || 'book_review.pdf',
                  mimeType: 'application/pdf',
                  dataUrl: r.pdfAttachmentDataUrl!,
                })
              }
              className="inline-flex items-center gap-1 text-emerald-800 hover:underline font-medium"
            >
              <FileText className="w-3.5 h-3.5" />
              PDF
            </button>
          )}
          {r.coverOrSupportDataUrl && (
            <button
              type="button"
              onClick={() =>
                setPreviewDoc({
                  title: `Attachment — ${r.bookTitle}`,
                  fileName: r.coverOrSupportName || 'cover_attachment',
                  mimeType: r.coverOrSupportMime,
                  dataUrl: r.coverOrSupportDataUrl!,
                })
              }
              className="inline-flex items-center gap-1 text-slate-700 hover:underline font-medium"
            >
              <Paperclip className="w-3.5 h-3.5" />
              Cover/Doc
            </button>
          )}
          {!r.pdfAttachmentDataUrl && !r.coverOrSupportDataUrl && <span className="text-slate-400">—</span>}
        </div>
      ),
    },
    {
      key: 'feedback',
      header: 'Supervisor Feedback',
      render: (r) => (
        <span className="text-xs text-slate-600 line-clamp-2">
          {r.supervisorComment || 'Awaiting supervisor feedback'}
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
            Read
          </button>
          {(r.status === 'draft' || r.status === 'returned') && (
            <button
              type="button"
              onClick={() => openEdit(r)}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-white bg-[var(--brand-primary)] hover:bg-[var(--brand-primary-hover)] rounded-lg"
            >
              <Pencil className="w-3.5 h-3.5" />
              {r.status === 'returned' ? 'Revise' : 'Edit'}
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
          <h1 className="text-2xl font-bold text-slate-900 font-display">Book Reviews</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Submit ministry reading summaries, lessons learned, star ratings, cover photos, and review PDFs
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
          New Book Review
        </button>
      </div>

      {notice && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-xs text-emerald-900">
          {notice}
        </div>
      )}

      {/* Filter Tabs */}
      <div className="flex items-center gap-1 p-1 bg-stone-200/70 rounded-lg w-fit overflow-x-auto max-w-full">
        {(
          [
            { key: 'all', label: 'All Reviews' },
            { key: 'draft', label: 'Drafts' },
            { key: 'submitted', label: 'Submitted & In Review' },
            { key: 'approved', label: 'Approved Reviews' },
          ] as { key: typeof tab; label: string }[]
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

      <DataTable
        rows={myReviews}
        columns={columns}
        rowKey={(r) => r.id}
        searchPlaceholder="Search book title, author, or lessons learned..."
        searchFilter={(r, q) =>
          r.bookTitle.toLowerCase().includes(q) ||
          r.author.toLowerCase().includes(q) ||
          r.summary.toLowerCase().includes(q)
        }
        emptyTitle="No book reviews recorded yet"
        emptyDescription="Submit your reading reflection and lessons learned for supervisor review."
      />

      {/* Book Review Create / Edit Modal */}
      <Modal
        open={modalOpen}
        onClose={() => {
          setModalOpen(false);
          resetForm();
        }}
        title={editing ? (editing.status === 'returned' ? 'Revise Book Review' : 'Edit Draft Book Review') : 'Submit Book Review'}
        subtitle="Associated directly with your apprentice profile and supervisor review queue"
        maxWidthClass="max-w-2xl"
      >
        <div className="space-y-4">
          {editing?.status === 'returned' && editing.supervisorComment && (
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-900">
              <strong>Supervisor Feedback:</strong> {editing.supervisorComment}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Book title *</label>
              <input
                type="text"
                required
                maxLength={200}
                value={bookTitle}
                onChange={(e) => setBookTitle(e.target.value)}
                placeholder="e.g. The Cross of Christ"
                className="w-full px-3 py-2 text-sm border border-stone-300 rounded-lg min-h-[42px]"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Author *</label>
              <input
                type="text"
                required
                maxLength={160}
                value={author}
                onChange={(e) => setAuthor(e.target.value)}
                placeholder="e.g. John Stott"
                className="w-full px-3 py-2 text-sm border border-stone-300 rounded-lg min-h-[42px]"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-center">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Date completed *</label>
              <input
                type="date"
                required
                value={dateCompleted}
                onChange={(e) => setDateCompleted(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-stone-300 rounded-lg min-h-[42px]"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Rating out of 5 stars *</label>
              <div className="flex items-center gap-1.5 py-1.5">
                {[1, 2, 3, 4, 5].map((star) => (
                  <button
                    key={star}
                    type="button"
                    onClick={() => setRating(star)}
                    className="p-1.5 rounded-lg hover:bg-stone-100 transition-colors"
                    aria-label={`Rate ${star} star${star > 1 ? 's' : ''}`}
                  >
                    <Star
                      className={`w-6 h-6 ${
                        star <= rating ? 'fill-amber-500 text-amber-500' : 'text-stone-300'
                      }`}
                    />
                  </button>
                ))}
                <span className="ml-2 font-mono text-xs font-semibold text-slate-700">{rating} / 5</span>
              </div>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Summary of the book *</label>
            <textarea
              rows={3}
              required
              maxLength={4000}
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              placeholder="Summarise the author's main argument and theological themes..."
              className="w-full px-3 py-2 text-sm border border-stone-300 rounded-lg"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Main lessons learned *</label>
            <textarea
              rows={3}
              required
              maxLength={4000}
              value={lessonsLearned}
              onChange={(e) => setLessonsLearned(e.target.value)}
              placeholder="Key biblical convictions, practical ministry habits, or personal challenges..."
              className="w-full px-3 py-2 text-sm border border-stone-300 rounded-lg"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Overall review *</label>
            <textarea
              rows={3}
              required
              maxLength={4000}
              value={overallReview}
              onChange={(e) => setOverallReview(e.target.value)}
              placeholder="Your critical evaluation and recommendation for fellow apprentices..."
              className="w-full px-3 py-2 text-sm border border-stone-300 rounded-lg"
            />
          </div>

          {/* Uploads */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
            <div className="p-3 border border-stone-200 rounded-lg space-y-2">
              <div className="text-xs font-medium text-slate-700">Optional Book Cover Photo / Attachment</div>
              <label className="inline-flex items-center gap-2 px-3 py-2 text-xs font-medium text-slate-700 bg-stone-50 hover:bg-stone-100 border border-stone-300 rounded-lg cursor-pointer min-h-[40px]">
                <Upload className="w-3.5 h-3.5" />
                <span>{coverOrSupportName ? 'Replace Attachment' : 'Choose JPG / PNG / PDF'}</span>
                <input
                  type="file"
                  accept="image/jpeg,image/png,application/pdf"
                  className="hidden"
                  onChange={(e) => {
                    void handleCoverUpload(e.target.files?.[0]);
                    e.currentTarget.value = '';
                  }}
                />
              </label>
              {coverOrSupportName && (
                <div className="text-[11px] text-emerald-800 font-mono truncate">{coverOrSupportName}</div>
              )}
            </div>

            <div className="p-3 border border-stone-200 rounded-lg space-y-2">
              <div className="text-xs font-medium text-slate-700">Upload Book Review in PDF (Optional)</div>
              <label className="inline-flex items-center gap-2 px-3 py-2 text-xs font-medium text-emerald-900 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-lg cursor-pointer min-h-[40px]">
                <FileText className="w-3.5 h-3.5" />
                <span>{pdfAttachmentName ? 'Replace PDF' : 'Upload in PDF'}</span>
                <input
                  type="file"
                  accept="application/pdf,.pdf"
                  className="hidden"
                  onChange={(e) => {
                    void handlePdfUpload(e.target.files?.[0]);
                    e.currentTarget.value = '';
                  }}
                />
              </label>
              {pdfAttachmentName && (
                <div className="text-[11px] text-emerald-800 font-mono truncate">{pdfAttachmentName}</div>
              )}
            </div>
          </div>

          {formError && <p className="text-xs text-red-700">{formError}</p>}

          <div className="flex flex-wrap justify-end gap-3 pt-2 border-t border-stone-100">
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
              type="button"
              disabled={saving}
              onClick={() => void saveReview('draft')}
              className="px-4 py-2 text-sm font-medium text-slate-800 bg-stone-100 hover:bg-stone-200 border border-stone-300 rounded-lg disabled:opacity-60 min-h-[40px]"
            >
              Save Draft
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={() => void saveReview('submitted')}
              className="px-4 py-2 text-sm font-semibold text-white bg-[var(--brand-primary)] hover:bg-[var(--brand-primary-hover)] rounded-lg disabled:opacity-60 min-h-[40px]"
            >
              {saving ? 'Submitting...' : 'Submit Review'}
            </button>
          </div>
        </div>
      </Modal>

      {/* Book Review Detail Modal */}
      <Modal
        open={Boolean(viewing)}
        onClose={() => setViewing(null)}
        title={viewing?.bookTitle || 'Book Review'}
        subtitle={viewing ? `${viewing.author} · Completed ${viewing.dateCompleted}` : ''}
        maxWidthClass="max-w-2xl"
      >
        {viewing && (
          <div className="space-y-4 text-xs">
            <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-stone-200">
              <div className="flex items-center gap-3">
                <StatusText status={viewing.status} />
                <span className="inline-flex items-center gap-1 font-mono font-semibold text-amber-700">
                  <Star className="w-3.5 h-3.5 fill-amber-500 text-amber-500" />
                  {viewing.rating}/5
                </span>
              </div>
              {viewing.submittedAt && (
                <span className="text-slate-500">Submitted {formatNairobiDateTime(viewing.submittedAt)}</span>
              )}
            </div>

            <div className="space-y-3">
              <div className="p-3 border border-stone-200 rounded-lg space-y-1">
                <div className="font-semibold text-slate-800">Summary of the Book</div>
                <p className="text-slate-600 whitespace-pre-wrap leading-relaxed">{viewing.summary}</p>
              </div>
              <div className="p-3 border border-stone-200 rounded-lg space-y-1">
                <div className="font-semibold text-slate-800">Main Lessons Learned</div>
                <p className="text-slate-600 whitespace-pre-wrap leading-relaxed">{viewing.lessonsLearned}</p>
              </div>
              <div className="p-3 border border-stone-200 rounded-lg space-y-1">
                <div className="font-semibold text-slate-800">Overall Review</div>
                <p className="text-slate-600 whitespace-pre-wrap leading-relaxed">{viewing.overallReview}</p>
              </div>
            </div>

            {(viewing.pdfAttachmentDataUrl || viewing.coverOrSupportDataUrl) && (
              <div className="flex flex-wrap gap-2 pt-1">
                {viewing.pdfAttachmentDataUrl && (
                  <button
                    type="button"
                    onClick={() =>
                      setPreviewDoc({
                        title: `Book Review PDF — ${viewing.bookTitle}`,
                        fileName: viewing.pdfAttachmentName || 'book_review.pdf',
                        mimeType: 'application/pdf',
                        dataUrl: viewing.pdfAttachmentDataUrl!,
                      })
                    }
                    className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-white bg-[var(--brand-primary)] rounded-lg"
                  >
                    <FileText className="w-3.5 h-3.5" />
                    Open Review PDF
                  </button>
                )}
                {viewing.coverOrSupportDataUrl && (
                  <button
                    type="button"
                    onClick={() =>
                      setPreviewDoc({
                        title: `Cover / Supporting Attachment — ${viewing.bookTitle}`,
                        fileName: viewing.coverOrSupportName || 'attachment',
                        mimeType: viewing.coverOrSupportMime,
                        dataUrl: viewing.coverOrSupportDataUrl!,
                      })
                    }
                    className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-700 bg-stone-50 border border-stone-300 rounded-lg"
                  >
                    <Paperclip className="w-3.5 h-3.5" />
                    View Cover / Attachment
                  </button>
                )}
              </div>
            )}

            {viewing.supervisorComment && (
              <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg space-y-1">
                <div className="font-semibold text-emerald-950">
                  Supervisor Feedback {viewing.reviewedBy ? `(${viewing.reviewedBy})` : ''}
                </div>
                <p className="text-emerald-900 whitespace-pre-wrap">{viewing.supervisorComment}</p>
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
