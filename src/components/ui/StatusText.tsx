import { CheckCircle2, Clock, AlertTriangle, XCircle, FileEdit } from 'lucide-react';

const STATUS_MAP: Record<string, { label: string; colorClass: string; Icon: typeof CheckCircle2 }> = {
  active: { label: 'Active', colorClass: 'text-emerald-700', Icon: CheckCircle2 },
  available: { label: 'Available', colorClass: 'text-emerald-700', Icon: CheckCircle2 },
  checked_out: { label: 'Checked Out', colorClass: 'text-amber-700', Icon: Clock },
  approved: { label: 'Approved', colorClass: 'text-emerald-700', Icon: CheckCircle2 },
  paid: { label: 'Paid', colorClass: 'text-emerald-700', Icon: CheckCircle2 },
  completed: { label: 'Completed', colorClass: 'text-emerald-700', Icon: CheckCircle2 },
  received: { label: 'Received', colorClass: 'text-emerald-700', Icon: CheckCircle2 },
  synced: { label: 'Synced', colorClass: 'text-emerald-700', Icon: CheckCircle2 },
  permanent: { label: 'Permanent', colorClass: 'text-emerald-700', Icon: CheckCircle2 },
  excellent: { label: 'Excellent', colorClass: 'text-emerald-700', Icon: CheckCircle2 },
  good: { label: 'Good', colorClass: 'text-emerald-700', Icon: CheckCircle2 },

  submitted: { label: 'Submitted', colorClass: 'text-amber-700', Icon: Clock },
  under_review: { label: 'Under Review', colorClass: 'text-amber-700', Icon: Clock },
  issued: { label: 'Issued', colorClass: 'text-amber-700', Icon: Clock },
  pending_approval: { label: 'Pending Approval', colorClass: 'text-amber-700', Icon: Clock },
  pending_hr: { label: 'Pending HR', colorClass: 'text-amber-700', Icon: Clock },
  pending: { label: 'Pending', colorClass: 'text-amber-700', Icon: Clock },
  upcoming: { label: 'Upcoming', colorClass: 'text-amber-700', Icon: Clock },
  planning: { label: 'Planning', colorClass: 'text-amber-700', Icon: Clock },
  planned: { label: 'Planned', colorClass: 'text-slate-600', Icon: Clock },
  in_progress: { label: 'In Progress', colorClass: 'text-emerald-700', Icon: Clock },
  contract: { label: 'Contract', colorClass: 'text-amber-700', Icon: Clock },
  probation: { label: 'Probation', colorClass: 'text-amber-700', Icon: Clock },
  po_issued: { label: 'PO Issued', colorClass: 'text-amber-700', Icon: Clock },
  maintenance: { label: 'Maintenance', colorClass: 'text-amber-700', Icon: AlertTriangle },
  fair: { label: 'Fair', colorClass: 'text-amber-700', Icon: AlertTriangle },
  credentials_required: { label: 'Credentials Required', colorClass: 'text-amber-700', Icon: AlertTriangle },
  not_configured: { label: 'Not Configured', colorClass: 'text-slate-600', Icon: AlertTriangle },

  returned: { label: 'Returned for Revision', colorClass: 'text-amber-700', Icon: AlertTriangle },
  delayed: { label: 'Delayed', colorClass: 'text-red-700', Icon: AlertTriangle },
  needs_support: { label: 'Needs Support', colorClass: 'text-red-700', Icon: AlertTriangle },
  needs_repair: { label: 'Needs Repair', colorClass: 'text-red-700', Icon: AlertTriangle },
  on_hold: { label: 'On Hold', colorClass: 'text-amber-700', Icon: AlertTriangle },

  rejected: { label: 'Rejected', colorClass: 'text-red-700', Icon: XCircle },
  cancelled: { label: 'Cancelled', colorClass: 'text-slate-500', Icon: XCircle },
  inactive: { label: 'Inactive', colorClass: 'text-slate-500', Icon: XCircle },
  discontinued: { label: 'Discontinued', colorClass: 'text-slate-500', Icon: XCircle },
  disposed: { label: 'Disposed', colorClass: 'text-slate-500', Icon: XCircle },
  exited: { label: 'Exited', colorClass: 'text-slate-500', Icon: XCircle },
  error: { label: 'Error', colorClass: 'text-red-700', Icon: XCircle },

  draft: { label: 'Draft', colorClass: 'text-slate-600', Icon: FileEdit },
  retired: { label: 'Retired', colorClass: 'text-emerald-700', Icon: CheckCircle2 },
  settled: { label: 'Settled', colorClass: 'text-emerald-700', Icon: CheckCircle2 },
  published: { label: 'Published', colorClass: 'text-emerald-700', Icon: CheckCircle2 },
};

export function StatusText({ status }: { status?: string }) {
  const key = (status || 'draft').toLowerCase();
  const entry = STATUS_MAP[key] || {
    label: status ? status.replace(/_/g, ' ') : 'Unknown',
    colorClass: 'text-slate-700',
    Icon: Clock,
  };
  const Icon = entry.Icon;
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-medium whitespace-nowrap ${entry.colorClass}`}>
      <Icon className="w-3.5 h-3.5 shrink-0" />
      <span>{entry.label}</span>
    </span>
  );
}
