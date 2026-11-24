import React, { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { Check, Copy, Download, QrCode, ScanLine } from 'lucide-react';
import { Asset } from '../../types/erp.ts';
import { Modal } from '../ui/Modal.tsx';
import { StatusText } from '../ui/StatusText.tsx';

export function buildAssetQrPayload(asset: Pick<Asset, 'id' | 'assetTag' | 'qrCodeValue'>): string {
  if (asset.qrCodeValue && asset.qrCodeValue.trim()) {
    return asset.qrCodeValue.trim();
  }
  const origin = typeof window !== 'undefined' ? window.location.origin : 'https://iserve-ims.app';
  return `${origin}/?module=procurement&tab=assets&assetId=${encodeURIComponent(asset.id)}&assetTag=${encodeURIComponent(asset.assetTag)}`;
}

export function AssetQrThumbnail({
  asset,
  size = 42,
  onClick,
}: {
  asset: Asset;
  size?: number;
  onClick?: () => void;
}) {
  const [dataUrl, setDataUrl] = useState<string>('');
  const payload = buildAssetQrPayload(asset);

  useEffect(() => {
    let cancelled = false;
    QRCode.toDataURL(payload, {
      width: size * 2,
      margin: 1,
      errorCorrectionLevel: 'M',
      color: { dark: '#0f172a', light: '#ffffff' },
    })
      .then((url) => {
        if (!cancelled) setDataUrl(url);
      })
      .catch(() => {
        if (!cancelled) setDataUrl('');
      });
    return () => {
      cancelled = true;
    };
  }, [payload, size]);

  return (
    <button
      type="button"
      onClick={onClick}
      title={`View QR tag for ${asset.assetTag}`}
      aria-label={`View QR tag for ${asset.assetTag} ${asset.name}`}
      className="inline-flex items-center justify-center p-1 bg-white border border-stone-200 rounded-md hover:border-[#0d4f3c] transition-colors focus-visible:ring-2 focus-visible:ring-[#0d4f3c]"
    >
      {dataUrl ? (
        <img
          src={dataUrl}
          alt={`QR code for ${asset.assetTag}`}
          width={size}
          height={size}
          className="block rounded-xs"
        />
      ) : (
        <QrCode className="w-6 h-6 text-slate-400" />
      )}
    </button>
  );
}

interface AssetQrModalProps {
  asset: Asset | null;
  onClose: () => void;
  onQuickUpdate: (asset: Asset) => void;
}

export function AssetQrModal({ asset, onClose, onQuickUpdate }: AssetQrModalProps) {
  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  const [copied, setCopied] = useState(false);

  const qrPayload = asset ? buildAssetQrPayload(asset) : '';

  useEffect(() => {
    if (!asset || !qrPayload) {
      setQrDataUrl('');
      return;
    }
    let cancelled = false;
    QRCode.toDataURL(qrPayload, {
      width: 440,
      margin: 2,
      errorCorrectionLevel: 'H',
      color: { dark: '#0f172a', light: '#ffffff' },
    })
      .then((url) => {
        if (!cancelled) setQrDataUrl(url);
      })
      .catch(() => {
        if (!cancelled) setQrDataUrl('');
      });
    return () => {
      cancelled = true;
    };
  }, [asset, qrPayload]);

  const handleDownloadLabel = async () => {
    if (!asset || !qrDataUrl) return;
    const canvas = document.createElement('canvas');
    canvas.width = 520;
    canvas.height = 640;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.strokeStyle = '#d6d3d1';
    ctx.lineWidth = 4;
    ctx.strokeRect(14, 14, canvas.width - 28, canvas.height - 28);

    ctx.fillStyle = '#0d4f3c';
    ctx.fillRect(14, 14, canvas.width - 28, 56);

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 20px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('iServe Africa · Fixed Asset QR Tag', canvas.width / 2, 49);

    const img = new Image();
    img.onload = () => {
      ctx.drawImage(img, 90, 90, 340, 340);

      ctx.fillStyle = '#0f172a';
      ctx.font = 'bold 28px monospace';
      ctx.fillText(asset.assetTag, canvas.width / 2, 476);

      ctx.font = 'bold 18px sans-serif';
      const clippedName = asset.name.length > 42 ? `${asset.name.slice(0, 39)}...` : asset.name;
      ctx.fillText(clippedName, canvas.width / 2, 514);

      ctx.fillStyle = '#475569';
      ctx.font = '15px sans-serif';
      ctx.fillText(`${asset.category} · ${asset.location || 'Nairobi'}`, canvas.width / 2, 548);

      ctx.font = '13px monospace';
      ctx.fillStyle = '#64748b';
      ctx.fillText('Scan with mobile device for check-out & status', canvas.width / 2, 594);

      const link = document.createElement('a');
      link.download = `${asset.assetTag.replace(/[^a-zA-Z0-9_-]/g, '_')}_QR_Label.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
    };
    img.src = qrDataUrl;
  };

  const handleCopyLink = async () => {
    if (!qrPayload) return;
    try {
      await navigator.clipboard.writeText(qrPayload);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  };

  return (
    <Modal
      open={Boolean(asset)}
      onClose={onClose}
      title={asset ? `Asset QR Tag · ${asset.assetTag}` : 'Asset QR Tag'}
      subtitle="Print or scan with a mobile camera for instant check-out and status updates"
      maxWidthClass="max-w-md"
    >
      {asset && (
        <div className="space-y-4">
          <div className="border border-stone-200 rounded-xl p-5 bg-stone-50/60 text-center space-y-3">
            <div className="inline-block p-3 bg-white border border-stone-200 rounded-xl">
              {qrDataUrl ? (
                <img
                  src={qrDataUrl}
                  alt={`Unique QR code for ${asset.assetTag}`}
                  className="w-48 h-48 mx-auto"
                />
              ) : (
                <div className="w-48 h-48 flex items-center justify-center text-xs text-slate-400">
                  Generating QR...
                </div>
              )}
            </div>

            <div>
              <div className="text-base font-bold font-mono text-slate-900">{asset.assetTag}</div>
              <div className="text-sm font-semibold text-slate-800 mt-0.5">{asset.name}</div>
              <div className="text-xs text-slate-500 mt-1">
                {asset.category} · {asset.location || 'Nairobi'}
              </div>
            </div>

            <div className="pt-2 border-t border-stone-200 flex flex-wrap items-center justify-center gap-3 text-xs">
              <StatusText status={asset.checkoutStatus || 'available'} />
              <span aria-hidden="true" className="text-slate-300">
                ·
              </span>
              <StatusText status={asset.condition || asset.status} />
            </div>

            {asset.checkoutStatus === 'checked_out' && asset.checkedOutTo && (
              <div className="text-xs text-amber-800 font-medium">
                Checked out to {asset.checkedOutTo}
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-2.5">
            <button
              type="button"
              onClick={() => void handleDownloadLabel()}
              className="inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-800 bg-white border border-stone-300 rounded-lg hover:bg-stone-50 whitespace-nowrap"
            >
              <Download className="w-3.5 h-3.5" />
              Download Label PNG
            </button>
            <button
              type="button"
              onClick={() => void handleCopyLink()}
              className="inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-800 bg-white border border-stone-300 rounded-lg hover:bg-stone-50 whitespace-nowrap"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-700" /> : <Copy className="w-3.5 h-3.5" />}
              {copied ? 'Link Copied' : 'Copy Scan URL'}
            </button>
          </div>

          <div className="flex items-center justify-between gap-2 pt-2 border-t border-stone-100">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm border border-stone-300 rounded-lg"
            >
              Close
            </button>
            <button
              type="button"
              onClick={() => {
                const target = asset;
                onClose();
                onQuickUpdate(target);
              }}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-semibold text-white bg-[var(--brand-primary)] hover:bg-[var(--brand-primary-hover)] rounded-lg whitespace-nowrap"
            >
              <ScanLine className="w-4 h-4" />
              Check-Out / Update Status
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}
