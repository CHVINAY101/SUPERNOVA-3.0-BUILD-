/**
 * SUPERNOVA 3.0 — Export Sanitizer & Security Utilities
 * 
 * Provides spreadsheet formula-injection protection (CSV/XLSX),
 * safe CSV escaping, filename formatting, and data transformation helpers.
 */

/**
 * Characters that trigger spreadsheet formula execution in Microsoft Excel,
 * Google Sheets, LibreOffice Calc, etc.
 */
const FORMULA_TRIGGERS = ["=", "+", "-", "@", "\t", "\r"];

/**
 * Sanitizes any string or value against spreadsheet formula injection.
 * If a value begins with any trigger character, it is prepended with a single quote (')
 * which forces spreadsheet engines to treat the cell contents as plain text.
 */
export function sanitizeFormulaInjection(value: unknown): string {
  if (value === null || value === undefined) {
    return "";
  }
  let str = String(value);
  if (str.length === 0) return "";

  const startsWithTabOrCr = str.startsWith("\t") || str.startsWith("\r");
  const trimmed = str.trimStart();
  const startsWithTrigger = FORMULA_TRIGGERS.some((trigger) => trimmed.startsWith(trigger));

  if (startsWithTabOrCr || startsWithTrigger) {
    return `'${str}`;
  }
  return str;
}

/**
 * Escapes a single CSV field according to RFC 4180:
 * - Sanitizes formula injection
 * - Wraps in double quotes if it contains commas, double quotes, or newlines
 * - Replaces double quotes with two double quotes
 */
export function escapeCsvField(value: unknown): string {
  const sanitized = sanitizeFormulaInjection(value);
  if (
    sanitized.includes(",") ||
    sanitized.includes('"') ||
    sanitized.includes("\n") ||
    sanitized.includes("\r")
  ) {
    return `"${sanitized.replace(/"/g, '""')}"`;
  }
  return sanitized;
}

/**
 * Formats an array of fields into a RFC 4180 compliant CSV line.
 */
export function formatCsvRow(fields: unknown[]): string {
  return fields.map(escapeCsvField).join(",");
}

/**
 * Generates standardized, audit-compliant export filenames.
 * Example: SUPERNOVA_3.0_Visitor_Registrations_2026-11-20.xlsx
 */
export function generateExportFilename(
  category: "visitor" | "participation" | "esports_teams" | "esports_players" | "esports_complete",
  format: "csv" | "xlsx",
  date: Date = new Date()
): string {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  const dateStr = `${yyyy}-${mm}-${dd}`;

  const categoryMap: Record<string, string> = {
    visitor: "Visitor_Registrations",
    participation: "Participation_Registrations",
    esports_teams: "Esports_Team_Registrations",
    esports_players: "Esports_Player_Rosters",
    esports_complete: "Esports_Complete_Workbook",
  };

  const name = categoryMap[category] || "Data_Export";
  return `SUPERNOVA_3.0_${name}_${dateStr}.${format}`;
}

export interface ExportFilterCriteria {
  searchQuery?: string;
  status?: string;
  gameId?: string;
  institution?: string;
  startDate?: string;
  endDate?: string;
  visitorCategory?: string;
}

/**
 * Generic filter function that applies date ranges, search query, and categorical filters
 */
export function filterRecords<T extends Record<string, any>>(
  records: T[],
  filters: ExportFilterCriteria,
  searchFields: (keyof T)[] = []
): T[] {
  return records.filter((item) => {
    // Status check
    if (filters.status && filters.status !== "all") {
      if (item.status !== filters.status) return false;
    }

    // Visitor category check
    if (filters.visitorCategory && filters.visitorCategory !== "all") {
      if (item.visitor_category !== filters.visitorCategory) return false;
    }

    // Game ID check
    if (filters.gameId && filters.gameId !== "all") {
      if (item.game_id !== filters.gameId && item.preferred_game !== filters.gameId) return false;
    }

    // Institution check
    if (filters.institution && filters.institution.trim()) {
      const inst = String(item.institution || "").toLowerCase();
      if (!inst.includes(filters.institution.trim().toLowerCase())) return false;
    }

    // Date range check (submitted_at or created_at)
    const timestampStr = item.submitted_at || item.created_at;
    if (timestampStr) {
      const itemTime = new Date(timestampStr).getTime();
      if (filters.startDate) {
        const startTime = new Date(filters.startDate).getTime();
        if (itemTime < startTime) return false;
      }
      if (filters.endDate) {
        // End of that day
        const endTime = new Date(filters.endDate).setHours(23, 59, 59, 999);
        if (itemTime > endTime) return false;
      }
    }

    // Search query check
    if (filters.searchQuery && filters.searchQuery.trim()) {
      const q = filters.searchQuery.trim().toLowerCase();
      const match = searchFields.some((field) => {
        const val = item[field];
        return val && String(val).toLowerCase().includes(q);
      });
      if (!match) return false;
    }

    return true;
  });
}
