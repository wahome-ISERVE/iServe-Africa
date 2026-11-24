import { useMemo, useState } from 'react';
import { Download, Eye, FileText, GraduationCap, History } from 'lucide-react';
import { useAuth } from '../../context/AuthContext.tsx';
import { useData } from '../../context/DataContext.tsx';
import { triggerDataUrlDownload } from '../../lib/fileUpload.ts';
import { StatusText } from '../ui/StatusText.tsx';
import { AttachmentPreviewModal } from './AttachmentPreviewModal.tsx';
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

function parseVersionHistory(json?: string): { version: number; fileName: string; publishedDate: string; uploadedByName: string; note?: string }[] {
  if (!json) return [];
  try {
    const parsed = JSON.parse(json);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function MonthlyPdReportsSection() {
  const { profile } = useAuth();
  const { monthlyPdReports } = useData();

  const currentYear = new Date().getFullYear();
  const currentMonth = new Date().getMonth() + 1;

  const [filterYear, setFilterYear] = useState<string>(String(currentYear));
  const [filterMonth, setFilterMonth] = useState<string>(String(currentMonth));
  const [viewingReport, setViewingReport] = useState<MonthlyPdReport | null>(null);

  const uid = profile?.uid || '';

  const myReports = useMemo(
    () =>
      [...monthlyPdReports]
        .filter((r) => r.apprenticeUserId === uid)
        .sort((a, b) => (b.reportYear - a.reportYear) || (b.reportMonth - a.reportMonth)),
    [monthlyPdReports, uid]
  );

  const availableYears = useMemo(() => {
    const set = new Set<number>([currentYear, currentYear - 1]);
    myReports.forEach((r) => set.add(r.reportYear));
    return Array.from(set).sort((a, b) => b - a);
  }, [myReports, currentYear]);

  const filteredReports = useMemo(() => {
    return myReports.filter((r) => {
      if (filterYear !== 'all' && String(r.reportYear) !== filterYear) return false;
      if (filterMonth !== 'all' && String(r.reportMonth) !== filterMonth) return false;
      return true;
    });
  }, [myReports, filterYear, filterMonth]);

  const latestReport = myReports[0] || null;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 font-display">My Monthly PD Reports</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Access, view, and download your individual monthly Personal Development (PD) PDF reports published by Finance
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <select
            value={filterMonth}
            onChange={(e) => setFilterMonth(e.target.value)}
            aria-label="Filter by month"
            className="px-3 py-2 text-xs font-medium bg-white border border-stone-300 rounded-lg min-h-[40px]"
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
            aria-label="Filter by year"
            className="px-3 py-2 text-xs font-medium bg-white border border-stone-300 rounded-lg min-h-[40px]"
          >
            <option value="all">All Years</option>
            {availableYears.map((yr) => (
              <option key={yr} value={String(yr)}>
                {yr}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Latest Published PD Report Highlight */}
      {latestReport && (
        <section className="bg-white border border-stone-200 rounded-xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-start gap-3.5">
            <div className="p-2.5 rounded-xl bg-emerald-50 text-emerald-800 border border-emerald-200 shrink-0">
              <GraduationCap className="w-6 h-6" />
            </div>
            <div className="space-y-1">
              <div className="text-xs font-semibold text-emerald-800">
                Latest Published PD Report · {MONTH_NAMES[(latestReport.reportMonth || 1) - 1]} {latestReport.reportYear}
              </div>
              <h2 className="text-base font-bold text-slate-900 font-display">{latestReport.title}</h2>
              <p className="text-xs text-slate-500">
                Published {formatNairobiDate(latestReport.publishedDate)} by {latestReport.uploadedByName} · Version {latestReport.version}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setViewingReport(latestReport)}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-[var(--brand-primary)] hover:bg-[var(--brand-primary-hover)] rounded-lg min-h-[42px]"
            >
              <Eye className="w-3.5 h-3.5" />
              View PDF
            </button>
            <button
              type="button"
              onClick={() => triggerDataUrlDownload(latestReport.pdfDataUrl, latestReport.fileName)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-slate-700 bg-white border border-stone-300 rounded-lg hover:bg-stone-50 min-h-[42px]"
            >
              <Download className="w-3.5 h-3.5" />
              Download
            </button>
          </div>
        </section>
      )}

      {/* Filtered PD Reports List or Exact Empty State */}
      {filteredReports.length === 0 ? (
        <div className="bg-white border border-stone-200 rounded-xl p-10 text-center space-y-2">
          <FileText className="w-8 h-8 text-slate-400 mx-auto" />
          <p className="text-sm font-semibold text-slate-900">
            Your PD report for this month has not yet been published.
          </p>
          <p className="text-xs text-slate-500">
            Once the Finance Manager uploads and publishes your monthly Personal Development report, it will appear here and trigger a notification.
          </p>
          {(filterMonth !== 'all' || filterYear !== 'all') && myReports.length > 0 && (
            <button
              type="button"
              onClick={() => {
                setFilterMonth('all');
                setFilterYear('all');
              }}
              className="mt-2 inline-flex items-center px-3 py-1.5 text-xs font-medium text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-lg hover:bg-emerald-100"
            >
              Show All Historical PD Reports ({myReports.length})
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filteredReports.map((rep) => {
            const history = parseVersionHistory(rep.versionHistoryJson);
            return (
              <div key={rep.id} className="bg-white border border-stone-200 rounded-xl p-5 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-xs font-mono font-semibold text-emerald-800">
                      {MONTH_NAMES[(rep.reportMonth || 1) - 1]} {rep.reportYear} · v{rep.version}
                    </div>
                    <h3 className="text-base font-semibold text-slate-900 font-display mt-0.5">{rep.title}</h3>
                  </div>
                  <StatusText status={rep.status} />
                </div>

                {rep.description && (
                  <p className="text-xs text-slate-600 leading-relaxed">{rep.description}</p>
                )}

                <div className="text-[11px] text-slate-500 space-y-0.5 pt-1 border-t border-stone-100">
                  <div>Published: {formatNairobiDate(rep.publishedDate)} by {rep.uploadedByName}</div>
                  <div className="font-mono truncate">{rep.fileName}</div>
                </div>

                {history.length > 0 && (
                  <div className="text-[11px] text-slate-500 flex items-center gap-1.5">
                    <History className="w-3.5 h-3.5 text-slate-400" />
                    <span>{history.length} previous version(s) archived</span>
                  </div>
                )}

                <div className="flex flex-wrap items-center gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setViewingReport(rep)}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-[var(--brand-primary)] hover:bg-[var(--brand-primary-hover)] rounded-lg min-h-[40px]"
                  >
                    <Eye className="w-3.5 h-3.5" />
                    Open in PDF Viewer
                  </button>
                  <button
                    type="button"
                    onClick={() => triggerDataUrlDownload(rep.pdfDataUrl, rep.fileName)}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-slate-700 bg-white border border-stone-300 rounded-lg hover:bg-stone-50 min-h-[40px]"
                  >
                    <Download className="w-3.5 h-3.5" />
                    Download PDF
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {viewingReport && (
        <AttachmentPreviewModal
          open={Boolean(viewingReport)}
          onClose={() => setViewingReport(null)}
          title={`${MONTH_NAMES[(viewingReport.reportMonth || 1) - 1]} ${viewingReport.reportYear} — ${viewingReport.title}`}
          subtitle={`Published ${formatNairobiDate(viewingReport.publishedDate)} · Version ${viewingReport.version}`}
          fileName={viewingReport.fileName}
          mimeType="application/pdf"
          dataUrl={viewingReport.pdfDataUrl}
        />
      )}
    </div>
  );
}
