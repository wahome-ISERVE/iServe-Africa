import React, { useState } from 'react';
import { collection, doc, serverTimestamp, setDoc } from 'firebase/firestore';
import { Plus, FileText, Eye } from 'lucide-react';
import { ORG_ID, db } from '../lib/firebase.ts';
import { OperationType, handleFirestoreError } from '../lib/firestoreError.ts';
import { recordAuditLog } from '../lib/audit.ts';
import { useAuth } from '../context/AuthContext.tsx';
import { useData } from '../context/DataContext.tsx';
import { DataTable, ColumnDef } from '../components/ui/DataTable.tsx';
import { Modal } from '../components/ui/Modal.tsx';
import { DocumentRecord, formatNairobiDate } from '../types/erp.ts';

export function DocumentsPage() {
  const { profile } = useAuth();
  const { documents, departments } = useData();

  const [modalOpen, setModalOpen] = useState(false);
  const [viewing, setViewing] = useState<DocumentRecord | null>(null);
  const [saving, setSaving] = useState(false);

  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('Governance & HR Policy');
  const [deptId, setDeptId] = useState('');
  const [accessScope, setAccessScope] = useState<DocumentRecord['accessScope']>('all_staff');
  const [version, setVersion] = useState('v1.0');
  const [fileName, setFileName] = useState('');
  const [fileSizeKb, setFileSizeKb] = useState(0);
  const [summary, setSummary] = useState('');
  const [contentText, setContentText] = useState('');

  const handleFilePick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setFileSizeKb(Math.max(1, Math.round(file.size / 1024)));
    if (file.type.startsWith('text/') || file.name.endsWith('.md') || file.name.endsWith('.txt')) {
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result === 'string') {
          setContentText(reader.result.slice(0, 7500));
        }
      };
      reader.readAsText(file);
    }
  };

  const handleSaveDoc = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile) return;
    setSaving(true);
    const dept = departments.find((d) => d.id === deptId);
    const ref = doc(collection(db, 'documents'));
    try {
      await setDoc(ref, {
        orgId: ORG_ID,
        title: title.trim(),
        category,
        departmentId: dept?.id || '',
        departmentName: dept?.name || 'Organisational',
        accessScope,
        version: version.trim(),
        fileName: fileName.trim() || `${title.trim().replace(/\s+/g, '_')}.pdf`,
        fileSizeKb: fileSizeKb || 120,
        summary: summary.trim(),
        contentText: contentText.trim(),
        uploadedBy: profile.uid,
        uploadedByName: profile.displayName,
        isDemo: false,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      await recordAuditLog({
        actorUid: profile.uid,
        actorName: profile.displayName,
        actorRole: profile.role,
        action: 'REGISTER_DOCUMENT',
        targetCollection: 'documents',
        targetId: ref.id,
        summary: `Uploaded/registered document "${title.trim()}" (${version.trim()}, scope: ${accessScope})`,
      });
      setModalOpen(false);
      setTitle('');
      setFileName('');
      setSummary('');
      setContentText('');
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, `documents/${ref.id}`);
    } finally {
      setSaving(false);
    }
  };

  const cols: ColumnDef<DocumentRecord>[] = [
    {
      key: 'title',
      header: 'Document Title & File',
      sortable: true,
      sortValue: (r) => r.title,
      render: (r) => (
        <div className="flex items-start gap-2.5">
          <FileText className="w-4 h-4 text-emerald-800 mt-0.5 shrink-0" />
          <div>
            <div className="font-medium text-slate-900">{r.title}</div>
            <div className="text-xs text-slate-500">
              <span className="font-mono">{r.fileName}</span> · {r.version} · {r.fileSizeKb || 0} KB
            </div>
          </div>
        </div>
      ),
    },
    {
      key: 'category',
      header: 'Category & Department',
      render: (r) => (
        <div className="text-xs">
          <div className="text-slate-800">{r.category}</div>
          <div className="text-slate-500">{r.departmentName || 'Organisational'}</div>
        </div>
      ),
    },
    {
      key: 'scope',
      header: 'Access Scope',
      render: (r) => <span className="text-xs font-mono text-slate-700">{r.accessScope}</span>,
    },
    {
      key: 'updated',
      header: 'Registered',
      render: (r) => <span className="text-xs font-mono text-slate-500">{formatNairobiDate(r.createdAt)}</span>,
    },
    {
      key: 'action',
      header: 'Open',
      align: 'right',
      render: (r) => (
        <button
          type="button"
          onClick={() => setViewing(r)}
          className="inline-flex items-center gap-1 text-xs font-medium text-emerald-800 hover:underline"
        >
          <Eye className="w-3.5 h-3.5" />
          View
        </button>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 font-display">Document Control</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Role-scoped organisational policies, training manuals, donor agreements, and versioned records
          </p>
        </div>

        <button
          type="button"
          onClick={() => setModalOpen(true)}
          className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-[var(--brand-primary)] hover:bg-[var(--brand-primary-hover)] rounded-lg"
        >
          <Plus className="w-3.5 h-3.5" />
          Upload / Register Document
        </button>
      </div>

      <DataTable
        rows={documents}
        columns={cols}
        rowKey={(r) => r.id}
        searchPlaceholder="Search documents by title, category, or file name..."
        searchFilter={(r, q) =>
          r.title.toLowerCase().includes(q) ||
          r.category.toLowerCase().includes(q) ||
          r.fileName.toLowerCase().includes(q)
        }
      />

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Register Controlled Document">
        <form onSubmit={handleSaveDoc} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Document Title</label>
            <input
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-stone-300 rounded-lg"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Category</label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-stone-300 rounded-lg"
              >
                <option>Governance & HR Policy</option>
                <option>Apprenticeship Manual</option>
                <option>Financial Procedure</option>
                <option>Donor & Grant Agreement</option>
                <option>Board Minutes</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Access Scope</label>
              <select
                value={accessScope}
                onChange={(e) => setAccessScope(e.target.value as DocumentRecord['accessScope'])}
                className="w-full px-3 py-2 text-sm border border-stone-300 rounded-lg"
              >
                <option value="all_staff">All Staff</option>
                <option value="department">Department Only</option>
                <option value="management">Management Only</option>
                <option value="finance">Finance Only</option>
                <option value="hr">HR Only</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Version</label>
              <input
                type="text"
                required
                value={version}
                onChange={(e) => setVersion(e.target.value)}
                className="w-full px-3 py-2 text-sm font-mono border border-stone-300 rounded-lg"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Department</label>
              <select
                value={deptId}
                onChange={(e) => setDeptId(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-stone-300 rounded-lg"
              >
                <option value="">Organisational</option>
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Select File (Metadata & Text)</label>
              <input
                type="file"
                onChange={handleFilePick}
                className="w-full text-xs text-slate-600 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border file:border-stone-300 file:bg-stone-50"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Summary</label>
            <textarea
              rows={2}
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-stone-300 rounded-lg"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-stone-100">
            <button
              type="button"
              onClick={() => setModalOpen(false)}
              className="px-4 py-2 text-sm border border-stone-300 rounded-lg"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 text-sm font-semibold text-white bg-[var(--brand-primary)] rounded-lg"
            >
              Register Document
            </button>
          </div>
        </form>
      </Modal>

      <Modal
        open={Boolean(viewing)}
        onClose={() => setViewing(null)}
        title={viewing?.title || 'Document'}
        subtitle={viewing ? `${viewing.category} · ${viewing.version} · ${viewing.fileName}` : ''}
      >
        {viewing && (
          <div className="space-y-4 text-sm">
            <div className="text-xs text-slate-500">
              Uploaded by {viewing.uploadedByName || 'Staff'} · Scope:{' '}
              <span className="font-mono">{viewing.accessScope}</span>
            </div>
            {viewing.summary && <p className="text-slate-700 leading-relaxed">{viewing.summary}</p>}
            {viewing.contentText && (
              <pre className="p-4 bg-stone-50 border border-stone-200 rounded-lg text-xs font-mono whitespace-pre-wrap max-h-64 overflow-y-auto">
                {viewing.contentText}
              </pre>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}
