import { useEffect, useMemo } from 'react';
import { Download, FileText } from 'lucide-react';
import { Modal } from '../ui/Modal.tsx';
import { dataUrlToBlobUrl, triggerDataUrlDownload } from '../../lib/fileUpload.ts';

interface AttachmentPreviewModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  fileName: string;
  mimeType?: string;
  dataUrl: string;
  subtitle?: string;
}

export function AttachmentPreviewModal({
  open,
  onClose,
  title,
  fileName,
  mimeType,
  dataUrl,
  subtitle,
}: AttachmentPreviewModalProps) {
  const isPdf =
    mimeType === 'application/pdf' ||
    dataUrl.startsWith('data:application/pdf') ||
    fileName.toLowerCase().endsWith('.pdf');

  const blobUrl = useMemo(() => {
    if (!open || !dataUrl || !isPdf) return '';
    return dataUrlToBlobUrl(dataUrl);
  }, [open, dataUrl, isPdf]);

  useEffect(() => {
    return () => {
      if (blobUrl && blobUrl.startsWith('blob:')) {
        URL.revokeObjectURL(blobUrl);
      }
    };
  }, [blobUrl]);

  return (
    <Modal open={open} onClose={onClose} title={title} subtitle={subtitle || fileName} maxWidthClass="max-w-3xl">
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-stone-200">
          <div className="flex items-center gap-2 text-xs text-slate-600">
            <FileText className="w-4 h-4 text-emerald-800 shrink-0" />
            <span className="font-mono truncate max-w-xs sm:max-w-md">{fileName}</span>
          </div>
          <button
            type="button"
            onClick={() => triggerDataUrlDownload(dataUrl, fileName)}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-white bg-[var(--brand-primary)] hover:bg-[var(--brand-primary-hover)] rounded-lg min-h-[40px]"
          >
            <Download className="w-3.5 h-3.5" />
            Download File
          </button>
        </div>

        {isPdf ? (
          <div className="bg-stone-100 border border-stone-200 rounded-lg overflow-hidden">
            <iframe
              src={blobUrl || dataUrl}
              title={fileName}
              className="w-full h-[65vh] min-h-[380px] bg-white"
            />
          </div>
        ) : (
          <div className="bg-stone-100 border border-stone-200 rounded-lg p-3 flex items-center justify-center max-h-[65vh] overflow-auto">
            <img
              src={dataUrl}
              alt={fileName}
              className="max-w-full max-h-[58vh] rounded-md object-contain"
            />
          </div>
        )}
      </div>
    </Modal>
  );
}
