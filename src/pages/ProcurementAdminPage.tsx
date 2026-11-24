import React, { useEffect, useState } from 'react';
import { collection, doc, serverTimestamp, setDoc } from 'firebase/firestore';
import { Plus, QrCode, ScanLine } from 'lucide-react';
import { ORG_ID, db } from '../lib/firebase.ts';
import { OperationType, handleFirestoreError } from '../lib/firestoreError.ts';
import { recordAuditLog } from '../lib/audit.ts';
import { useAuth } from '../context/AuthContext.tsx';
import { useData } from '../context/DataContext.tsx';
import { DataTable, ColumnDef } from '../components/ui/DataTable.tsx';
import { Modal } from '../components/ui/Modal.tsx';
import { StatusText } from '../components/ui/StatusText.tsx';
import { AssetQrModal, AssetQrThumbnail, buildAssetQrPayload } from '../components/assets/AssetQrModal.tsx';
import { AssetQrScannerModal } from '../components/assets/AssetQrScannerModal.tsx';
import { AdminMemo, Asset, ProcurementRequest, Supplier, formatKes, formatNairobiDate } from '../types/erp.ts';

type AdminTab = 'requisitions' | 'suppliers' | 'assets' | 'memos';

interface ProcurementAdminPageProps {
  initialTab?: AdminTab;
  deepLinkAsset?: { assetId?: string; assetTag?: string } | null;
  onClearDeepLink?: () => void;
}

export function ProcurementAdminPage({
  initialTab,
  deepLinkAsset,
  onClearDeepLink,
}: ProcurementAdminPageProps = {}) {
  const { profile, effectiveRole } = useAuth();
  const { procurementRequests, suppliers, assets, adminMemos, departments } = useData();

  const [tab, setTab] = useState<AdminTab>(initialTab || 'requisitions');
  const [reqModalOpen, setReqModalOpen] = useState(false);
  const [supModalOpen, setSupModalOpen] = useState(false);
  const [assetModalOpen, setAssetModalOpen] = useState(false);
  const [memoModalOpen, setMemoModalOpen] = useState(false);
  const [qrModalAsset, setQrModalAsset] = useState<Asset | null>(null);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [scanTargetAsset, setScanTargetAsset] = useState<Asset | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Requisition form
  const [reqTitle, setReqTitle] = useState('');
  const [reqDeptId, setReqDeptId] = useState('');
  const [reqSupplier, setReqSupplier] = useState('');
  const [reqCategory, setReqCategory] = useState('ICT Equipment');
  const [reqAmount, setReqAmount] = useState('');
  const [reqJust, setReqJust] = useState('');

  // Supplier form
  const [supName, setSupName] = useState('');
  const [supContact, setSupContact] = useState('');
  const [supPhone, setSupPhone] = useState('');
  const [supCategory, setSupCategory] = useState('Office & Supplies');
  const [supKra, setSupKra] = useState('');

  // Asset form
  const [astTag, setAstTag] = useState('');
  const [astName, setAstName] = useState('');
  const [astCategory, setAstCategory] = useState('ICT Equipment');
  const [astCost, setAstCost] = useState('');
  const [astLocation, setAstLocation] = useState('Nairobi Head Office');
  const [astAssigned, setAstAssigned] = useState('');

  // Memo form
  const [memoType, setMemoType] = useState<AdminMemo['recordType']>('memo');
  const [memoTitle, setMemoTitle] = useState('');
  const [memoBody, setMemoBody] = useState('');
  const [memoDate, setMemoDate] = useState('');
  const [memoLocation, setMemoLocation] = useState('');

  const canManageOps = [
    'super_admin',
    'executive_director',
    'senior_management',
    'finance_officer',
    'hr_officer',
    'department_head',
    'bookstore_manager',
  ].includes(effectiveRole);

  const canDisposeAsset = [
    'super_admin',
    'executive_director',
    'senior_management',
    'finance_officer',
  ].includes(effectiveRole);

  useEffect(() => {
    if (!deepLinkAsset || assets.length === 0) return;
    setTab('assets');
    const match =
      (deepLinkAsset.assetId && assets.find((a) => a.id === deepLinkAsset.assetId)) ||
      (deepLinkAsset.assetTag &&
        assets.find((a) => a.assetTag.toLowerCase() === deepLinkAsset.assetTag?.toLowerCase()));
    if (match) {
      setScanTargetAsset(match);
      setScannerOpen(true);
    } else {
      setNotice('Scanned asset QR was not found in the active register.');
    }
    onClearDeepLink?.();
  }, [deepLinkAsset, assets, onClearDeepLink]);

  const handleCreateReq = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile) return;
    setSaving(true);
    const dept = departments.find((d) => d.id === reqDeptId);
    const ref = doc(collection(db, 'procurementRequests'));
    const reqNo = `PR-2026-${String(Math.floor(100 + Math.random() * 900))}`;
    try {
      await setDoc(ref, {
        orgId: ORG_ID,
        reqNo,
        title: reqTitle.trim(),
        departmentId: dept?.id || 'general',
        departmentName: dept?.name || 'General',
        supplierName: reqSupplier.trim(),
        category: reqCategory,
        estimatedKes: Number(reqAmount) || 0,
        justification: reqJust.trim(),
        requestedBy: profile.uid,
        requestedByName: profile.displayName,
        status: 'submitted',
        isDemo: false,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      await recordAuditLog({
        actorUid: profile.uid,
        actorName: profile.displayName,
        actorRole: profile.role,
        action: 'CREATE_REQUISITION',
        targetCollection: 'procurementRequests',
        targetId: ref.id,
        summary: `Submitted purchase requisition ${reqNo}: ${reqTitle.trim()}`,
      });
      setReqModalOpen(false);
      setReqTitle('');
      setReqAmount('');
      setReqJust('');
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, `procurementRequests/${ref.id}`);
    } finally {
      setSaving(false);
    }
  };

  const handleCreateSupplier = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile) return;
    setSaving(true);
    const ref = doc(collection(db, 'suppliers'));
    try {
      await setDoc(ref, {
        orgId: ORG_ID,
        name: supName.trim(),
        contactPerson: supContact.trim(),
        phone: supPhone.trim(),
        category: supCategory,
        kraPin: supKra.trim(),
        outstandingKes: 0,
        status: 'active',
        isDemo: false,
        createdAt: serverTimestamp(),
      });
      setSupModalOpen(false);
      setSupName('');
      setSupContact('');
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, `suppliers/${ref.id}`);
    } finally {
      setSaving(false);
    }
  };

  const handleCreateAsset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile) return;
    setSaving(true);
    const ref = doc(collection(db, 'assets'));
    const cleanTag = astTag.trim();
    const cleanName = astName.trim();
    const qrCodeValue = buildAssetQrPayload({ id: ref.id, assetTag: cleanTag });
    try {
      await setDoc(ref, {
        orgId: ORG_ID,
        assetTag: cleanTag,
        name: cleanName,
        category: astCategory,
        purchaseDate: new Date().toISOString().slice(0, 10),
        purchaseCostKes: Number(astCost) || 0,
        assignedToName: astAssigned.trim(),
        location: astLocation.trim(),
        condition: 'good',
        status: 'active',
        qrCodeValue,
        checkoutStatus: 'available',
        isDemo: false,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      await recordAuditLog({
        actorUid: profile.uid,
        actorName: profile.displayName,
        actorRole: profile.role,
        action: 'CREATE_ASSET',
        targetCollection: 'assets',
        targetId: ref.id,
        summary: `Registered fixed asset ${cleanTag} — ${cleanName} with unique QR tag`,
      });
      setAssetModalOpen(false);
      setAstTag('');
      setAstName('');
      setAstCost('');
      setAstAssigned('');
      setNotice(`Registered asset ${cleanTag} with unique QR code.`);
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, `assets/${ref.id}`);
    } finally {
      setSaving(false);
    }
  };

  const handleCreateMemo = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile) return;
    setSaving(true);
    const ref = doc(collection(db, 'adminMemos'));
    try {
      await setDoc(ref, {
        orgId: ORG_ID,
        recordType: memoType,
        title: memoTitle.trim(),
        body: memoBody.trim(),
        eventDate: memoDate,
        location: memoLocation.trim() || 'Nairobi',
        authorId: profile.uid,
        authorName: profile.displayName,
        isDemo: false,
        createdAt: serverTimestamp(),
      });
      setMemoModalOpen(false);
      setMemoTitle('');
      setMemoBody('');
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, `adminMemos/${ref.id}`);
    } finally {
      setSaving(false);
    }
  };

  const reqCols: ColumnDef<ProcurementRequest>[] = [
    {
      key: 'reqNo',
      header: 'Req No',
      render: (r) => <span className="font-mono text-xs font-semibold text-slate-900">{r.reqNo}</span>,
    },
    {
      key: 'title',
      header: 'Item & Supplier',
      render: (r) => (
        <div>
          <div className="font-medium text-slate-900">{r.title}</div>
          <div className="text-xs text-slate-500">
            {r.departmentName || 'General'} · {r.supplierName || 'Preferred Vendor'}
          </div>
        </div>
      ),
    },
    {
      key: 'est',
      header: 'Estimated (KES)',
      align: 'right',
      render: (r) => <span className="font-mono font-semibold">{formatKes(r.estimatedKes)}</span>,
    },
    {
      key: 'status',
      header: 'Status',
      render: (r) => <StatusText status={r.status} />,
    },
  ];

  const supCols: ColumnDef<Supplier>[] = [
    {
      key: 'name',
      header: 'Vendor / Publisher',
      render: (r) => (
        <div>
          <div className="font-medium text-slate-900">{r.name}</div>
          <div className="text-xs text-slate-500">
            {r.category} · KRA PIN: <span className="font-mono">{r.kraPin || '—'}</span>
          </div>
        </div>
      ),
    },
    {
      key: 'contact',
      header: 'Contact',
      render: (r) => (
        <div className="text-xs">
          <div>{r.contactPerson || '—'}</div>
          <div className="text-slate-500">{r.phone || r.email || '—'}</div>
        </div>
      ),
    },
    {
      key: 'bal',
      header: 'Outstanding (KES)',
      align: 'right',
      render: (r) => <span className="font-mono">{formatKes(r.outstandingKes)}</span>,
    },
    {
      key: 'status',
      header: 'Status',
      render: (r) => <StatusText status={r.status} />,
    },
  ];

  const assetCols: ColumnDef<Asset>[] = [
    {
      key: 'qr',
      header: 'QR Code',
      render: (r) => <AssetQrThumbnail asset={r} onClick={() => setQrModalAsset(r)} />,
    },
    {
      key: 'tag',
      header: 'Asset Tag',
      render: (r) => <span className="font-mono text-xs font-semibold text-slate-900">{r.assetTag}</span>,
    },
    {
      key: 'name',
      header: 'Asset & Category',
      render: (r) => (
        <div>
          <div className="font-medium text-slate-900">{r.name}</div>
          <div className="text-xs text-slate-500">
            {r.category} · {r.location || 'Nairobi'}
          </div>
        </div>
      ),
    },
    {
      key: 'assigned',
      header: 'Custodian & Check-Out',
      render: (r) => (
        <div className="space-y-0.5 text-xs">
          <div className="text-slate-800 font-medium">
            {r.checkoutStatus === 'checked_out' && r.checkedOutTo
              ? `Out: ${r.checkedOutTo}`
              : r.assignedToName || 'Central Store'}
          </div>
          <StatusText status={r.checkoutStatus || 'available'} />
        </div>
      ),
    },
    {
      key: 'cost',
      header: 'Purchase Cost',
      align: 'right',
      render: (r) => <span className="font-mono tabular-nums">{formatKes(r.purchaseCostKes)}</span>,
    },
    {
      key: 'status',
      header: 'Condition / Status',
      render: (r) => (
        <div className="space-y-0.5">
          <StatusText status={r.status} />
          {r.condition && <div className="text-[11px] text-slate-500 capitalize">{r.condition.replace('_', ' ')}</div>}
        </div>
      ),
    },
    {
      key: 'actions',
      header: 'Actions',
      align: 'right',
      render: (r) => (
        <div className="inline-flex items-center gap-2 justify-end">
          <button
            type="button"
            onClick={() => setQrModalAsset(r)}
            className="inline-flex items-center gap-1 text-xs font-medium text-slate-700 hover:text-slate-900 hover:underline whitespace-nowrap"
          >
            <QrCode className="w-3.5 h-3.5" />
            QR Tag
          </button>
          <button
            type="button"
            onClick={() => {
              setScanTargetAsset(r);
              setScannerOpen(true);
            }}
            className="inline-flex items-center gap-1 text-xs font-semibold text-[#0d4f3c] hover:underline whitespace-nowrap"
          >
            <ScanLine className="w-3.5 h-3.5" />
            {r.checkoutStatus === 'checked_out' ? 'Check In / Update' : 'Check Out'}
          </button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 font-display">Administration & Procurement</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Purchase requisitions, suppliers, fixed asset register, internal memos, and events calendar
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => {
              setTab('assets');
              setScanTargetAsset(null);
              setScannerOpen(true);
            }}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-[#0d4f3c] bg-emerald-50 border border-emerald-200 rounded-lg hover:bg-emerald-100 whitespace-nowrap"
          >
            <ScanLine className="w-3.5 h-3.5" />
            Scan Asset QR
          </button>
          {canManageOps && (
            <>
              <button
                type="button"
                onClick={() => setMemoModalOpen(true)}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium bg-white border border-stone-300 rounded-lg hover:bg-stone-50"
              >
                <Plus className="w-3.5 h-3.5" />
                Post Memo / Event
              </button>
              <button
                type="button"
                onClick={() => setAssetModalOpen(true)}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium bg-white border border-stone-300 rounded-lg hover:bg-stone-50"
              >
                <Plus className="w-3.5 h-3.5" />
                Add Asset
              </button>
              <button
                type="button"
                onClick={() => setSupModalOpen(true)}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium bg-white border border-stone-300 rounded-lg hover:bg-stone-50"
              >
                <Plus className="w-3.5 h-3.5" />
                Add Supplier
              </button>
            </>
          )}
          <button
            type="button"
            onClick={() => setReqModalOpen(true)}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-[var(--brand-primary)] hover:bg-[var(--brand-primary-hover)] rounded-lg"
          >
            <Plus className="w-3.5 h-3.5" />
            New Requisition
          </button>
        </div>
      </div>

      {notice && (
        <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-900 flex items-center justify-between gap-2">
          <span>{notice}</span>
          <button
            type="button"
            onClick={() => setNotice(null)}
            className="font-medium text-amber-800 hover:underline shrink-0"
          >
            Dismiss
          </button>
        </div>
      )}

      <div className="flex items-center gap-1 p-1 bg-stone-200/70 rounded-lg w-fit overflow-x-auto">
        {(
          [
            { key: 'requisitions', label: 'Purchase Requisitions' },
            { key: 'suppliers', label: 'Suppliers' },
            { key: 'assets', label: 'Fixed Asset Register' },
            { key: 'memos', label: 'Memos & Events' },
          ] as { key: AdminTab; label: string }[]
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

      {tab === 'requisitions' && (
        <DataTable
          rows={procurementRequests}
          columns={reqCols}
          rowKey={(r) => r.id}
          searchPlaceholder="Search requisitions..."
          searchFilter={(r, q) =>
            r.reqNo.toLowerCase().includes(q) || r.title.toLowerCase().includes(q)
          }
        />
      )}

      {tab === 'suppliers' && (
        <DataTable
          rows={suppliers}
          columns={supCols}
          rowKey={(r) => r.id}
          searchPlaceholder="Search suppliers..."
          searchFilter={(r, q) => r.name.toLowerCase().includes(q) || r.category.toLowerCase().includes(q)}
        />
      )}

      {tab === 'assets' && (
        <DataTable
          rows={assets}
          columns={assetCols}
          rowKey={(r) => r.id}
          searchPlaceholder="Search asset tag, name, custodian, or location..."
          searchFilter={(r, q) =>
            r.assetTag.toLowerCase().includes(q) ||
            r.name.toLowerCase().includes(q) ||
            (r.assignedToName || '').toLowerCase().includes(q) ||
            (r.checkedOutTo || '').toLowerCase().includes(q) ||
            (r.location || '').toLowerCase().includes(q)
          }
          toolbarExtra={
            <button
              type="button"
              onClick={() => {
                setScanTargetAsset(null);
                setScannerOpen(true);
              }}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-[var(--brand-primary)] hover:bg-[var(--brand-primary-hover)] rounded-lg whitespace-nowrap"
            >
              <ScanLine className="w-3.5 h-3.5" />
              Scan QR / Check-Out
            </button>
          }
        />
      )}

      {tab === 'memos' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {adminMemos.map((m) => (
            <div key={m.id} className="bg-white border border-stone-200 rounded-xl p-5 space-y-2">
              <div className="flex items-center justify-between text-xs text-slate-500">
                <span className="uppercase font-semibold text-emerald-800">{m.recordType}</span>
                <span className="font-mono">{m.eventDate ? formatNairobiDate(m.eventDate) : formatNairobiDate(m.createdAt)}</span>
              </div>
              <h3 className="text-base font-semibold text-slate-900 font-display">{m.title}</h3>
              <p className="text-xs text-slate-600 leading-relaxed">{m.body}</p>
              <div className="text-[11px] text-slate-400 pt-1">
                {m.location || 'Nairobi'} · Posted by {m.authorName || 'Administration'}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Requisition Modal */}
      <Modal open={reqModalOpen} onClose={() => setReqModalOpen(false)} title="New Purchase Requisition" maxWidthClass="max-w-lg">
        <form onSubmit={handleCreateReq} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Item / Service Description</label>
            <input type="text" required value={reqTitle} onChange={(e) => setReqTitle(e.target.value)} className="w-full px-3 py-2 text-sm border border-stone-300 rounded-lg" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Department</label>
              <select required value={reqDeptId} onChange={(e) => setReqDeptId(e.target.value)} className="w-full px-3 py-2 text-sm border border-stone-300 rounded-lg">
                <option value="">Select</option>
                {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Estimated Cost (KES)</label>
              <input type="number" min="1" required value={reqAmount} onChange={(e) => setReqAmount(e.target.value)} className="w-full px-3 py-2 text-sm font-mono border border-stone-300 rounded-lg" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Suggested Supplier</label>
              <input type="text" value={reqSupplier} onChange={(e) => setReqSupplier(e.target.value)} className="w-full px-3 py-2 text-sm border border-stone-300 rounded-lg" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Category</label>
              <input type="text" value={reqCategory} onChange={(e) => setReqCategory(e.target.value)} className="w-full px-3 py-2 text-sm border border-stone-300 rounded-lg" />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Justification</label>
            <textarea rows={2} value={reqJust} onChange={(e) => setReqJust(e.target.value)} className="w-full px-3 py-2 text-sm border border-stone-300 rounded-lg" />
          </div>
          <div className="flex justify-end gap-2 pt-2 border-t border-stone-100">
            <button type="button" onClick={() => setReqModalOpen(false)} className="px-4 py-2 text-sm border border-stone-300 rounded-lg">Cancel</button>
            <button type="submit" disabled={saving} className="px-4 py-2 text-sm font-semibold text-white bg-[var(--brand-primary)] rounded-lg">Submit</button>
          </div>
        </form>
      </Modal>

      {/* Supplier Modal */}
      <Modal open={supModalOpen} onClose={() => setSupModalOpen(false)} title="Register Supplier" maxWidthClass="max-w-md">
        <form onSubmit={handleCreateSupplier} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Supplier Name</label>
            <input type="text" required value={supName} onChange={(e) => setSupName(e.target.value)} className="w-full px-3 py-2 text-sm border border-stone-300 rounded-lg" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Contact Person</label>
              <input type="text" value={supContact} onChange={(e) => setSupContact(e.target.value)} className="w-full px-3 py-2 text-sm border border-stone-300 rounded-lg" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Phone</label>
              <input type="text" value={supPhone} onChange={(e) => setSupPhone(e.target.value)} className="w-full px-3 py-2 text-sm border border-stone-300 rounded-lg" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Category</label>
              <input type="text" required value={supCategory} onChange={(e) => setSupCategory(e.target.value)} className="w-full px-3 py-2 text-sm border border-stone-300 rounded-lg" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">KRA PIN</label>
              <input type="text" value={supKra} onChange={(e) => setSupKra(e.target.value)} className="w-full px-3 py-2 text-sm font-mono border border-stone-300 rounded-lg" />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2 border-t border-stone-100">
            <button type="button" onClick={() => setSupModalOpen(false)} className="px-4 py-2 text-sm border border-stone-300 rounded-lg">Cancel</button>
            <button type="submit" disabled={saving} className="px-4 py-2 text-sm font-semibold text-white bg-[var(--brand-primary)] rounded-lg">Save Supplier</button>
          </div>
        </form>
      </Modal>

      {/* Asset Modal */}
      <Modal open={assetModalOpen} onClose={() => setAssetModalOpen(false)} title="Register Fixed Asset" maxWidthClass="max-w-md">
        <form onSubmit={handleCreateAsset} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Asset Tag</label>
              <input type="text" required value={astTag} onChange={(e) => setAstTag(e.target.value)} placeholder="ISA-AST-050" className="w-full px-3 py-2 text-sm font-mono border border-stone-300 rounded-lg" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Purchase Cost (KES)</label>
              <input type="number" min="0" required value={astCost} onChange={(e) => setAstCost(e.target.value)} className="w-full px-3 py-2 text-sm font-mono border border-stone-300 rounded-lg" />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Asset Name</label>
            <input type="text" required value={astName} onChange={(e) => setAstName(e.target.value)} className="w-full px-3 py-2 text-sm border border-stone-300 rounded-lg" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Category</label>
              <input type="text" value={astCategory} onChange={(e) => setAstCategory(e.target.value)} className="w-full px-3 py-2 text-sm border border-stone-300 rounded-lg" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Assigned Custodian</label>
              <input type="text" value={astAssigned} onChange={(e) => setAstAssigned(e.target.value)} className="w-full px-3 py-2 text-sm border border-stone-300 rounded-lg" />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Location</label>
            <input type="text" value={astLocation} onChange={(e) => setAstLocation(e.target.value)} className="w-full px-3 py-2 text-sm border border-stone-300 rounded-lg" />
          </div>
          <div className="flex justify-end gap-2 pt-2 border-t border-stone-100">
            <button type="button" onClick={() => setAssetModalOpen(false)} className="px-4 py-2 text-sm border border-stone-300 rounded-lg">Cancel</button>
            <button type="submit" disabled={saving} className="px-4 py-2 text-sm font-semibold text-white bg-[var(--brand-primary)] rounded-lg">Save Asset</button>
          </div>
        </form>
      </Modal>

      {/* Memo Modal */}
      <Modal open={memoModalOpen} onClose={() => setMemoModalOpen(false)} title="Post Internal Memo / Event" maxWidthClass="max-w-lg">
        <form onSubmit={handleCreateMemo} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Type</label>
              <select value={memoType} onChange={(e) => setMemoType(e.target.value as AdminMemo['recordType'])} className="w-full px-3 py-2 text-sm border border-stone-300 rounded-lg">
                <option value="memo">Internal Memo</option>
                <option value="event">Organisational Event</option>
                <option value="meeting">Meeting / Minutes</option>
                <option value="announcement">Announcement</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Event / Meeting Date</label>
              <input type="date" value={memoDate} onChange={(e) => setMemoDate(e.target.value)} className="w-full px-3 py-2 text-sm border border-stone-300 rounded-lg" />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Title</label>
            <input type="text" required value={memoTitle} onChange={(e) => setMemoTitle(e.target.value)} className="w-full px-3 py-2 text-sm border border-stone-300 rounded-lg" />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Location</label>
            <input type="text" value={memoLocation} onChange={(e) => setMemoLocation(e.target.value)} placeholder="e.g. Nairobi Main Hall" className="w-full px-3 py-2 text-sm border border-stone-300 rounded-lg" />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Details</label>
            <textarea rows={3} required value={memoBody} onChange={(e) => setMemoBody(e.target.value)} className="w-full px-3 py-2 text-sm border border-stone-300 rounded-lg" />
          </div>
          <div className="flex justify-end gap-2 pt-2 border-t border-stone-100">
            <button type="button" onClick={() => setMemoModalOpen(false)} className="px-4 py-2 text-sm border border-stone-300 rounded-lg">Cancel</button>
            <button type="submit" disabled={saving} className="px-4 py-2 text-sm font-semibold text-white bg-[var(--brand-primary)] rounded-lg">Publish</button>
          </div>
        </form>
      </Modal>

      {/* Asset QR Tag Modal */}
      <AssetQrModal
        asset={qrModalAsset}
        onClose={() => setQrModalAsset(null)}
        onQuickUpdate={(asset) => {
          setScanTargetAsset(asset);
          setScannerOpen(true);
        }}
      />

      {/* Mobile / Desktop Asset QR Scanner & Quick Check-Out Modal */}
      <AssetQrScannerModal
        open={scannerOpen}
        initialAsset={scanTargetAsset}
        assets={assets}
        userProfile={
          profile
            ? { uid: profile.uid, displayName: profile.displayName, role: profile.role }
            : null
        }
        canDisposeAsset={canDisposeAsset}
        onClose={() => {
          setScannerOpen(false);
          setScanTargetAsset(null);
        }}
        onSuccessNotice={(msg) => setNotice(msg)}
      />
    </div>
  );
}
