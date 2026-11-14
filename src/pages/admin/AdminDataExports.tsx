import { useState, useEffect, useMemo, useCallback } from "react";
import { useAuth } from "@/lib/auth";
import { getRoleLabel } from "@/lib/rbac";
import { supabase } from "@/lib/supabase";
import {
  exportToExcel,
  exportToCsv,
  recordExportAuditLog,
  type WorksheetData,
} from "@/utils/excelGenerator";
import {
  generateExportFilename,
  filterRecords,
  type ExportFilterCriteria,
} from "@/utils/exportSanitizer";
import {
  Download,
  FileSpreadsheet,
  FileText,
  Filter,
  ShieldAlert,
  CheckCircle2,
  RotateCcw,
  Lock,
  CheckSquare,
  Square,
  X,
  Clock
} from "lucide-react";

type ExportCategory = "visitor" | "participation" | "esports_teams" | "esports_players" | "esports_complete";

interface GameRow {
  id: string;
  title: string;
  team_size: number | null;
}

export default function AdminDataExports() {
  const { user, role, hasPermission } = useAuth();
  const currentRoleLabel = getRoleLabel(role);

  const canViewVisitors = hasPermission("visitor:view");
  const canViewParticipation = hasPermission("participation:view");
  const canViewEsports = hasPermission("esports:view");
  const canExportGlobal = hasPermission("reports:export");
  const canExportVisitors = canExportGlobal || hasPermission("visitor:export");
  const canExportParticipation = canExportGlobal || hasPermission("participation:export");
  const canExportEsports = canExportGlobal || hasPermission("esports:export");

  // Active Export Module
  const [activeModule, setActiveModule] = useState<ExportCategory>("visitor");

  const canExportActiveModule = useMemo(() => {
    switch (activeModule) {
      case "visitor":
        return canExportVisitors;
      case "participation":
        return canExportParticipation;
      case "esports_teams":
      case "esports_players":
      case "esports_complete":
        return canExportEsports;
      default:
        return false;
    }
  }, [activeModule, canExportVisitors, canExportParticipation, canExportEsports]);

  useEffect(() => {
    if (activeModule === "visitor" && !canViewVisitors) {
      if (canViewParticipation) setActiveModule("participation");
      else if (canViewEsports) setActiveModule("esports_teams");
    } else if (activeModule === "participation" && !canViewParticipation) {
      if (canViewVisitors) setActiveModule("visitor");
      else if (canViewEsports) setActiveModule("esports_teams");
    } else if (activeModule.startsWith("esports") && !canViewEsports) {
      if (canViewVisitors) setActiveModule("visitor");
      else if (canViewParticipation) setActiveModule("participation");
    }
  }, [activeModule, canViewVisitors, canViewParticipation, canViewEsports]);

  // Raw Data States
  const [visitorData, setVisitorData] = useState<any[]>([]);
  const [participationData, setParticipationData] = useState<any[]>([]);
  const [esportsData, setEsportsData] = useState<any[]>([]);
  const [gamesList, setGamesList] = useState<GameRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);

  // Filters State
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [gameFilter, setGameFilter] = useState("all");
  const [institutionFilter, setInstitutionFilter] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [visitorCategoryFilter, setVisitorCategoryFilter] = useState("all");

  // Record Selection State (for exporting checked subset)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Export Confirmation Dialog State
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [exportFormat, setExportFormat] = useState<"xlsx" | "csv">("xlsx");
  const [exportScope, setExportScope] = useState<"filtered" | "selected">("filtered");
  const [piiConsentGiven, setPiiConsentGiven] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [exportSuccessNotice, setExportSuccessNotice] = useState<string | null>(null);

  // Recent Export History state
  const [recentExports, setRecentExports] = useState<any[]>([]);

  // Fetch games & data
  const fetchData = useCallback(async () => {
    setLoading(true);
    setFetchError(null);

    try {
      if (canViewEsports) {
        const { data: games } = await supabase
          .from("games")
          .select("id, title, team_size")
          .order("sort_order");
        if (games) setGamesList(games as GameRow[]);

        const { data: esports, error: eErr } = await supabase
          .from("registrations")
          .select("*, games(title), players(*)")
          .order("submitted_at", { ascending: false });
        if (eErr) console.warn("Esports fetch notice:", eErr.message);
        setEsportsData(esports || []);
      } else {
        setEsportsData([]);
      }

      if (canViewVisitors) {
        const { data: visitors, error: vErr } = await supabase
          .from("visitor_registrations")
          .select("*")
          .order("submitted_at", { ascending: false });
        if (vErr) console.warn("Visitor fetch notice:", vErr.message);
        setVisitorData(visitors || []);
      } else {
        setVisitorData([]);
      }

      if (canViewParticipation) {
        const { data: participations, error: pErr } = await supabase
          .from("participation_registrations")
          .select("*")
          .order("submitted_at", { ascending: false });
        if (pErr) console.warn("Participation fetch notice:", pErr.message);
        setParticipationData(participations || []);
      } else {
        setParticipationData([]);
      }

      // Load local export audit history
      const savedHistory = localStorage.getItem("supernova_export_audit_history");
      if (savedHistory) {
        setRecentExports(JSON.parse(savedHistory).slice(0, 5));
      }
    } catch (err: any) {
      setFetchError(err.message || "Failed to load registrations from Supabase.");
    } finally {
      setLoading(false);
    }
  }, [canViewVisitors, canViewParticipation, canViewEsports]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Reset selected IDs when changing module
  useEffect(() => {
    setSelectedIds(new Set());
  }, [activeModule]);

  // Deconstruct esports players into a flattened roster list
  const esportsPlayersList = useMemo(() => {
    const list: any[] = [];
    for (const team of esportsData) {
      const players = team.players || [];
      const gameTitle = team.games?.title || "Unknown Game";
      for (const p of players) {
        list.push({
          id: p.id,
          registration_id: team.id,
          registration_ref: team.registration_ref,
          team_name: team.team_name,
          game_title: gameTitle,
          institution: team.institution,
          captain_name: team.captain_name,
          captain_email: team.email,
          captain_phone: team.phone,
          player_name: p.player_name,
          gamer_tag: p.gamer_tag || "N/A",
          check_in_status: p.check_in_status || "not_checked_in",
          check_in_at: p.check_in_at || null,
          team_status: team.status,
          submitted_at: team.submitted_at,
        });
      }
    }
    return list;
  }, [esportsData]);

  // Compute active records list
  const currentRawRecords = useMemo(() => {
    switch (activeModule) {
      case "visitor":
        return visitorData;
      case "participation":
        return participationData;
      case "esports_teams":
      case "esports_complete":
        return esportsData;
      case "esports_players":
        return esportsPlayersList;
      default:
        return [];
    }
  }, [activeModule, visitorData, participationData, esportsData, esportsPlayersList]);

  // Apply filters
  const filteredRecords = useMemo(() => {
    const criteria: ExportFilterCriteria = {
      searchQuery,
      status: statusFilter,
      gameId: gameFilter,
      institution: institutionFilter,
      startDate,
      endDate,
      visitorCategory: visitorCategoryFilter,
    };

    let searchFields: string[] = ["registration_ref", "full_name", "email", "phone", "institution"];
    if (activeModule === "esports_teams" || activeModule === "esports_complete") {
      searchFields = ["registration_ref", "team_name", "captain_name", "email", "phone", "institution"];
    } else if (activeModule === "esports_players") {
      searchFields = ["registration_ref", "team_name", "player_name", "gamer_tag", "institution"];
    }

    return filterRecords(currentRawRecords, criteria, searchFields as any);
  }, [
    currentRawRecords,
    activeModule,
    searchQuery,
    statusFilter,
    gameFilter,
    institutionFilter,
    startDate,
    endDate,
    visitorCategoryFilter,
  ]);

  // Records to export based on scope
  const recordsToExport = useMemo(() => {
    if (exportScope === "selected") {
      return filteredRecords.filter((r) => selectedIds.has(r.id));
    }
    return filteredRecords;
  }, [filteredRecords, selectedIds, exportScope]);

  // Selection toggle handlers
  const handleToggleSelect = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    setSelectedIds(next);
  };

  const handleSelectAll = () => {
    if (selectedIds.size === filteredRecords.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredRecords.map((r) => r.id)));
    }
  };

  // Open confirmation modal
  const handleInitiateExport = (format: "xlsx" | "csv", scope: "filtered" | "selected") => {
    if (!canExportActiveModule) {
      setFetchError("Unauthorized: Your CRM permissions do not allow exporting this dataset.");
      return;
    }

    const count = scope === "selected" ? selectedIds.size : filteredRecords.length;
    if (count === 0) {
      setFetchError("No records match the current selection. Adjust filters or select rows before exporting.");
      return;
    }

    setFetchError(null);
    setExportFormat(format);
    setExportScope(scope);
    setPiiConsentGiven(false);
    setShowConfirmModal(true);
  };

  // Execute Actual File Generation
  const handleExecuteExport = async () => {
    if (!canExportActiveModule) {
      setFetchError("Unauthorized: Your CRM permissions do not allow exporting this dataset.");
      return;
    }
    if (!piiConsentGiven) {
      setFetchError("Please confirm the compliance checkbox before downloading participant PII.");
      return;
    }

    setIsExporting(true);
    const now = new Date();
    const filename = generateExportFilename(activeModule, exportFormat, now);
    const operatorEmail = user?.email || "admin@supernova";

    try {
      if (activeModule === "visitor") {
        const headers = [
          { key: "registration_ref", label: "Registration Reference" },
          { key: "full_name", label: "Full Name" },
          { key: "email", label: "Email Address" },
          { key: "phone", label: "Mobile Number" },
          { key: "visitor_category", label: "Category" },
          { key: "institution", label: "School / College" },
          { key: "student_class", label: "Class / Standard" },
          { key: "student_id", label: "Student Roll / ID" },
          { key: "designation", label: "Designation" },
          { key: "esports_interest", label: "Interested in Esports" },
          { key: "preferred_game", label: "Preferred Game" },
          { key: "in_game_id", label: "In-Game Player ID" },
          { key: "team_name", label: "Esports Team Name" },
          { key: "days_attending", label: "Days Attending" },
          { key: "status", label: "Registration Status" },
          { key: "submitted_at", label: "Submission Timestamp" },
          { key: "admin_notes", label: "Administrative Notes" },
        ];

        if (exportFormat === "xlsx") {
          exportToExcel([{ name: "Visitor Registrations", data: recordsToExport, headers }], filename);
        } else {
          exportToCsv(headers, recordsToExport, filename);
        }
      } else if (activeModule === "participation") {
        const headers = [
          { key: "registration_ref", label: "Registration Reference" },
          { key: "full_name", label: "Applicant Name" },
          { key: "email", label: "Email Address" },
          { key: "phone", label: "Mobile Number" },
          { key: "institution", label: "Institution" },
          { key: "participant_category", label: "Participant Category" },
          { key: "participation_area", label: "Participation Area" },
          { key: "project_title", label: "Project Title" },
          { key: "project_description", label: "Project Description" },
          { key: "team_members_count", label: "Team Size" },
          { key: "status", label: "Status" },
          { key: "submitted_at", label: "Submission Timestamp" },
          { key: "admin_notes", label: "Administrative Notes" },
        ];

        if (exportFormat === "xlsx") {
          exportToExcel([{ name: "Participation Exhibits", data: recordsToExport, headers }], filename);
        } else {
          exportToCsv(headers, recordsToExport, filename);
        }
      } else if (activeModule === "esports_teams") {
        const headers = [
          { key: "registration_ref", label: "Registration Reference" },
          { key: "team_name", label: "Team Name" },
          { key: "game_title", label: "Game Title" },
          { key: "institution", label: "Institution" },
          { key: "captain_name", label: "Captain / Representative" },
          { key: "email", label: "Contact Email" },
          { key: "phone", label: "Contact Phone" },
          { key: "status", label: "Status" },
          { key: "submitted_at", label: "Submitted At" },
        ];

        const mappedTeams = recordsToExport.map((t) => ({
          ...t,
          game_title: t.games?.title || "Pending",
        }));

        if (exportFormat === "xlsx") {
          exportToExcel([{ name: "Team Registrations", data: mappedTeams, headers }], filename);
        } else {
          exportToCsv(headers, mappedTeams, filename);
        }
      } else if (activeModule === "esports_players") {
        const headers = [
          { key: "registration_ref", label: "Team Registration Ref" },
          { key: "team_name", label: "Team Name" },
          { key: "game_title", label: "Game Title" },
          { key: "player_name", label: "Player Name" },
          { key: "gamer_tag", label: "In-Game ID / Riot ID / IGN" },
          { key: "check_in_status", label: "Check-In Status" },
          { key: "institution", label: "Institution" },
          { key: "captain_name", label: "Captain Reference" },
        ];

        if (exportFormat === "xlsx") {
          exportToExcel([{ name: "Player Rosters", data: recordsToExport, headers }], filename);
        } else {
          exportToCsv(headers, recordsToExport, filename);
        }
      } else if (activeModule === "esports_complete") {
        // Multi-Sheet Complete Workbook
        // Sheet 1: Team Registrations
        const teamHeaders = [
          { key: "registration_ref", label: "Registration Reference" },
          { key: "team_name", label: "Team Name" },
          { key: "game_title", label: "Game Title" },
          { key: "institution", label: "Institution" },
          { key: "captain_name", label: "Captain Name" },
          { key: "email", label: "Captain Email" },
          { key: "phone", label: "Captain Phone" },
          { key: "player_count", label: "Total Players" },
          { key: "status", label: "Status" },
          { key: "submitted_at", label: "Submitted At" },
        ];

        const teamsSheetData = recordsToExport.map((t) => ({
          ...t,
          game_title: t.games?.title || "Pending",
          player_count: t.players?.length || 0,
        }));

        // Sheet 2: Player Rosters
        const playerHeaders = [
          { key: "registration_ref", label: "Team Ref" },
          { key: "team_name", label: "Team Name" },
          { key: "game_title", label: "Game Title" },
          { key: "player_name", label: "Player Name" },
          { key: "gamer_tag", label: "In-Game ID / IGN" },
          { key: "check_in_status", label: "Check-In Status" },
          { key: "captain_name", label: "Captain" },
        ];

        const rosterSheetData: any[] = [];
        for (const team of recordsToExport) {
          const players = team.players || [];
          for (const p of players) {
            rosterSheetData.push({
              registration_ref: team.registration_ref,
              team_name: team.team_name,
              game_title: team.games?.title || "Pending",
              player_name: p.player_name,
              gamer_tag: p.gamer_tag || "N/A",
              check_in_status: p.check_in_status || "not_checked_in",
              captain_name: team.captain_name,
            });
          }
        }

        // Sheet 3: Game-wise Summary Table
        const summarySheetData = gamesList.map((g) => {
          const teamsInGame = recordsToExport.filter((t) => t.game_id === g.id || t.games?.title === g.title);
          const confirmedTeams = teamsInGame.filter((t) => t.status === "confirmed");
          let totalPlayers = 0;
          let checkedInPlayers = 0;
          for (const t of teamsInGame) {
            const pls = t.players || [];
            totalPlayers += pls.length;
            checkedInPlayers += pls.filter((p: any) => p.check_in_status === "checked_in").length;
          }

          return {
            "Game Championship": g.title,
            "Roster Size": `${g.team_size} Players`,
            "Registered Teams": teamsInGame.length,
            "Confirmed Teams": confirmedTeams.length,
            "Pending Teams": teamsInGame.length - confirmedTeams.length,
            "Total Players Roster": totalPlayers,
            "Checked-in Players": checkedInPlayers,
          };
        });

        const workbookSheets: WorksheetData[] = [
          { name: "Team Registrations", data: teamsSheetData, headers: teamHeaders },
          { name: "Player Rosters", data: rosterSheetData, headers: playerHeaders },
          { name: "Game-wise Summary", data: summarySheetData },
        ];

        exportToExcel(workbookSheets, filename);
      }

      // Record Audit Log Entry (without storing personal info!)
      await recordExportAuditLog({
        userId: user?.id || null,
        userEmail: operatorEmail,
        category: activeModule,
        format: exportFormat,
        recordCount: recordsToExport.length,
        filters: {
          searchQuery: searchQuery || undefined,
          status: statusFilter,
          game: gameFilter !== "all" ? gameFilter : undefined,
          institution: institutionFilter || undefined,
          startDate: startDate || undefined,
          endDate: endDate || undefined,
        },
        timestamp: now.toISOString(),
        status: "SUCCESS",
      });

      setShowConfirmModal(false);
      setExportSuccessNotice(
        `Successfully generated ${filename} (${recordsToExport.length} records exported). Action logged to audit trail.`
      );

      // Refresh recent export log
      const savedHistory = localStorage.getItem("supernova_export_audit_history");
      if (savedHistory) setRecentExports(JSON.parse(savedHistory).slice(0, 5));
    } catch (err: any) {
      setFetchError(`Export failed: ${err.message}`);
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div style={{ maxWidth: 1400, margin: "0 auto" }}>
      {/* Page Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 16, marginBottom: 28 }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: "1.6rem" }}>📊</span>
            <h1 style={{ fontSize: "1.85rem", fontWeight: 800, color: "var(--text-primary)", letterSpacing: "-0.02em" }}>
              Registration Data Export Centre
            </h1>
          </div>
          <p style={{ color: "var(--text-muted)", fontSize: "0.92rem", marginTop: 6, maxWidth: 880, lineHeight: 1.5 }}>
            Secure data extraction and spreadsheet reporting for Supernova 3.0. Supports multi-sheet Excel workbooks,
            UTF-8 BOM CSV exports, spreadsheet formula-injection protection, and compliance audit logging.
          </p>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <button onClick={fetchData} disabled={loading} className="btn btn-ghost" title="Refresh Live Registrations">
            <RotateCcw size={15} className={loading ? "spin" : ""} />
            <span>Sync</span>
          </button>
        </div>
      </div>

      {/* Inline Error Banner */}
      {fetchError && (
        <div
          style={{
            padding: "14px 18px",
            borderRadius: "var(--radius-md)",
            background: "rgba(239, 68, 68, 0.14)",
            border: "1px solid rgba(239, 68, 68, 0.35)",
            color: "#ef4444",
            marginBottom: 20,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            fontSize: "0.86rem",
            fontWeight: 600,
          }}
        >
          <span>{fetchError}</span>
          <button
            type="button"
            onClick={() => setFetchError(null)}
            style={{ background: "none", border: "none", color: "#ef4444", cursor: "pointer" }}
          >
            <X size={16} />
          </button>
        </div>
      )}

      {/* RBAC Notice if unauthorized to export active module */}
      {!canExportActiveModule && (
        <div
          style={{
            padding: "16px 20px",
            borderRadius: "var(--radius-md)",
            background: "rgba(239, 68, 68, 0.15)",
            border: "1px solid rgba(239, 68, 68, 0.4)",
            color: "#ef4444",
            marginBottom: 24,
            display: "flex",
            alignItems: "center",
            gap: 12,
          }}
        >
          <Lock size={22} />
          <div>
            <strong>RBAC Access Control:</strong> Exporting registration files for this module requires explicit export permission. Your current role (
            <strong>{currentRoleLabel}</strong>) is restricted to read-only preview here.
          </div>
        </div>
      )}

      {/* Success Notification */}
      {exportSuccessNotice && (
        <div
          style={{
            padding: "14px 20px",
            borderRadius: "var(--radius-md)",
            background: "rgba(16, 185, 129, 0.15)",
            border: "1px solid rgba(16, 185, 129, 0.4)",
            color: "#10b981",
            marginBottom: 24,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <CheckCircle2 size={18} />
            <span style={{ fontSize: "0.88rem", fontWeight: 600 }}>{exportSuccessNotice}</span>
          </div>
          <button
            onClick={() => setExportSuccessNotice(null)}
            style={{ background: "none", border: "none", color: "#10b981", cursor: "pointer" }}
          >
            <X size={16} />
          </button>
        </div>
      )}

      {/* Primary Category Selector Cards */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
          gap: 16,
          marginBottom: 28,
        }}
      >
        {/* Module 1: Visitors */}
        {canViewVisitors && (
          <div
            onClick={() => setActiveModule("visitor")}
            className="card"
            style={{
              padding: "20px 22px",
              cursor: "pointer",
              border: activeModule === "visitor" ? "2px solid var(--cyan-400)" : "1px solid var(--border-subtle)",
              background: activeModule === "visitor" ? "rgba(34, 211, 238, 0.08)" : "var(--navy-900)",
              transition: "all var(--transition-fast)",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <span style={{ fontSize: "1.5rem" }}>👥</span>
              <span style={{ fontSize: "1.5rem", fontWeight: 800, color: "var(--text-primary)" }}>
                {visitorData.length}
              </span>
            </div>
            <h3 style={{ fontSize: "1.05rem", fontWeight: 700, color: "var(--text-primary)", marginTop: 12 }}>
              Visitor Registrations
            </h3>
            <p style={{ fontSize: "0.78rem", color: "var(--text-muted)", marginTop: 4 }}>
              Students, faculty, and general public with class, school, roll number, and esports preference.
            </p>
          </div>
        )}

        {/* Module 2: Participation */}
        {canViewParticipation && (
          <div
            onClick={() => setActiveModule("participation")}
            className="card"
            style={{
              padding: "20px 22px",
              cursor: "pointer",
              border: activeModule === "participation" ? "2px solid var(--cyan-400)" : "1px solid var(--border-subtle)",
              background: activeModule === "participation" ? "rgba(34, 211, 238, 0.08)" : "var(--navy-900)",
              transition: "all var(--transition-fast)",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <span style={{ fontSize: "1.5rem" }}>🔬</span>
              <span style={{ fontSize: "1.5rem", fontWeight: 800, color: "var(--text-primary)" }}>
                {participationData.length}
              </span>
            </div>
            <h3 style={{ fontSize: "1.05rem", fontWeight: 700, color: "var(--text-primary)", marginTop: 12 }}>
              Project Exhibits
            </h3>
            <p style={{ fontSize: "0.78rem", color: "var(--text-muted)", marginTop: 4 }}>
              Science Expo, robotics, and academic exhibition teams with abstract and team size.
            </p>
          </div>
        )}

        {/* Module 3A: Esports Teams */}
        {canViewEsports && (
          <div
            onClick={() => setActiveModule("esports_teams")}
            className="card"
            style={{
              padding: "20px 22px",
              cursor: "pointer",
              border: activeModule === "esports_teams" ? "2px solid var(--cyan-400)" : "1px solid var(--border-subtle)",
              background: activeModule === "esports_teams" ? "rgba(34, 211, 238, 0.08)" : "var(--navy-900)",
              transition: "all var(--transition-fast)",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <span style={{ fontSize: "1.5rem" }}>🎮</span>
              <span style={{ fontSize: "1.5rem", fontWeight: 800, color: "var(--text-primary)" }}>
                {esportsData.length}
              </span>
            </div>
            <h3 style={{ fontSize: "1.05rem", fontWeight: 700, color: "var(--text-primary)", marginTop: 12 }}>
              Esports Teams
            </h3>
            <p style={{ fontSize: "0.78rem", color: "var(--text-muted)", marginTop: 4 }}>
              Team names, game category, captain contact, institution, and tournament status.
            </p>
          </div>
        )}

        {/* Module 3B: Esports Complete Workbook */}
        {canViewEsports && (
          <div
            onClick={() => setActiveModule("esports_complete")}
            className="card"
            style={{
              padding: "20px 22px",
              cursor: "pointer",
              border: activeModule === "esports_complete" ? "2px solid #10b981" : "1px solid var(--border-subtle)",
              background: activeModule === "esports_complete" ? "rgba(16, 185, 129, 0.08)" : "var(--navy-900)",
              transition: "all var(--transition-fast)",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <span style={{ fontSize: "1.5rem" }}>📑</span>
              <span style={{ fontSize: "1.5rem", fontWeight: 800, color: "#10b981" }}>
                3 Sheets
              </span>
            </div>
            <h3 style={{ fontSize: "1.05rem", fontWeight: 700, color: "var(--text-primary)", marginTop: 12 }}>
              Complete Esports Workbook
            </h3>
            <p style={{ fontSize: "0.78rem", color: "var(--text-muted)", marginTop: 4 }}>
              Multi-sheet Excel: Team Registrations, Player Rosters, and Game-wise Summary.
            </p>
          </div>
        )}
      </div>

      {/* Filter and Control Bar */}
      <div className="card" style={{ padding: "20px 24px", marginBottom: 24 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 16, marginBottom: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <Filter size={18} color="var(--cyan-400)" />
            <h3 style={{ fontSize: "1rem", fontWeight: 700, color: "var(--text-primary)" }}>
              Export Filters & Selection
            </h3>
          </div>

          {/* Quick Record Counter */}
          <div
            style={{
              padding: "6px 14px",
              borderRadius: "var(--radius-sm)",
              background: "rgba(34, 211, 238, 0.12)",
              border: "1px solid rgba(34, 211, 238, 0.3)",
              fontSize: "0.85rem",
              color: "var(--cyan-400)",
              fontWeight: 700,
            }}
          >
            Matching Records: {filteredRecords.length} of {currentRawRecords.length}
            {selectedIds.size > 0 && ` (${selectedIds.size} selected)`}
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 14 }}>
          {/* Search Query */}
          <div>
            <label style={{ display: "block", fontSize: "0.75rem", fontWeight: 700, textTransform: "uppercase", color: "var(--text-faint)", marginBottom: 4 }}>
              Search Keyword / Ref
            </label>
            <div style={{ position: "relative" }}>
              <input
                type="text"
                placeholder="Search ref, name, email..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="input"
                style={{ width: "100%", padding: "8px 12px", fontSize: "0.82rem", background: "var(--navy-900)" }}
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery("")}
                  style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", color: "var(--text-faint)", cursor: "pointer" }}
                >
                  <X size={14} />
                </button>
              )}
            </div>
          </div>

          {/* Registration Status Filter */}
          <div>
            <label style={{ display: "block", fontSize: "0.75rem", fontWeight: 700, textTransform: "uppercase", color: "var(--text-faint)", marginBottom: 4 }}>
              Status
            </label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="select"
              style={{ width: "100%", padding: "8px 12px", fontSize: "0.82rem", background: "var(--navy-900)" }}
            >
              <option value="all">All Statuses</option>
              <option value="pending">Pending</option>
              <option value="confirmed">Confirmed</option>
              <option value="declined">Declined</option>
              <option value="correction_requested">Correction Requested</option>
            </select>
          </div>

          {/* Visitor Category Filter (shown when active module is visitor) */}
          {activeModule === "visitor" && (
            <div>
              <label style={{ display: "block", fontSize: "0.75rem", fontWeight: 700, textTransform: "uppercase", color: "var(--text-faint)", marginBottom: 4 }}>
                Visitor Category
              </label>
              <select
                value={visitorCategoryFilter}
                onChange={(e) => setVisitorCategoryFilter(e.target.value)}
                className="select"
                style={{ width: "100%", padding: "8px 12px", fontSize: "0.82rem", background: "var(--navy-900)" }}
              >
                <option value="all">All Visitor Types</option>
                <option value="Student">Student</option>
                <option value="General Visitor">General Visitor</option>
                <option value="Faculty / Staff">Faculty / Staff</option>
              </select>
            </div>
          )}

          {/* Game Filter (shown when active module is esports or visitor) */}
          {(activeModule.startsWith("esports") || activeModule === "visitor") && (
            <div>
              <label style={{ display: "block", fontSize: "0.75rem", fontWeight: 700, textTransform: "uppercase", color: "var(--text-faint)", marginBottom: 4 }}>
                Game Championship
              </label>
              <select
                value={gameFilter}
                onChange={(e) => setGameFilter(e.target.value)}
                className="select"
                style={{ width: "100%", padding: "8px 12px", fontSize: "0.82rem", background: "var(--navy-900)" }}
              >
                <option value="all">All Games</option>
                <option value="VALORANT">VALORANT</option>
                <option value="BGMI">BGMI</option>
                <option value="FREE FIRE">FREE FIRE</option>
              </select>
            </div>
          )}

          {/* Institution Filter */}
          <div>
            <label style={{ display: "block", fontSize: "0.75rem", fontWeight: 700, textTransform: "uppercase", color: "var(--text-faint)", marginBottom: 4 }}>
              Institution
            </label>
            <input
              type="text"
              placeholder="Filter by school / college..."
              value={institutionFilter}
              onChange={(e) => setInstitutionFilter(e.target.value)}
              className="input"
              style={{ width: "100%", padding: "8px 12px", fontSize: "0.82rem", background: "var(--navy-900)" }}
            />
          </div>

          {/* Start Date */}
          <div>
            <label style={{ display: "block", fontSize: "0.75rem", fontWeight: 700, textTransform: "uppercase", color: "var(--text-faint)", marginBottom: 4 }}>
              From Date
            </label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="input"
              style={{ width: "100%", padding: "8px 12px", fontSize: "0.82rem", background: "var(--navy-900)" }}
            />
          </div>

          {/* End Date */}
          <div>
            <label style={{ display: "block", fontSize: "0.75rem", fontWeight: 700, textTransform: "uppercase", color: "var(--text-faint)", marginBottom: 4 }}>
              To Date
            </label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="input"
              style={{ width: "100%", padding: "8px 12px", fontSize: "0.82rem", background: "var(--navy-900)" }}
            />
          </div>
        </div>

        {/* Action Button Bar */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12, marginTop: 20, paddingTop: 16, borderTop: "1px solid var(--border-subtle)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <button
              onClick={handleSelectAll}
              className="btn btn-ghost"
              style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "0.82rem", padding: "6px 12px" }}
            >
              {selectedIds.size === filteredRecords.length && filteredRecords.length > 0 ? (
                <CheckSquare size={16} color="var(--cyan-400)" />
              ) : (
                <Square size={16} />
              )}
              <span>{selectedIds.size === filteredRecords.length && filteredRecords.length > 0 ? "Deselect All" : "Select All"}</span>
            </button>

            {(searchQuery || statusFilter !== "all" || gameFilter !== "all" || institutionFilter || startDate || endDate || visitorCategoryFilter !== "all") && (
              <button
                onClick={() => {
                  setSearchQuery("");
                  setStatusFilter("all");
                  setGameFilter("all");
                  setInstitutionFilter("");
                  setStartDate("");
                  setEndDate("");
                  setVisitorCategoryFilter("all");
                }}
                className="btn btn-ghost"
                style={{ fontSize: "0.82rem", padding: "6px 12px" }}
              >
                Clear Filters
              </button>
            )}
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            {/* Export Selected Button */}
            {selectedIds.size > 0 && (
              <button
                onClick={() => handleInitiateExport("xlsx", "selected")}
                disabled={!canExportActiveModule}
                className="btn"
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "8px 16px",
                  fontSize: "0.85rem",
                  fontWeight: 700,
                  background: "rgba(34, 211, 238, 0.15)",
                  color: "var(--cyan-400)",
                  border: "1px solid var(--cyan-400)",
                }}
              >
                <FileSpreadsheet size={16} />
                <span>Export Selected ({selectedIds.size})</span>
              </button>
            )}

            {/* Export CSV Button */}
            <button
              onClick={() => handleInitiateExport("csv", "filtered")}
              disabled={!canExportActiveModule || filteredRecords.length === 0}
              className="btn btn-ghost"
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "8px 16px",
                fontSize: "0.85rem",
                fontWeight: 600,
              }}
            >
              <FileText size={16} />
              <span>Export CSV</span>
            </button>

            {/* Export Excel (.xlsx) Primary Button */}
            <button
              onClick={() => handleInitiateExport("xlsx", "filtered")}
              disabled={!canExportActiveModule || filteredRecords.length === 0}
              className="btn btn-primary"
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "8px 20px",
                fontSize: "0.88rem",
                fontWeight: 700,
              }}
            >
              <FileSpreadsheet size={18} />
              <span>Export Excel (.xlsx)</span>
            </button>
          </div>
        </div>
      </div>

      {/* Records Preview Table */}
      <div className="card" style={{ overflow: "hidden", marginBottom: 32 }}>
        <div style={{ padding: "14px 20px", borderBottom: "1px solid var(--border-subtle)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h4 style={{ fontSize: "0.85rem", fontWeight: 800, textTransform: "uppercase", color: "var(--text-faint)", letterSpacing: "0.06em" }}>
            Live Records Preview ({filteredRecords.length} records)
          </h4>
          <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
            Showing top preview records. Full dataset included on download.
          </span>
        </div>

        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left" }}>
            <thead>
              <tr style={{ background: "rgba(0,0,0,0.3)", borderBottom: "1px solid var(--border-subtle)" }}>
                <th style={{ padding: "12px 16px", width: 44 }}>
                  <input
                    type="checkbox"
                    checked={selectedIds.size === filteredRecords.length && filteredRecords.length > 0}
                    onChange={handleSelectAll}
                  />
                </th>
                <th style={{ padding: "12px 16px", fontSize: "0.72rem", textTransform: "uppercase", color: "var(--text-faint)", fontWeight: 800 }}>
                  Reference
                </th>
                <th style={{ padding: "12px 16px", fontSize: "0.72rem", textTransform: "uppercase", color: "var(--text-faint)", fontWeight: 800 }}>
                  {activeModule === "esports_teams" || activeModule === "esports_complete"
                    ? "Team Name"
                    : activeModule === "esports_players"
                    ? "Player Name"
                    : "Full Name"}
                </th>
                <th style={{ padding: "12px 16px", fontSize: "0.72rem", textTransform: "uppercase", color: "var(--text-faint)", fontWeight: 800 }}>
                  {activeModule.startsWith("esports") ? "Game / Representative" : "Category / Subcategory"}
                </th>
                <th style={{ padding: "12px 16px", fontSize: "0.72rem", textTransform: "uppercase", color: "var(--text-faint)", fontWeight: 800 }}>
                  Institution
                </th>
                <th style={{ padding: "12px 16px", fontSize: "0.72rem", textTransform: "uppercase", color: "var(--text-faint)", fontWeight: 800 }}>
                  Status
                </th>
                <th style={{ padding: "12px 16px", fontSize: "0.72rem", textTransform: "uppercase", color: "var(--text-faint)", fontWeight: 800 }}>
                  Submitted At
                </th>
              </tr>
            </thead>
            <tbody>
              {filteredRecords.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ padding: 48, textAlign: "center", color: "var(--text-muted)" }}>
                    No records found matching your filters.
                  </td>
                </tr>
              ) : (
                filteredRecords.slice(0, 50).map((record) => {
                  const isChecked = selectedIds.has(record.id);
                  return (
                    <tr
                      key={record.id}
                      onClick={() => handleToggleSelect(record.id)}
                      style={{
                        borderBottom: "1px solid var(--border-subtle)",
                        cursor: "pointer",
                        background: isChecked ? "rgba(34, 211, 238, 0.05)" : "transparent",
                      }}
                    >
                      <td style={{ padding: "12px 16px" }}>
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => handleToggleSelect(record.id)}
                          onClick={(e) => e.stopPropagation()}
                        />
                      </td>

                      <td style={{ padding: "12px 16px", fontFamily: "var(--font-mono)", fontSize: "0.82rem", color: "var(--cyan-400)", fontWeight: 600 }}>
                        {record.registration_ref}
                      </td>

                      <td style={{ padding: "12px 16px", fontSize: "0.88rem", fontWeight: 700, color: "var(--text-primary)" }}>
                        {record.team_name || record.player_name || record.full_name}
                      </td>

                      <td style={{ padding: "12px 16px", fontSize: "0.82rem", color: "var(--text-muted)" }}>
                        {record.games?.title ||
                          record.game_title ||
                          record.visitor_category ||
                          record.participant_category ||
                          "General"}
                        {record.student_class && ` · ${record.student_class}`}
                        {record.captain_name && ` · Capt: ${record.captain_name}`}
                      </td>

                      <td style={{ padding: "12px 16px", fontSize: "0.82rem", color: "var(--text-muted)" }}>
                        {record.institution || "—"}
                      </td>

                      <td style={{ padding: "12px 16px" }}>
                        <span
                          style={{
                            fontSize: "0.72rem",
                            fontWeight: 700,
                            padding: "2px 8px",
                            borderRadius: 4,
                            background:
                              record.status === "confirmed"
                                ? "rgba(16, 185, 129, 0.15)"
                                : record.status === "declined"
                                ? "rgba(239, 68, 68, 0.15)"
                                : "rgba(245, 158, 11, 0.15)",
                            color:
                              record.status === "confirmed"
                                ? "#10b981"
                                : record.status === "declined"
                                ? "#ef4444"
                                : "#f59e0b",
                            textTransform: "capitalize",
                          }}
                        >
                          {record.status || record.team_status || "pending"}
                        </span>
                      </td>

                      <td style={{ padding: "12px 16px", fontSize: "0.78rem", color: "var(--text-faint)" }}>
                        {record.submitted_at ? new Date(record.submitted_at).toLocaleDateString() : "—"}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Recent Export Activity Trail */}
      {recentExports.length > 0 && (
        <div className="card" style={{ padding: "20px 24px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
            <Clock size={16} color="var(--text-faint)" />
            <h4 style={{ fontSize: "0.85rem", fontWeight: 800, textTransform: "uppercase", color: "var(--text-faint)", letterSpacing: "0.06em" }}>
              Recent Export Audit Log (Operator History)
            </h4>
          </div>

          <div style={{ display: "grid", gap: 10 }}>
            {recentExports.map((log, index) => (
              <div
                key={index}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  padding: "10px 14px",
                  borderRadius: "var(--radius-sm)",
                  background: "rgba(0,0,0,0.2)",
                  border: "1px solid var(--border-subtle)",
                  fontSize: "0.82rem",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <CheckCircle2 size={15} color="#10b981" />
                  <div>
                    <strong style={{ color: "var(--text-primary)" }}>{log.category.toUpperCase()}</strong> ({log.format.toUpperCase()}) —{" "}
                    <span style={{ color: "var(--cyan-400)" }}>{log.recordCount} records</span>
                  </div>
                </div>

                <div style={{ textAlign: "right", color: "var(--text-faint)", fontSize: "0.75rem" }}>
                  <span>{new Date(log.timestamp).toLocaleString()}</span> · {log.userEmail || "admin"}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Final Export Confirmation & PII Security Modal */}
      {showConfirmModal && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.85)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
            padding: 20,
          }}
          onClick={() => setShowConfirmModal(false)}
        >
          <div
            className="card"
            style={{
              maxWidth: 600,
              width: "100%",
              padding: 28,
              background: "var(--navy-900)",
              border: "1px solid var(--border-subtle)",
              borderRadius: "var(--radius-lg)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
              <ShieldAlert size={28} color="var(--cyan-400)" />
              <div>
                <h3 style={{ fontSize: "1.3rem", fontWeight: 800, color: "var(--text-primary)" }}>
                  Confirm Data Export & Security Verification
                </h3>
                <span style={{ fontSize: "0.78rem", color: "var(--text-muted)" }}>
                  DPDP Act 2023 & Festival PII Governance Check
                </span>
              </div>
            </div>

            <div
              style={{
                background: "rgba(0,0,0,0.3)",
                padding: 16,
                borderRadius: "var(--radius-sm)",
                marginBottom: 20,
                fontSize: "0.85rem",
                lineHeight: 1.6,
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                <span style={{ color: "var(--text-faint)" }}>Export Module:</span>
                <strong style={{ color: "var(--text-primary)", textTransform: "capitalize" }}>
                  {activeModule.replace("_", " ")}
                </strong>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                <span style={{ color: "var(--text-faint)" }}>File Format:</span>
                <strong style={{ color: "var(--cyan-400)" }}>{exportFormat.toUpperCase()}</strong>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                <span style={{ color: "var(--text-faint)" }}>Total Records to Download:</span>
                <strong style={{ color: "#10b981", fontSize: "1rem" }}>{recordsToExport.length}</strong>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ color: "var(--text-faint)" }}>Protection Applied:</span>
                <span style={{ color: "var(--text-primary)" }}>Formula Injection Neutralization + UTF-8 BOM</span>
              </div>
            </div>

            <div
              style={{
                padding: "12px 16px",
                borderRadius: "var(--radius-sm)",
                background: "rgba(245, 158, 11, 0.12)",
                border: "1px solid rgba(245, 158, 11, 0.35)",
                color: "#f59e0b",
                fontSize: "0.82rem",
                lineHeight: 1.5,
                marginBottom: 20,
              }}
            >
              <strong>Data Privacy Warning:</strong> This extract contains participant personal information (full names, mobile numbers, student IDs, and institution emails). You are authorized to extract this data strictly for festival logistics, check-in badges, and esports matchmaking.
            </div>

            <label style={{ display: "flex", alignItems: "flex-start", gap: 10, cursor: "pointer", fontSize: "0.84rem", color: "var(--text-muted)", marginBottom: 24 }}>
              <input
                type="checkbox"
                checked={piiConsentGiven}
                onChange={(e) => setPiiConsentGiven(e.target.checked)}
                style={{ marginTop: 3 }}
              />
              <span>
                I confirm that I am an authorized CRM user (<strong>{currentRoleLabel}</strong>), that this download is for legitimate Supernova 3.0 operations, and that I will safeguard all personal data.
              </span>
            </label>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: 12 }}>
              <button onClick={() => setShowConfirmModal(false)} className="btn btn-ghost">
                Cancel
              </button>
              <button
                onClick={handleExecuteExport}
                disabled={!piiConsentGiven || isExporting}
                className="btn btn-primary"
                style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 20px", fontWeight: 700 }}
              >
                <Download size={16} />
                <span>{isExporting ? "Generating File..." : "Download Export"}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
