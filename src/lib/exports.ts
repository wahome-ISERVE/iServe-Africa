import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';

export interface ExportColumn {
  header: string;
  key: string;
}

export function exportToExcel(params: {
  fileName: string;
  sheetName: string;
  title: string;
  columns: ExportColumn[];
  rows: Record<string, string | number>[];
}): void {
  const headerRow = params.columns.map((c) => c.header);
  const dataRows = params.rows.map((r) =>
    params.columns.map((c) => (r[c.key] !== undefined && r[c.key] !== null ? r[c.key] : ''))
  );
  const generatedAt = new Date().toLocaleString('en-KE', { timeZone: 'Africa/Nairobi' });
  const wsData = [
    ['iServe Africa Integrated Management System (iServe IMS)'],
    [params.title],
    [`Generated (Africa/Nairobi): ${generatedAt}`, 'Currency: KES'],
    [],
    headerRow,
    ...dataRows,
  ];
  const worksheet = XLSX.utils.aoa_to_sheet(wsData);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, params.sheetName.slice(0, 31));
  XLSX.writeFile(workbook, `${params.fileName}.xlsx`);
}

export function exportToPdf(params: {
  fileName: string;
  title: string;
  subtitle?: string;
  columns: ExportColumn[];
  rows: Record<string, string | number>[];
  orientation?: 'portrait' | 'landscape';
}): void {
  const doc = new jsPDF({ orientation: params.orientation || 'landscape', unit: 'pt', format: 'a4' });
  const generatedAt = new Date().toLocaleString('en-KE', { timeZone: 'Africa/Nairobi' });

  doc.setFillColor(13, 79, 60);
  doc.rect(0, 0, doc.internal.pageSize.getWidth(), 56, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(14);
  doc.text('iServe Africa — Integrated Management System', 36, 26);
  doc.setFontSize(9);
  doc.text(`Nairobi, Kenya · Currency: KES · Generated: ${generatedAt} (EAT)`, 36, 42);

  doc.setTextColor(15, 23, 42);
  doc.setFontSize(13);
  doc.text(params.title, 36, 82);
  if (params.subtitle) {
    doc.setFontSize(9.5);
    doc.setTextColor(71, 85, 105);
    doc.text(params.subtitle, 36, 98);
  }

  autoTable(doc, {
    startY: params.subtitle ? 114 : 98,
    head: [params.columns.map((c) => c.header)],
    body: params.rows.map((r) =>
      params.columns.map((c) => (r[c.key] !== undefined && r[c.key] !== null ? String(r[c.key]) : '—'))
    ),
    styles: {
      fontSize: 8.5,
      cellPadding: 6,
      textColor: [15, 23, 42],
    },
    headStyles: {
      fillColor: [13, 79, 60],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
    },
    alternateRowStyles: {
      fillColor: [248, 250, 252],
    },
    margin: { left: 36, right: 36 },
  });

  doc.save(`${params.fileName}.pdf`);
}

function escapeCsvCell(value: string | number | boolean | null | undefined): string {
  if (value === null || value === undefined) return '';
  const str = String(value);
  if (/[",\r\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function exportToCsv(params: {
  fileName: string;
  columns: ExportColumn[];
  rows: Record<string, string | number | boolean | null | undefined>[];
}): void {
  const headerLine = params.columns.map((c) => escapeCsvCell(c.header)).join(',');
  const dataLines = params.rows.map((row) =>
    params.columns.map((c) => escapeCsvCell(row[c.key])).join(',')
  );
  const csvContent = `\uFEFF${[headerLine, ...dataLines].join('\r\n')}`;
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = params.fileName.endsWith('.csv') ? params.fileName : `${params.fileName}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

