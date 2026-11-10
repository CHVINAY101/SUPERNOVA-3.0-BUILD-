/**
 * SUPERNOVA 3.0 — Excel (XLSX) & CSV Secure Export Engine
 * 
 * Supports:
 * - Multi-sheet Excel (.xlsx) workbooks via 'xlsx' library
 * - UTF-8 BOM CSV exports with RFC 4180 compliance
 * - Comprehensive spreadsheet formula-injection neutralization
 * - Automatic column width calculation
 * - Audit logging to database and audit history
 */

import * as XLSX from "xlsx";
import { sanitizeFormulaInjection, escapeCsvField } from "./exportSanitizer";
import { supabase } from "@/lib/supabase";

export interface WorksheetData {
  name: string;
  data: Record<string, any>[];
  headers?: { key: string; label: string }[];
}

/**
 * Sanitizes an object record so all values are formula-injection safe
 */
export function sanitizeRecord<T extends Record<string, any>>(record: T): Record<string, any> {
  const sanitized: Record<string, any> = {};
  for (const [key, val] of Object.entries(record)) {
    if (typeof val === "string") {
      sanitized[key] = sanitizeFormulaInjection(val);
    } else if (val === null || val === undefined) {
      sanitized[key] = "";
    } else if (typeof val === "boolean") {
      sanitized[key] = val ? "Yes" : "No";
    } else if (typeof val === "object") {
      sanitized[key] = sanitizeFormulaInjection(JSON.stringify(val));
    } else {
      sanitized[key] = val;
    }
  }
  return sanitized;
}

/**
 * Calculates readable column widths based on maximum string lengths in the column
 */
function calculateColumnWidths(data: Record<string, any>[]): { wch: number }[] {
  if (!data || data.length === 0) return [];
  const keys = Object.keys(data[0]);
  return keys.map((key) => {
    let maxLen = key.length;
    for (const row of data) {
      const val = row[key];
      const strVal = val !== null && val !== undefined ? String(val) : "";
      if (strVal.length > maxLen) {
        maxLen = strVal.length;
      }
    }
    return { wch: Math.min(Math.max(maxLen + 3, 12), 45) };
  });
}

/**
 * Exports data into a real multi-sheet Excel (.xlsx) workbook and triggers browser download
 */
export function exportToExcel(sheets: WorksheetData[], filename: string): void {
  const wb = XLSX.utils.book_new();

  for (const sheet of sheets) {
    let rowsToExport: Record<string, any>[] = [];

    if (sheet.headers && sheet.headers.length > 0) {
      // Map data using custom header labels and order
      rowsToExport = sheet.data.map((item) => {
        const row: Record<string, any> = {};
        for (const h of sheet.headers!) {
          const val = item[h.key];
          if (typeof val === "string") {
            row[h.label] = sanitizeFormulaInjection(val);
          } else if (typeof val === "boolean") {
            row[h.label] = val ? "Yes" : "No";
          } else if (val === null || val === undefined) {
            row[h.label] = "";
          } else if (typeof val === "object") {
            row[h.label] = sanitizeFormulaInjection(JSON.stringify(val));
          } else {
            row[h.label] = val;
          }
        }
        return row;
      });
    } else {
      // Sanitize standard records
      rowsToExport = sheet.data.map(sanitizeRecord);
    }

    if (rowsToExport.length === 0) {
      // Create empty sheet with note
      rowsToExport = [{ "Status": "No records matched selected export filters." }];
    }

    const ws = XLSX.utils.json_to_sheet(rowsToExport);
    ws["!cols"] = calculateColumnWidths(rowsToExport);

    // Limit worksheet name to 31 chars (Excel limit)
    const cleanSheetName = sheet.name.slice(0, 31).replace(/[\\/?*[\]]/g, "_");
    XLSX.utils.book_append_sheet(wb, ws, cleanSheetName);
  }

  // Trigger file download
  XLSX.writeFile(wb, filename);
}

/**
 * Exports single-category data into a UTF-8 BOM RFC-4180 CSV file and triggers download
 */
export function exportToCsv(
  headers: { key: string; label: string }[],
  data: Record<string, any>[],
  filename: string
): void {
  const headerRow = headers.map((h) => escapeCsvField(h.label)).join(",");
  const dataRows = data.map((item) => {
    return headers
      .map((h) => {
        const val = item[h.key];
        if (typeof val === "boolean") {
          return escapeCsvField(val ? "Yes" : "No");
        }
        return escapeCsvField(val);
      })
      .join(",");
  });

  const csvContent = [headerRow, ...dataRows].join("\r\n");
  // UTF-8 BOM \uFEFF ensures Excel properly opens UTF-8 text with special characters
  const blob = new Blob(["\uFEFF" + csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.setAttribute("href", url);
  link.setAttribute("download", filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export interface ExportAuditEntry {
  id?: string;
  userId: string | null;
  userEmail?: string;
  category: string;
  format: string;
  recordCount: number;
  filters: Record<string, any>;
  timestamp: string;
  status: "SUCCESS" | "FAILED" | "BLOCKED";
}

/**
 * Records export events to database audit_logs table and persists a local audit backup
 */
export async function recordExportAuditLog(entry: ExportAuditEntry): Promise<void> {
  const now = new Date().toISOString();
  const auditItem = {
    ...entry,
    timestamp: now,
  };

  // 1. Store in local audit trail backup
  try {
    const existing = localStorage.getItem("supernova_export_audit_history");
    const list: ExportAuditEntry[] = existing ? JSON.parse(existing) : [];
    list.unshift(auditItem);
    // Keep last 100 export audit entries
    localStorage.setItem("supernova_export_audit_history", JSON.stringify(list.slice(0, 100)));
  } catch (err) {
    console.warn("Failed to save local export audit backup:", err);
  }

  // 2. Insert into remote Supabase public.audit_logs
  try {
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const actorId = entry.userId && isUuid.test(entry.userId) ? entry.userId : null;

    await supabase.from("audit_logs").insert([
      {
        actor_id: actorId,
        action: "EXPORT_DATA",
        entity_type: "registrations_export",
        metadata: {
          export_category: entry.category,
          file_format: entry.format,
          record_count: entry.recordCount,
          filters: entry.filters,
          operator_email: entry.userEmail,
          status: entry.status,
          exported_at: now,
        },
      },
    ]);
  } catch (err) {
    // Non-blocking: Audit failure should not break the user download
    console.warn("Remote audit log insert notice:", err);
  }
}
