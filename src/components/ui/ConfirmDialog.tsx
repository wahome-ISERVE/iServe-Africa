import { AlertCircle } from 'lucide-react';
import { Modal } from './Modal.tsx';

interface ConfirmDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void | Promise<void>;
  title: string;
  description: string;
  confirmLabel?: string;
  tone?: 'primary' | 'danger';
  loading?: boolean;
}

export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  description,
  confirmLabel = 'Confirm',
  tone = 'primary',
  loading = false,
}: ConfirmDialogProps) {
  return (
    <Modal open={open} onClose={onClose} title={title} maxWidthClass="max-w-md">
      <div className="space-y-5">
        <div className="flex items-start gap-3">
          <AlertCircle
            className={`w-5 h-5 shrink-0 mt-0.5 ${
              tone === 'danger' ? 'text-red-600' : 'text-amber-600'
            }`}
          />
          <p className="text-sm text-slate-600 leading-relaxed">{description}</p>
        </div>
        <div className="flex items-center justify-end gap-3 pt-2 border-t border-stone-100">
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-stone-300 rounded-lg hover:bg-stone-50 transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void onConfirm()}
            disabled={loading}
            className={`px-4 py-2 text-sm font-medium text-white rounded-lg transition-colors disabled:opacity-60 ${
              tone === 'danger'
                ? 'bg-red-700 hover:bg-red-800'
                : 'bg-[var(--brand-primary)] hover:bg-[var(--brand-primary-hover)]'
            }`}
          >
            {loading ? 'Processing...' : confirmLabel}
          </button>
        </div>
      </div>
    </Modal>
  );
}
