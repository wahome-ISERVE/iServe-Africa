import React, { useCallback, useEffect, useRef, useState } from 'react';
import jsQR from 'jsqr';
import { doc, serverTimestamp, updateDoc } from 'firebase/firestore';
import { Camera, CheckCircle2, LogIn, LogOut, QrCode, Search, Upload } from 'lucide-react';
import { db } from '../../lib/firebase.ts';
import { OperationType, handleFirestoreError } from '../../lib/firestoreError.ts';
import { recordAuditLog } from '../../lib/audit.ts';
import { Asset, RoleId } from '../../types/erp.ts';
import { Modal } from '../ui/Modal.tsx';
import { StatusText } from '../ui/StatusText.tsx';

interface AssetQrScannerModalProps {
  open: boolean;
  initialAsset?: Asset | null;
  assets: Asset[];
  userProfile: { uid: string; displayName: string; role: RoleId } | null;
  canDisposeAsset: boolean;
  onClose: () => void;
  onSuccessNotice: (message: string) => void;
}

type ActionMode = 'checkout' | 'checkin' | 'status';

export function resolveScannedAsset(rawText: string, assets: Asset[]): Asset | null {
  const trimmed = rawText.trim();
  if (!trimmed) return null;

  let assetIdParam = '';
  let assetTagParam = '';

  try {
    if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
      const url = new URL(trimmed);
      assetIdParam = url.searchParams.get('assetId')?.trim() || '';
      assetTagParam = url.searchParams.get('assetTag')?.trim() || '';
    }
  } catch {
    // Not a URL; continue matching raw string
  }

  if (assetIdParam) {
    const byId = assets.find((a) => a.id === assetIdParam);
    if (byId) return byId;
  }

  const candidateTag = (assetTagParam || trimmed).toLowerCase();
  const byTag = assets.find((a) => a.assetTag.toLowerCase() === candidateTag);
  if (byTag) return byTag;

  const byIdDirect = assets.find((a) => a.id.toLowerCase() === trimmed.toLowerCase());
  if (byIdDirect) return byIdDirect;

  const byQrValue = assets.find((a) => (a.qrCodeValue || '').toLowerCase() === trimmed.toLowerCase());
  return byQrValue || null;
}

export function AssetQrScannerModal({
  open,
  initialAsset = null,
  assets,
  userProfile,
  canDisposeAsset,
  onClose,
  onSuccessNotice,
}: AssetQrScannerModalProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);

  const [selectedAsset, setSelectedAsset] = useState<Asset | null>(initialAsset);
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [scanError, setScanError] = useState<string | null>(null);
  const [manualQuery, setManualQuery] = useState('');

  // Quick update / check-out form state
  const [actionMode, setActionMode] = useState<ActionMode>('checkout');
  const [checkedOutTo, setCheckedOutTo] = useState('');
  const [location, setLocation] = useState('');
  const [condition, setCondition] = useState<NonNullable<Asset['condition']>>('good');
  const [status, setStatus] = useState<Asset['status']>('active');
  const [scanNotes, setScanNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const stopCamera = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    setCameraActive(false);
  }, []);

  const hydrateAssetForm = useCallback(
    (asset: Asset) => {
      setSelectedAsset(asset);
      const isCurrentlyOut = asset.checkoutStatus === 'checked_out';
      setActionMode(isCurrentlyOut ? 'checkin' : 'checkout');
      setCheckedOutTo(
        isCurrentlyOut
          ? asset.checkedOutTo || ''
          : userProfile?.displayName || asset.assignedToName || ''
      );
      setLocation(asset.location || '');
      setCondition(asset.condition || 'good');
      setStatus(asset.status || 'active');
      setScanNotes('');
      setSaveError(null);
      setScanError(null);
    },
    [userProfile?.displayName]
  );

  useEffect(() => {
    if (!open) {
      stopCamera();
      setSelectedAsset(null);
      setCameraError(null);
      setScanError(null);
      setManualQuery('');
      return;
    }
    if (initialAsset) {
      stopCamera();
      hydrateAssetForm(initialAsset);
    } else {
      setSelectedAsset(null);
    }
  }, [open, initialAsset, hydrateAssetForm, stopCamera]);

  useEffect(() => {
    return () => {
      stopCamera();
    };
  }, [stopCamera]);

  const handleDecodedPayload = useCallback(
    (rawText: string) => {
      const matched = resolveScannedAsset(rawText, assets);
      if (!matched) {
        setScanError(`QR code scanned ("${rawText.slice(0, 60)}"), but no matching asset was found in the register.`);
        return;
      }
      stopCamera();
      hydrateAssetForm(matched);
    },
    [assets, hydrateAssetForm, stopCamera]
  );

  const startCamera = async () => {
    setCameraError(null);
    setScanError(null);
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setCameraError('Live camera streaming is unavailable in this browser. Upload a QR photo or enter the Asset Tag below.');
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' } },
        audio: false,
      });
      streamRef.current = stream;
      setCameraActive(true);

      requestAnimationFrame(() => {
        const video = videoRef.current;
        if (!video) return;
        video.srcObject = stream;
        void video.play().catch(() => {});

        const tick = () => {
          const v = videoRef.current;
          const canvas = canvasRef.current;
          if (!v || !canvas || !streamRef.current) return;

          if (v.readyState === v.HAVE_ENOUGH_DATA && v.videoWidth > 0 && v.videoHeight > 0) {
            canvas.width = v.videoWidth;
            canvas.height = v.videoHeight;
            const ctx = canvas.getContext('2d', { willReadFrequently: true });
            if (ctx) {
              ctx.drawImage(v, 0, 0, canvas.width, canvas.height);
              const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
              const decoded = jsQR(imgData.data, imgData.width, imgData.height, {
                inversionAttempts: 'attemptBoth',
              });
              if (decoded?.data) {
                handleDecodedPayload(decoded.data);
                return;
              }
            }
          }
          rafRef.current = requestAnimationFrame(tick);
        };
        rafRef.current = requestAnimationFrame(tick);
      });
    } catch {
      setCameraError('Camera access was denied or blocked. Use "Upload / Capture QR Photo" or enter the Asset Tag manually.');
      stopCamera();
    }
  };

  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setScanError(null);

    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        ctx.drawImage(img, 0, 0);
        const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const decoded = jsQR(imgData.data, imgData.width, imgData.height, {
          inversionAttempts: 'attemptBoth',
        });
        if (decoded?.data) {
          handleDecodedPayload(decoded.data);
        } else {
          setScanError('Could not detect a QR code in that image. Try clearer lighting or enter the Asset Tag.');
        }
      };
      img.src = String(reader.result || '');
    };
    reader.readAsDataURL(file);
  };

  const handleManualLookup = (e: React.FormEvent) => {
    e.preventDefault();
    setScanError(null);
    const matched = resolveScannedAsset(manualQuery, assets);
    if (!matched) {
      setScanError(`No asset matched "${manualQuery.trim()}". Check the Asset Tag and try again.`);
      return;
    }
    stopCamera();
    hydrateAssetForm(matched);
  };

  const handleSubmitUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedAsset || !userProfile) return;
    setSaveError(null);

    if (actionMode === 'checkout' && checkedOutTo.trim().length < 2) {
      setSaveError('Enter the name of the staff member checking out this asset.');
      return;
    }

    const nowIso = new Date().toISOString();
    const nextCheckoutStatus: 'available' | 'checked_out' =
      actionMode === 'checkout'
        ? 'checked_out'
        : actionMode === 'checkin'
          ? 'available'
          : selectedAsset.checkoutStatus || 'available';

    const nextCheckedOutTo =
      actionMode === 'checkout'
        ? checkedOutTo.trim()
        : actionMode === 'checkin'
          ? ''
          : selectedAsset.checkedOutTo || '';

    const nextAssignedTo =
      actionMode === 'checkout'
        ? checkedOutTo.trim()
        : actionMode === 'checkin'
          ? 'Central Store / Pool'
          : selectedAsset.assignedToName || '';

    const nextStatus = !canDisposeAsset && status === 'disposed' ? selectedAsset.status : status;

    setSaving(true);
    try {
      await updateDoc(doc(db, 'assets', selectedAsset.id), {
        checkoutStatus: nextCheckoutStatus,
        checkedOutTo: nextCheckedOutTo,
        checkedOutByUid: actionMode === 'checkout' ? userProfile.uid : selectedAsset.checkedOutByUid || '',
        checkedOutAt: actionMode === 'checkout' ? nowIso : selectedAsset.checkedOutAt || '',
        assignedToName: nextAssignedTo,
        location: location.trim(),
        condition,
        status: nextStatus,
        lastScannedAt: nowIso,
        lastScannedBy: userProfile.displayName,
        scanNotes: scanNotes.trim(),
        updatedAt: serverTimestamp(),
      });

      const actionType =
        actionMode === 'checkout'
          ? 'SCAN_ASSET_CHECKOUT'
          : actionMode === 'checkin'
            ? 'SCAN_ASSET_CHECKIN'
            : 'SCAN_ASSET_STATUS_UPDATE';

      const summary =
        actionMode === 'checkout'
          ? `Checked out ${selectedAsset.assetTag} (${selectedAsset.name}) to ${nextCheckedOutTo} at ${location.trim() || 'Nairobi'}`
          : actionMode === 'checkin'
            ? `Checked in ${selectedAsset.assetTag} (${selectedAsset.name}) — condition: ${condition}, status: ${nextStatus}`
            : `Updated ${selectedAsset.assetTag} (${selectedAsset.name}) via QR scan — condition: ${condition}, status: ${nextStatus}`;

      await recordAuditLog({
        actorUid: userProfile.uid,
        actorName: userProfile.displayName,
        actorRole: userProfile.role,
        action: actionType,
        targetCollection: 'assets',
        targetId: selectedAsset.id,
        summary,
      });

      onSuccessNotice(summary);
      onClose();
    } catch (err) {
      try {
        handleFirestoreError(err, OperationType.UPDATE, `assets/${selectedAsset.id}`);
      } catch (formatted) {
        setSaveError(formatted instanceof Error ? formatted.message : 'Unable to update asset.');
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={() => {
        stopCamera();
        onClose();
      }}
      title={selectedAsset ? `Quick Asset Action · ${selectedAsset.assetTag}` : 'Scan Asset QR Code'}
      subtitle={
        selectedAsset
          ? 'Record check-out, return, or condition update directly from mobile or desktop'
          : 'Point a camera at an asset label, capture a QR photo, or enter an Asset Tag'
      }
      maxWidthClass="max-w-lg"
    >
      {!selectedAsset ? (
        <div className="space-y-4">
          {scanError && (
            <div className="p-2.5 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700" role="alert">
              {scanError}
            </div>
          )}
          {cameraError && (
            <div className="p-2.5 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800">
              {cameraError}
            </div>
          )}

          {/* Live Camera Viewport */}
          <div className="border border-stone-200 rounded-xl bg-stone-50 p-4 space-y-3">
            {cameraActive ? (
              <div className="space-y-3">
                <div className="relative rounded-lg overflow-hidden bg-slate-900 aspect-video flex items-center justify-center">
                  <video ref={videoRef} playsInline muted className="w-full h-full object-cover" />
                  <div className="absolute inset-0 border-2 border-emerald-400/70 m-8 rounded-lg pointer-events-none" />
                </div>
                <canvas ref={canvasRef} className="hidden" />
                <div className="flex items-center justify-between text-xs text-slate-600">
                  <span>Align the asset QR code inside the frame...</span>
                  <button
                    type="button"
                    onClick={stopCamera}
                    className="px-3 py-1.5 font-medium text-slate-700 bg-white border border-stone-300 rounded-lg"
                  >
                    Stop Camera
                  </button>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <button
                  type="button"
                  onClick={() => void startCamera()}
                  className="min-h-11 inline-flex items-center justify-center gap-2 px-4 py-2.5 text-xs font-semibold text-white bg-[var(--brand-primary)] hover:bg-[var(--brand-primary-hover)] rounded-lg"
                >
                  <Camera className="w-4 h-4" />
                  Open Camera Scanner
                </button>
                <label className="min-h-11 inline-flex items-center justify-center gap-2 px-4 py-2.5 text-xs font-medium text-slate-800 bg-white border border-stone-300 rounded-lg hover:bg-stone-50 cursor-pointer">
                  <Upload className="w-4 h-4" />
                  Capture / Upload QR Photo
                  <input
                    type="file"
                    accept="image/*"
                    capture="environment"
                    onChange={handlePhotoUpload}
                    className="hidden"
                  />
                </label>
              </div>
            )}
          </div>

          {/* Manual Tag / Code Fallback */}
          <form onSubmit={handleManualLookup} className="space-y-2 pt-2 border-t border-stone-200">
            <label htmlFor="qr-manual-lookup" className="block text-xs font-medium text-slate-700">
              Or Look Up by Asset Tag / Scanned Code
            </label>
            <div className="flex gap-2">
              <input
                id="qr-manual-lookup"
                type="text"
                value={manualQuery}
                onChange={(e) => setManualQuery(e.target.value)}
                placeholder="e.g. ISA-AST-019"
                className="flex-1 min-h-11 px-3 py-2 text-sm font-mono border border-stone-300 rounded-lg"
              />
              <button
                type="submit"
                className="min-h-11 inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg whitespace-nowrap"
              >
                <Search className="w-3.5 h-3.5" />
                Find Asset
              </button>
            </div>
          </form>

          {assets.length > 0 && (
            <div className="space-y-1.5">
              <div className="text-[11px] font-medium text-slate-500">Quick Select Registered Asset</div>
              <div className="max-h-40 overflow-y-auto divide-y divide-stone-100 border border-stone-200 rounded-lg">
                {assets.slice(0, 8).map((a) => (
                  <button
                    key={a.id}
                    type="button"
                    onClick={() => hydrateAssetForm(a)}
                    className="w-full px-3 py-2 text-left hover:bg-stone-50 flex items-center justify-between gap-2 text-xs"
                  >
                    <div className="min-w-0">
                      <span className="font-mono font-semibold text-slate-900">{a.assetTag}</span>
                      <span className="text-slate-400 mx-1.5">·</span>
                      <span className="text-slate-700 truncate">{a.name}</span>
                    </div>
                    <StatusText status={a.checkoutStatus || 'available'} />
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      ) : (
        <form onSubmit={(e) => void handleSubmitUpdate(e)} className="space-y-4">
          {saveError && (
            <div className="p-2.5 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700" role="alert">
              {saveError}
            </div>
          )}

          {/* Scanned Asset Snapshot */}
          <div className="p-3.5 bg-stone-50 border border-stone-200 rounded-xl space-y-1.5">
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="text-xs font-mono text-slate-500">
                  {selectedAsset.assetTag} · {selectedAsset.category}
                </div>
                <div className="text-sm font-semibold text-slate-900">{selectedAsset.name}</div>
              </div>
              <StatusText status={selectedAsset.checkoutStatus || 'available'} />
            </div>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-600">
              <span>Current location: {selectedAsset.location || 'Nairobi'}</span>
              {selectedAsset.checkedOutTo && (
                <span>
                  · Checked out to <strong>{selectedAsset.checkedOutTo}</strong>
                </span>
              )}
              {selectedAsset.lastScannedAt && (
                <span className="text-[11px] font-mono text-slate-500">
                  · Last scan: {selectedAsset.lastScannedAt.slice(0, 10)} ({selectedAsset.lastScannedBy || 'Staff'})
                </span>
              )}
            </div>
          </div>

          {/* Mobile-friendly Action Mode Selector */}
          <div>
            <div className="text-xs font-medium text-slate-700 mb-1.5">Select Quick Action</div>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => {
                  setActionMode('checkout');
                  if (!checkedOutTo && userProfile) setCheckedOutTo(userProfile.displayName);
                }}
                className={`min-h-11 px-2.5 py-2 text-xs font-medium rounded-lg border flex items-center justify-center gap-1.5 transition-colors ${
                  actionMode === 'checkout'
                    ? 'bg-[#0d4f3c] text-white border-[#0d4f3c]'
                    : 'bg-white text-slate-700 border-stone-300 hover:bg-stone-50'
                }`}
              >
                <LogOut className="w-3.5 h-3.5 shrink-0" />
                <span>Check Out</span>
              </button>
              <button
                type="button"
                onClick={() => setActionMode('checkin')}
                className={`min-h-11 px-2.5 py-2 text-xs font-medium rounded-lg border flex items-center justify-center gap-1.5 transition-colors ${
                  actionMode === 'checkin'
                    ? 'bg-[#0d4f3c] text-white border-[#0d4f3c]'
                    : 'bg-white text-slate-700 border-stone-300 hover:bg-stone-50'
                }`}
              >
                <LogIn className="w-3.5 h-3.5 shrink-0" />
                <span>Return / In</span>
              </button>
              <button
                type="button"
                onClick={() => setActionMode('status')}
                className={`min-h-11 px-2.5 py-2 text-xs font-medium rounded-lg border flex items-center justify-center gap-1.5 transition-colors ${
                  actionMode === 'status'
                    ? 'bg-[#0d4f3c] text-white border-[#0d4f3c]'
                    : 'bg-white text-slate-700 border-stone-300 hover:bg-stone-50'
                }`}
              >
                <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                <span>Status Only</span>
              </button>
            </div>
          </div>

          {actionMode === 'checkout' && (
            <div>
              <label htmlFor="scan-checkout-to" className="block text-xs font-medium text-slate-700 mb-1">
                Check Out To (Custodian / Borrower) *
              </label>
              <input
                id="scan-checkout-to"
                type="text"
                required
                maxLength={160}
                value={checkedOutTo}
                onChange={(e) => setCheckedOutTo(e.target.value)}
                placeholder="Staff name or ministry team"
                className="w-full min-h-11 px-3 py-2 text-sm border border-stone-300 rounded-lg"
              />
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label htmlFor="scan-location" className="block text-xs font-medium text-slate-700 mb-1">
                Location
              </label>
              <input
                id="scan-location"
                type="text"
                maxLength={160}
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="e.g. Kisumu Field"
                className="w-full min-h-11 px-3 py-2 text-sm border border-stone-300 rounded-lg"
              />
            </div>
            <div>
              <label htmlFor="scan-condition" className="block text-xs font-medium text-slate-700 mb-1">
                Condition
              </label>
              <select
                id="scan-condition"
                value={condition}
                onChange={(e) => setCondition(e.target.value as NonNullable<Asset['condition']>)}
                className="w-full min-h-11 px-3 py-2 text-sm border border-stone-300 rounded-lg"
              >
                <option value="excellent">Excellent</option>
                <option value="good">Good</option>
                <option value="fair">Fair</option>
                <option value="needs_repair">Needs Repair</option>
              </select>
            </div>
            <div>
              <label htmlFor="scan-status" className="block text-xs font-medium text-slate-700 mb-1">
                Asset Status
              </label>
              <select
                id="scan-status"
                value={status}
                onChange={(e) => setStatus(e.target.value as Asset['status'])}
                className="w-full min-h-11 px-3 py-2 text-sm border border-stone-300 rounded-lg"
              >
                <option value="active">Active</option>
                <option value="maintenance">Maintenance</option>
                {canDisposeAsset && <option value="disposed">Disposed</option>}
              </select>
            </div>
          </div>

          <div>
            <label htmlFor="scan-notes" className="block text-xs font-medium text-slate-700 mb-1">
              Scan / Handover Notes
            </label>
            <textarea
              id="scan-notes"
              rows={2}
              maxLength={600}
              value={scanNotes}
              onChange={(e) => setScanNotes(e.target.value)}
              placeholder="Optional trip purpose, handover notes, or repair observation..."
              className="w-full px-3 py-2 text-sm border border-stone-300 rounded-lg"
            />
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-stone-100">
            {!initialAsset ? (
              <button
                type="button"
                onClick={() => setSelectedAsset(null)}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-700 border border-stone-300 rounded-lg hover:bg-stone-50"
              >
                <QrCode className="w-3.5 h-3.5" />
                Scan Another
              </button>
            ) : (
              <span />
            )}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={onClose}
                className="min-h-10 px-4 py-2 text-sm border border-stone-300 rounded-lg"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="min-h-10 px-4 py-2 text-sm font-semibold text-white bg-[var(--brand-primary)] hover:bg-[var(--brand-primary-hover)] rounded-lg"
              >
                {saving
                  ? 'Saving...'
                  : actionMode === 'checkout'
                    ? 'Confirm Check-Out'
                    : actionMode === 'checkin'
                      ? 'Confirm Return'
                      : 'Update Status'}
              </button>
            </div>
          </div>
        </form>
      )}
    </Modal>
  );
}
