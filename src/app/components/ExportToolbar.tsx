import { useState } from "react";
import { Download, FileText, Printer } from "lucide-react";
import { downloadPdf, downloadExcel } from "../lib/export";

interface Props {
  title: string;
  filename: string;
  columns: string[];
  rows: (string | number)[][];
  disabled?: boolean;
}
/**
 * Export only data already returned by the authenticated, authorized endpoint.
 * Never fetch all customers, expand row visibility, or add hidden fields for export.
 */
export function ExportToolbar({ title, filename, columns, rows, disabled }: Props) {
  const [error, setError] = useState("");
  const blocked = disabled || rows.length === 0;
  const pdf = async () => {
    setError("");
    try { await downloadPdf({ title, tables: [{ head: columns, rows }], filename: filename + ".pdf" }); }
    catch { setError("Could not generate PDF. Please try again."); }
  };
  const excel = () => {
    setError("");
    try { downloadExcel(filename + ".xlsx", [{name:"Records",rows:[columns,...rows]}]); }
    catch { setError("Could not generate Excel. Please try again."); }
  };
  const print = async () => {
    // Print the same PDF as the downloadable record, without exposing another data source.
    await pdf();
    // The downloaded PDF can be printed by its native PDF viewer.
  };
  return <div className="kuula-export-toolbar" aria-label={title + " export options"}>
    <button type="button" disabled={blocked} onClick={() => void pdf()}><FileText size={16}/> PDF</button>
    <button type="button" disabled={blocked} onClick={excel}><Download size={16}/> Excel</button>
    <button type="button" disabled={blocked} onClick={() => void print()} title="Download print-ready A4 PDF"><Printer size={16}/> Print PDF</button>
    {error && <span role="alert">{error}</span>}
  </div>;
}
