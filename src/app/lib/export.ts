/**
 * Shared export utilities used across the app.
 *
 * Real file generation (PDF / Excel / CSV) from live data. No stubs: each
 * function builds an actual file and triggers a browser download.
 */
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import * as XLSX from "xlsx";

/** Format an integer UGX amount with thousands separators. */
export function formatUGX(amount: number): string {
  const n = Math.round(Number(amount) || 0);
  return `UGX ${n.toLocaleString("en-UG")}`;
}

function tsStamp(): string {
  return new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
}

function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export interface PdfTable {
  title?: string;
  head: string[];
  rows: (string | number)[][];
}

export interface PdfDocOptions {
  title: string;
  subtitle?: string;
  meta?: { label: string; value: string }[];
  tables: PdfTable[];
  filename?: string;
}

const BRAND = { r: 13, g: 92, b: 58 }; // Kuula green

/** Build a branded multi-table PDF and download it. */
export function downloadPdf(opts: PdfDocOptions): void {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const marginX = 40;
  let y = 48;

  doc.setFillColor(BRAND.r, BRAND.g, BRAND.b);
  doc.rect(0, 0, pageWidth, 8, "F");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(20);
  doc.setTextColor(BRAND.r, BRAND.g, BRAND.b);
  doc.text("Kuula", marginX, y);
  doc.setTextColor(40, 40, 40);
  doc.setFontSize(14);
  y += 22;
  doc.text(opts.title, marginX, y);

  if (opts.subtitle) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(110, 110, 110);
    y += 16;
    doc.text(opts.subtitle, marginX, y);
  }

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(130, 130, 130);
  y += 16;
  doc.text(`Generated ${new Date().toLocaleString("en-GB")}`, marginX, y);

  if (opts.meta?.length) {
    y += 14;
    doc.setTextColor(60, 60, 60);
    doc.setFontSize(10);
    for (const m of opts.meta) {
      doc.text(`${m.label}: ${m.value}`, marginX, y);
      y += 14;
    }
  }
  y += 8;

  for (const table of opts.tables) {
    if (table.title) {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(11);
      doc.setTextColor(40, 40, 40);
      doc.text(table.title, marginX, y);
      y += 8;
    }
    autoTable(doc, {
      startY: y,
      head: [table.head],
      body: table.rows.map((r) => r.map((c) => String(c))),
      margin: { left: marginX, right: marginX },
      styles: { fontSize: 9, cellPadding: 5 },
      headStyles: { fillColor: [BRAND.r, BRAND.g, BRAND.b], textColor: 255 },
      alternateRowStyles: { fillColor: [244, 248, 246] },
    });
    // @ts-expect-error jspdf-autotable augments the doc instance at runtime.
    y = (doc.lastAutoTable?.finalY ?? y) + 24;
  }

  const filename = opts.filename ?? `kuula-${opts.title.toLowerCase().replace(/\s+/g, "-")}-${tsStamp()}.pdf`;
  doc.save(filename);
}

export interface ExcelSheet {
  name: string;
  /** First row is treated as the header. */
  rows: (string | number)[][];
}

/** Build a multi-sheet .xlsx workbook and download it. */
export function downloadExcel(filename: string, sheets: ExcelSheet[]): void {
  const wb = XLSX.utils.book_new();
  for (const sheet of sheets) {
    const ws = XLSX.utils.aoa_to_sheet(sheet.rows);
    XLSX.utils.book_append_sheet(wb, ws, sheet.name.slice(0, 31));
  }
  const out = XLSX.write(wb, { bookType: "xlsx", type: "array" });
  const name = filename.endsWith(".xlsx") ? filename : `${filename}-${tsStamp()}.xlsx`;
  triggerDownload(
    new Blob([out], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }),
    name,
  );
}

/** Build a CSV from a header + rows and download it. */
export function downloadCsv(filename: string, head: string[], rows: (string | number)[][]): void {
  const escape = (v: string | number) => {
    const s = String(v ?? "");
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [head, ...rows].map((r) => r.map(escape).join(","));
  const name = filename.endsWith(".csv") ? filename : `${filename}-${tsStamp()}.csv`;
  triggerDownload(new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" }), name);
}
