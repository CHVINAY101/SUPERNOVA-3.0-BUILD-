import { useState, useMemo, useEffect } from "react";
import { useAuth } from "@/lib/auth";
import {
  type ChecklistItem,
  type AuditCategory,
  type AuditStatus,
  type AuditSeverity,
  loadPersistedChecklist,
  persistChecklist,
  calculateReadinessSummary,
  runAutomatedDiagnostics,
} from "@/services/readinessAuditService";
import {
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Clock,
  Play,
  RotateCcw,
  ShieldAlert,
  Search,
  FileCheck,
  X,
} from "lucide-react";

const CATEGORY_LABELS: Record<AuditCategory, { label: string; icon: string }> = {
  website: { label: "Website & UX", icon: "🌐" },
  database: { label: "Database & RPCs", icon: "🗄️" },
  security: { label: "Security & RLS", icon: "🛡️" },
  registrations: { label: "Registrations", icon: "📝" },
  realtime: { label: "Realtime PubSub", icon: "⚡" },
  admin_operations: { label: "Admin Operations", icon: "⚙️" },
  deployment: { label: "Deployment & Build", icon: "🚀" },
};

const SEVERITY_COLORS: Record<AuditSeverity, { bg: string; text: string; border: string }> = {
  CRITICAL: { bg: "rgba(239, 68, 68, 0.15)", text: "#ef4444", border: "rgba(239, 68, 68, 0.4)" },
  HIGH: { bg: "rgba(249, 115, 22, 0.15)", text: "#f97316", border: "rgba(249, 115, 22, 0.4)" },
  MEDIUM: { bg: "rgba(234, 179, 8, 0.15)", text: "#eab308", border: "rgba(234, 179, 8, 0.4)" },
  LOW: { bg: "rgba(59, 130, 246, 0.15)", text: "#3b82f6", border: "rgba(59, 130, 246, 0.4)" },
};

const STATUS_BADGES: Record<AuditStatus, { bg: string; text: string; icon: any }> = {
  PASSED: { bg: "rgba(16, 185, 129, 0.18)", text: "#10b981", icon: CheckCircle2 },
  FAILED: { bg: "rgba(239, 68, 68, 0.18)", text: "#ef4444", icon: XCircle },
  BLOCKED: { bg: "rgba(225, 29, 72, 0.22)", text: "#f43f5e", icon: ShieldAlert },
  "REQUIRES APPROVAL": { bg: "rgba(245, 158, 11, 0.18)", text: "#f59e0b", icon: Clock },
  PENDING: { bg: "rgba(148, 163, 184, 0.15)", text: "#94a3b8", icon: Clock },
  "NOT TESTED": { bg: "rgba(100, 116, 139, 0.15)", text: "#64748b", icon: Clock },
};

export default function AdminSystemReadiness() {
  const { user } = useAuth();
  const [items, setItems] = useState<ChecklistItem[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<AuditCategory | "all">("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [severityFilter, setSeverityFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  
  // Interactive modal state
  const [activeItem, setActiveItem] = useState<ChecklistItem | null>(null);
  const [editStatus, setEditStatus] = useState<AuditStatus>("PASSED");
  const [editNotes, setEditNotes] = useState("");
  const [editEvidence, setEditEvidence] = useState("");
  const [editAssignedTo, setEditAssignedTo] = useState("");
  const [validationError, setValidationError] = useState<string | null>(null);

  // Diagnostics running state
  const [isRunningDiagnostics, setIsRunningDiagnostics] = useState(false);
  const [diagnosticLogs, setDiagnosticLogs] = useState<string[]>([]);
  const [showLogModal, setShowLogModal] = useState(false);

  // Super admin publishing approval modal
  const [showPublishApprovalModal, setShowPublishApprovalModal] = useState(false);
  const [superAdminSignoffName, setSuperAdminSignoffName] = useState("");
  const [superAdminNotes, setSuperAdminNotes] = useState("");
  const [publishConsentGiven, setPublishConsentGiven] = useState(false);

  // Load checklist on mount
  useEffect(() => {
    const loaded = loadPersistedChecklist();
    setItems(loaded);
  }, []);

  const operatorEmail = user?.email || "admin@supernova";
  const summary = useMemo(() => calculateReadinessSummary(items, operatorEmail), [items, operatorEmail]);

  // Filter items
  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      if (selectedCategory !== "all" && item.category !== selectedCategory) return false;
      if (statusFilter !== "all" && item.status !== statusFilter) return false;
      if (severityFilter !== "all" && item.severity !== severityFilter) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesTitle = item.title.toLowerCase().includes(q);
        const matchesDesc = item.description.toLowerCase().includes(q);
        const matchesEvidence = item.evidence.toLowerCase().includes(q);
        const matchesAssigned = item.assignedTo.toLowerCase().includes(q);
        if (!matchesTitle && !matchesDesc && !matchesEvidence && !matchesAssigned) return false;
      }
      return true;
    });
  }, [items, selectedCategory, statusFilter, severityFilter, searchQuery]);

  // Handle opening item modal
  const handleOpenItem = (item: ChecklistItem) => {
    setActiveItem(item);
    setEditStatus(item.status);
    setEditNotes(item.notes || "");
    setEditEvidence(item.evidence || "");
    setEditAssignedTo(item.assignedTo || "");
    setValidationError(null);
  };

  // Handle saving item edits
  const handleSaveItemEdit = () => {
    if (!activeItem) return;

    // Security Constraint: Critical security check cannot be marked PASSED without evidence
    if (
      activeItem.severity === "CRITICAL" &&
      editStatus === "PASSED" &&
      (!editEvidence || editEvidence.trim().length < 5)
    ) {
      setValidationError(
        "Audit Constraint Violation: Critical security items CANNOT be marked PASSED without recorded verification evidence (minimum 5 characters)."
      );
      return;
    }

    const updated = items.map((it) => {
      if (it.id === activeItem.id) {
        return {
          ...it,
          status: editStatus,
          notes: editNotes,
          evidence: editEvidence,
          assignedTo: editAssignedTo,
          lastTested: new Date().toISOString(),
          testedBy: operatorEmail,
        };
      }
      return it;
    });

    setItems(updated);
    persistChecklist(updated);
    setActiveItem(null);
  };

  // Run live automated diagnostic suite
  const handleRunDiagnostics = async () => {
    setIsRunningDiagnostics(true);
    setDiagnosticLogs(["[DIAGNOSTICS] Starting live automated verification probe against Supabase instance..."]);
    setShowLogModal(true);

    try {
      const result = await runAutomatedDiagnostics(items, operatorEmail);
      setItems(result.updatedItems);
      persistChecklist(result.updatedItems);
      setDiagnosticLogs((prev) => [...prev, ...result.log, `[COMPLETE] Readiness score updated: ${result.summary.overallPercentage}%`]);
    } catch (err: any) {
      setDiagnosticLogs((prev) => [...prev, `[ERROR] Diagnostic run encountered an error: ${err.message}`]);
    } finally {
      setIsRunningDiagnostics(false);
    }
  };

  // Reset checklist to baseline
  const handleResetChecklist = () => {
    if (window.confirm("Reset all verification checks to baseline factory defaults?")) {
      localStorage.removeItem("supernova_system_readiness_audit");
      const defaults = loadPersistedChecklist();
      setItems(defaults);
    }
  };

  // Handle Super Admin Publishing Sign-Off
  const handleApprovePublishing = () => {
    if (summary.hasCriticalFailures) {
      alert("PUBLISHING BLOCKED: There are critical security or database failures that must be resolved first.");
      return;
    }

    if (!superAdminSignoffName.trim()) {
      alert("Please provide the Super Administrator sign-off name.");
      return;
    }

    if (!publishConsentGiven) {
      alert("Please confirm the publishing authorization checkbox.");
      return;
    }

    // Mark remaining approval items as PASSED with super admin signoff
    const updated = items.map((item) => {
      if (item.status === "REQUIRES APPROVAL") {
        return {
          ...item,
          status: "PASSED" as AuditStatus,
          notes: `${item.notes || ""} [Approved by Super Admin ${superAdminSignoffName} on ${new Date().toLocaleDateString()}: ${superAdminNotes}]`.trim(),
          lastTested: new Date().toISOString(),
          testedBy: superAdminSignoffName,
        };
      }
      return item;
    });

    setItems(updated);
    persistChecklist(updated);
    setShowPublishApprovalModal(false);
    alert(`🎉 Supernova 3.0 has been formally approved for publication by ${superAdminSignoffName}!`);
  };

  return (
    <div style={{ maxWidth: 1400, margin: "0 auto" }}>
      {/* Page Title & Controls */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 16, marginBottom: 28 }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: "1.6rem" }}>🛡️</span>
            <h1 style={{ fontSize: "1.85rem", fontWeight: 800, color: "var(--text-primary)", letterSpacing: "-0.02em" }}>
              System Readiness & Security Audit Centre
            </h1>
          </div>
          <p style={{ color: "var(--text-muted)", fontSize: "0.92rem", marginTop: 6, maxWidth: 880, lineHeight: 1.5 }}>
            Production flight checklist and live security verification for Supernova 3.0 (20–21 November 2026).
            Enforces strict pre-publication validation across database RLS, registration pipelines, secret exclusion, and admin RBAC.
          </p>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <button
            onClick={handleRunDiagnostics}
            disabled={isRunningDiagnostics}
            className="btn btn-primary"
            style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 18px", fontWeight: 700 }}
          >
            {isRunningDiagnostics ? <RotateCcw size={16} className="spin" /> : <Play size={16} />}
            <span>{isRunningDiagnostics ? "Probing System..." : "Run Automated Diagnostics"}</span>
          </button>
          
          <button
            onClick={() => setShowPublishApprovalModal(true)}
            className="btn"
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "10px 18px",
              fontWeight: 700,
              background: summary.publishingStatus === "READY TO PUBLISH" ? "rgba(16, 185, 129, 0.2)" : "rgba(34, 211, 238, 0.15)",
              border: `1px solid ${summary.publishingStatus === "READY TO PUBLISH" ? "#10b981" : "var(--cyan-400)"}`,
              color: summary.publishingStatus === "READY TO PUBLISH" ? "#10b981" : "var(--cyan-400)",
            }}
          >
            <FileCheck size={16} />
            <span>Publishing Sign-Off</span>
          </button>

          <button
            onClick={handleResetChecklist}
            className="btn btn-ghost"
            title="Reset Checklist"
            style={{ padding: "10px 12px" }}
          >
            <RotateCcw size={15} />
          </button>
        </div>
      </div>

      {/* Readiness Status Banner */}
      <div
        style={{
          padding: "18px 24px",
          borderRadius: "var(--radius-md)",
          marginBottom: 28,
          background:
            summary.publishingStatus === "READY TO PUBLISH"
              ? "rgba(16, 185, 129, 0.12)"
              : summary.publishingStatus === "REQUIRES REVIEW"
              ? "rgba(245, 158, 11, 0.12)"
              : "rgba(239, 68, 68, 0.12)",
          border: `1px solid ${
            summary.publishingStatus === "READY TO PUBLISH"
              ? "rgba(16, 185, 129, 0.4)"
              : summary.publishingStatus === "REQUIRES REVIEW"
              ? "rgba(245, 158, 11, 0.4)"
              : "rgba(239, 68, 68, 0.4)"
          }`,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: 16,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          {summary.publishingStatus === "READY TO PUBLISH" ? (
            <CheckCircle2 size={32} color="#10b981" />
          ) : summary.publishingStatus === "REQUIRES REVIEW" ? (
            <AlertTriangle size={32} color="#f59e0b" />
          ) : (
            <ShieldAlert size={32} color="#ef4444" />
          )}
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ fontSize: "1.1rem", fontWeight: 800, color: "var(--text-primary)" }}>
                PUBLISHING STATUS: {summary.publishingStatus}
              </span>
              <span
                style={{
                  fontSize: "0.75rem",
                  fontWeight: 700,
                  padding: "2px 8px",
                  borderRadius: 4,
                  background: "rgba(0,0,0,0.3)",
                  color: "var(--text-primary)",
                }}
              >
                {summary.overallPercentage}% READINESS
              </span>
            </div>
            <p style={{ fontSize: "0.85rem", color: "var(--text-muted)", marginTop: 4 }}>
              {summary.publishingStatus === "READY TO PUBLISH"
                ? "All critical security and operational checks have passed. Supernova 3.0 is certified ready for public launch."
                : summary.publishingStatus === "REQUIRES REVIEW"
                ? "All technical diagnostics verified. Requires formal sign-off on 4 governance items by a Super Administrator."
                : "Publication is currently BLOCKED due to pending critical security items or unverified technical constraints."}
            </p>
          </div>
        </div>

        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: "0.78rem", color: "var(--text-faint)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
            Last Verified
          </div>
          <div style={{ fontSize: "0.88rem", fontWeight: 600, color: "var(--text-primary)", marginTop: 2 }}>
            {summary.lastAuditDate ? new Date(summary.lastAuditDate).toLocaleString() : "Pending Verification"}
          </div>
          <div style={{ fontSize: "0.76rem", color: "var(--cyan-400)", marginTop: 2 }}>
            Operator: {summary.lastAuditOperator || "super_admin"}
          </div>
        </div>
      </div>

      {/* Metrics Row */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
          gap: 14,
          marginBottom: 28,
        }}
      >
        <div className="card" style={{ padding: "16px 20px" }}>
          <div style={{ fontSize: "0.75rem", color: "var(--text-faint)", textTransform: "uppercase", fontWeight: 700 }}>
            Total Audit Checks
          </div>
          <div style={{ fontSize: "1.75rem", fontWeight: 800, color: "var(--text-primary)", marginTop: 4 }}>
            {summary.total}
          </div>
          <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: 4 }}>7 Core Categories</div>
        </div>

        <div className="card" style={{ padding: "16px 20px", borderLeft: "3px solid #10b981" }}>
          <div style={{ fontSize: "0.75rem", color: "var(--text-faint)", textTransform: "uppercase", fontWeight: 700 }}>
            Passed
          </div>
          <div style={{ fontSize: "1.75rem", fontWeight: 800, color: "#10b981", marginTop: 4 }}>
            {summary.passed}
          </div>
          <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: 4 }}>
            {summary.overallPercentage}% verified
          </div>
        </div>

        <div className="card" style={{ padding: "16px 20px", borderLeft: "3px solid #ef4444" }}>
          <div style={{ fontSize: "0.75rem", color: "var(--text-faint)", textTransform: "uppercase", fontWeight: 700 }}>
            Failed
          </div>
          <div style={{ fontSize: "1.75rem", fontWeight: 800, color: "#ef4444", marginTop: 4 }}>
            {summary.failed}
          </div>
          <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: 4 }}>Blocking release</div>
        </div>

        <div className="card" style={{ padding: "16px 20px", borderLeft: "3px solid #f43f5e" }}>
          <div style={{ fontSize: "0.75rem", color: "var(--text-faint)", textTransform: "uppercase", fontWeight: 700 }}>
            Blocked
          </div>
          <div style={{ fontSize: "1.75rem", fontWeight: 800, color: "#f43f5e", marginTop: 4 }}>
            {summary.blocked}
          </div>
          <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: 4 }}>Critical dependency</div>
        </div>

        <div className="card" style={{ padding: "16px 20px", borderLeft: "3px solid #f59e0b" }}>
          <div style={{ fontSize: "0.75rem", color: "var(--text-faint)", textTransform: "uppercase", fontWeight: 700 }}>
            Pending Sign-Off
          </div>
          <div style={{ fontSize: "1.75rem", fontWeight: 800, color: "#f59e0b", marginTop: 4 }}>
            {summary.pendingApproval}
          </div>
          <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: 4 }}>Requires approval</div>
        </div>

        <div className="card" style={{ padding: "16px 20px", borderLeft: "3px solid var(--cyan-400)" }}>
          <div style={{ fontSize: "0.75rem", color: "var(--text-faint)", textTransform: "uppercase", fontWeight: 700 }}>
            Overall Health
          </div>
          <div style={{ fontSize: "1.75rem", fontWeight: 800, color: "var(--cyan-400)", marginTop: 4 }}>
            {summary.overallPercentage}%
          </div>
          <div style={{ width: "100%", height: 6, background: "rgba(255,255,255,0.1)", borderRadius: 3, marginTop: 8, overflow: "hidden" }}>
            <div
              style={{
                width: `${summary.overallPercentage}%`,
                height: "100%",
                background: summary.overallPercentage === 100 ? "#10b981" : "var(--cyan-400)",
                transition: "width 0.5s ease",
              }}
            />
          </div>
        </div>
      </div>

      {/* Category Tabs */}
      <div style={{ display: "flex", gap: 8, overflowX: "auto", paddingBottom: 8, marginBottom: 20 }}>
        <button
          onClick={() => setSelectedCategory("all")}
          className={`tab-btn ${selectedCategory === "all" ? "active" : ""}`}
          style={{
            padding: "8px 16px",
            borderRadius: "var(--radius-sm)",
            fontSize: "0.85rem",
            fontWeight: 600,
            cursor: "pointer",
            border: selectedCategory === "all" ? "1px solid var(--cyan-400)" : "1px solid var(--border-subtle)",
            background: selectedCategory === "all" ? "rgba(34, 211, 238, 0.15)" : "var(--navy-800)",
            color: selectedCategory === "all" ? "var(--cyan-400)" : "var(--text-muted)",
            whiteSpace: "nowrap",
          }}
        >
          All Categories ({items.length})
        </button>
        {(Object.keys(CATEGORY_LABELS) as AuditCategory[]).map((catKey) => {
          const count = items.filter((i) => i.category === catKey).length;
          const isSelected = selectedCategory === catKey;
          return (
            <button
              key={catKey}
              onClick={() => setSelectedCategory(catKey)}
              style={{
                padding: "8px 16px",
                borderRadius: "var(--radius-sm)",
                fontSize: "0.85rem",
                fontWeight: 600,
                cursor: "pointer",
                border: isSelected ? "1px solid var(--cyan-400)" : "1px solid var(--border-subtle)",
                background: isSelected ? "rgba(34, 211, 238, 0.15)" : "var(--navy-800)",
                color: isSelected ? "var(--cyan-400)" : "var(--text-muted)",
                whiteSpace: "nowrap",
                display: "flex",
                alignItems: "center",
                gap: 6,
              }}
            >
              <span>{CATEGORY_LABELS[catKey].icon}</span>
              <span>{CATEGORY_LABELS[catKey].label}</span>
              <span style={{ fontSize: "0.75rem", opacity: 0.7 }}>({count})</span>
            </button>
          );
        })}
      </div>

      {/* Filters & Search Bar */}
      <div
        className="card"
        style={{
          padding: "16px 20px",
          marginBottom: 24,
          display: "flex",
          gap: 16,
          flexWrap: "wrap",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10, flex: 1, minWidth: 260 }}>
          <Search size={16} color="var(--text-faint)" />
          <input
            type="text"
            placeholder="Search checks by title, description, evidence, or assignee..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{
              background: "transparent",
              border: "none",
              color: "var(--text-primary)",
              fontSize: "0.88rem",
              width: "100%",
              outline: "none",
            }}
          />
          {searchQuery && (
            <button onClick={() => setSearchQuery("")} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-faint)" }}>
              <X size={14} />
            </button>
          )}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: "0.78rem", color: "var(--text-faint)", textTransform: "uppercase", fontWeight: 700 }}>
              Status:
            </span>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="select"
              style={{ padding: "6px 10px", fontSize: "0.82rem", background: "var(--navy-900)", border: "1px solid var(--border-subtle)" }}
            >
              <option value="all">All Statuses</option>
              <option value="PASSED">Passed</option>
              <option value="FAILED">Failed</option>
              <option value="BLOCKED">Blocked</option>
              <option value="REQUIRES APPROVAL">Requires Approval</option>
              <option value="PENDING">Pending</option>
              <option value="NOT TESTED">Not Tested</option>
            </select>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: "0.78rem", color: "var(--text-faint)", textTransform: "uppercase", fontWeight: 700 }}>
              Severity:
            </span>
            <select
              value={severityFilter}
              onChange={(e) => setSeverityFilter(e.target.value)}
              className="select"
              style={{ padding: "6px 10px", fontSize: "0.82rem", background: "var(--navy-900)", border: "1px solid var(--border-subtle)" }}
            >
              <option value="all">All Severities</option>
              <option value="CRITICAL">Critical</option>
              <option value="HIGH">High</option>
              <option value="MEDIUM">Medium</option>
              <option value="LOW">Low</option>
            </select>
          </div>

          <div style={{ fontSize: "0.82rem", color: "var(--text-faint)" }}>
            Showing <strong>{filteredItems.length}</strong> of {items.length}
          </div>
        </div>
      </div>

      {/* Checklist Table */}
      <div className="card" style={{ overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left" }}>
          <thead>
            <tr style={{ background: "rgba(0,0,0,0.3)", borderBottom: "1px solid var(--border-subtle)" }}>
              <th style={{ padding: "14px 18px", fontSize: "0.74rem", textTransform: "uppercase", color: "var(--text-faint)", fontWeight: 800 }}>
                Category
              </th>
              <th style={{ padding: "14px 18px", fontSize: "0.74rem", textTransform: "uppercase", color: "var(--text-faint)", fontWeight: 800 }}>
                Check Title & Description
              </th>
              <th style={{ padding: "14px 18px", fontSize: "0.74rem", textTransform: "uppercase", color: "var(--text-faint)", fontWeight: 800 }}>
                Severity
              </th>
              <th style={{ padding: "14px 18px", fontSize: "0.74rem", textTransform: "uppercase", color: "var(--text-faint)", fontWeight: 800 }}>
                Status
              </th>
              <th style={{ padding: "14px 18px", fontSize: "0.74rem", textTransform: "uppercase", color: "var(--text-faint)", fontWeight: 800 }}>
                Verification Evidence
              </th>
              <th style={{ padding: "14px 18px", fontSize: "0.74rem", textTransform: "uppercase", color: "var(--text-faint)", fontWeight: 800, textAlign: "right" }}>
                Actions
              </th>
            </tr>
          </thead>
          <tbody>
            {filteredItems.length === 0 ? (
              <tr>
                <td colSpan={6} style={{ padding: 48, textAlign: "center", color: "var(--text-muted)" }}>
                  No checklist items match the selected filters.
                </td>
              </tr>
            ) : (
              filteredItems.map((item) => {
                const StatusIcon = STATUS_BADGES[item.status]?.icon || Clock;
                const statusStyle = STATUS_BADGES[item.status] || STATUS_BADGES.PENDING;
                const sevStyle = SEVERITY_COLORS[item.severity];

                return (
                  <tr
                    key={item.id}
                    onClick={() => handleOpenItem(item)}
                    style={{
                      borderBottom: "1px solid var(--border-subtle)",
                      cursor: "pointer",
                      transition: "background var(--transition-fast)",
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.02)")}
                    onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                  >
                    <td style={{ padding: "14px 18px", verticalAlign: "top", width: 140 }}>
                      <span
                        style={{
                          fontSize: "0.75rem",
                          fontWeight: 700,
                          color: "var(--text-muted)",
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 6,
                        }}
                      >
                        <span>{CATEGORY_LABELS[item.category].icon}</span>
                        <span>{CATEGORY_LABELS[item.category].label.split(" ")[0]}</span>
                      </span>
                    </td>

                    <td style={{ padding: "14px 18px", verticalAlign: "top" }}>
                      <div style={{ fontWeight: 700, fontSize: "0.9rem", color: "var(--text-primary)" }}>
                        {item.title}
                      </div>
                      <div style={{ fontSize: "0.8rem", color: "var(--text-muted)", marginTop: 4, lineHeight: 1.4 }}>
                        {item.description}
                      </div>
                      {item.assignedTo && (
                        <div style={{ fontSize: "0.72rem", color: "var(--cyan-400)", marginTop: 4 }}>
                          Assigned: <strong>{item.assignedTo}</strong>
                        </div>
                      )}
                    </td>

                    <td style={{ padding: "14px 18px", verticalAlign: "top", width: 110 }}>
                      <span
                        style={{
                          fontSize: "0.7rem",
                          fontWeight: 800,
                          padding: "2px 8px",
                          borderRadius: 4,
                          background: sevStyle.bg,
                          color: sevStyle.text,
                          border: `1px solid ${sevStyle.border}`,
                          display: "inline-block",
                        }}
                      >
                        {item.severity}
                      </span>
                    </td>

                    <td style={{ padding: "14px 18px", verticalAlign: "top", width: 160 }}>
                      <span
                        style={{
                          fontSize: "0.75rem",
                          fontWeight: 700,
                          padding: "4px 10px",
                          borderRadius: "var(--radius-sm)",
                          background: statusStyle.bg,
                          color: statusStyle.text,
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 6,
                        }}
                      >
                        <StatusIcon size={14} />
                        <span>{item.status}</span>
                      </span>
                    </td>

                    <td style={{ padding: "14px 18px", verticalAlign: "top", maxWidth: 280 }}>
                      <div style={{ fontSize: "0.8rem", color: "var(--text-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {item.evidence || "No evidence recorded yet."}
                      </div>
                      <div style={{ fontSize: "0.7rem", color: "var(--text-faint)", marginTop: 2 }}>
                        {item.lastTested ? `Tested: ${new Date(item.lastTested).toLocaleDateString()}` : "Not tested"}
                      </div>
                    </td>

                    <td style={{ padding: "14px 18px", verticalAlign: "top", textAlign: "right", width: 80 }}>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleOpenItem(item);
                        }}
                        className="btn btn-ghost"
                        style={{ padding: "4px 8px", fontSize: "0.78rem" }}
                      >
                        Review
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Interactive Item Edit Modal */}
      {activeItem && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.8)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
            padding: 20,
          }}
          onClick={() => setActiveItem(null)}
        >
          <div
            className="card"
            style={{
              maxWidth: 680,
              width: "100%",
              maxHeight: "90vh",
              overflowY: "auto",
              padding: 28,
              background: "var(--navy-900)",
              border: "1px solid var(--border-subtle)",
              borderRadius: "var(--radius-lg)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 }}>
              <div>
                <span style={{ fontSize: "0.75rem", color: "var(--cyan-400)", fontWeight: 700, textTransform: "uppercase" }}>
                  {CATEGORY_LABELS[activeItem.category].label} · ID: {activeItem.id}
                </span>
                <h2 style={{ fontSize: "1.25rem", fontWeight: 800, color: "var(--text-primary)", marginTop: 4 }}>
                  {activeItem.title}
                </h2>
              </div>
              <button onClick={() => setActiveItem(null)} style={{ background: "none", border: "none", color: "var(--text-faint)", cursor: "pointer" }}>
                <X size={20} />
              </button>
            </div>

            <p style={{ fontSize: "0.88rem", color: "var(--text-muted)", lineHeight: 1.5, marginBottom: 20 }}>
              {activeItem.description}
            </p>

            {validationError && (
              <div
                style={{
                  padding: "12px 16px",
                  borderRadius: "var(--radius-sm)",
                  background: "rgba(239, 68, 68, 0.15)",
                  border: "1px solid rgba(239, 68, 68, 0.4)",
                  color: "#ef4444",
                  fontSize: "0.85rem",
                  marginBottom: 20,
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                }}
              >
                <ShieldAlert size={16} />
                <span>{validationError}</span>
              </div>
            )}

            <div style={{ display: "grid", gap: 16 }}>
              <div>
                <label style={{ display: "block", fontSize: "0.78rem", fontWeight: 700, textTransform: "uppercase", color: "var(--text-faint)", marginBottom: 6 }}>
                  Status
                </label>
                <select
                  value={editStatus}
                  onChange={(e) => setEditStatus(e.target.value as AuditStatus)}
                  className="select"
                  style={{ width: "100%", padding: "10px 14px", background: "var(--navy-800)", border: "1px solid var(--border-subtle)" }}
                >
                  <option value="PASSED">PASSED (Verified)</option>
                  <option value="FAILED">FAILED (Defect Found)</option>
                  <option value="BLOCKED">BLOCKED (Dependent on External Blockers)</option>
                  <option value="REQUIRES APPROVAL">REQUIRES APPROVAL (Awaiting Formal Sign-Off)</option>
                  <option value="PENDING">PENDING (In Progress)</option>
                  <option value="NOT TESTED">NOT TESTED</option>
                </select>
              </div>

              <div>
                <label style={{ display: "block", fontSize: "0.78rem", fontWeight: 700, textTransform: "uppercase", color: "var(--text-faint)", marginBottom: 6 }}>
                  Verification Evidence / Test Reference <span style={{ color: "#ef4444" }}>*</span>
                </label>
                <input
                  type="text"
                  placeholder="e.g. Migration 0005 executed; RLS policy verified in Supabase SQL Editor"
                  value={editEvidence}
                  onChange={(e) => setEditEvidence(e.target.value)}
                  className="input"
                  style={{ width: "100%", padding: "10px 14px", background: "var(--navy-800)", border: "1px solid var(--border-subtle)" }}
                />
                <span style={{ fontSize: "0.72rem", color: "var(--text-faint)", marginTop: 4, display: "block" }}>
                  Mandatory for CRITICAL items before marking PASSED.
                </span>
              </div>

              <div>
                <label style={{ display: "block", fontSize: "0.78rem", fontWeight: 700, textTransform: "uppercase", color: "var(--text-faint)", marginBottom: 6 }}>
                  Assigned Team / Officer
                </label>
                <input
                  type="text"
                  placeholder="e.g. Security Lead, DevOps, DBA, Festival Director"
                  value={editAssignedTo}
                  onChange={(e) => setEditAssignedTo(e.target.value)}
                  className="input"
                  style={{ width: "100%", padding: "10px 14px", background: "var(--navy-800)", border: "1px solid var(--border-subtle)" }}
                />
              </div>

              <div>
                <label style={{ display: "block", fontSize: "0.78rem", fontWeight: 700, textTransform: "uppercase", color: "var(--text-faint)", marginBottom: 6 }}>
                  Audit Notes & Remediation History
                </label>
                <textarea
                  rows={3}
                  placeholder="Add operator notes, remediation actions taken, or test outcome details..."
                  value={editNotes}
                  onChange={(e) => setEditNotes(e.target.value)}
                  className="textarea"
                  style={{ width: "100%", padding: "10px 14px", background: "var(--navy-800)", border: "1px solid var(--border-subtle)" }}
                />
              </div>
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: 12, marginTop: 24 }}>
              <button onClick={() => setActiveItem(null)} className="btn btn-ghost">
                Cancel
              </button>
              <button onClick={handleSaveItemEdit} className="btn btn-primary" style={{ padding: "10px 20px", fontWeight: 700 }}>
                Save Audit Review
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Diagnostics Logs Modal */}
      {showLogModal && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.8)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
            padding: 20,
          }}
          onClick={() => !isRunningDiagnostics && setShowLogModal(false)}
        >
          <div
            className="card"
            style={{
              maxWidth: 700,
              width: "100%",
              maxHeight: "80vh",
              overflowY: "auto",
              padding: 24,
              background: "var(--navy-900)",
              border: "1px solid var(--border-subtle)",
              borderRadius: "var(--radius-lg)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <h3 style={{ fontSize: "1.15rem", fontWeight: 800, color: "var(--text-primary)" }}>
                Automated Diagnostic Execution Output
              </h3>
              {!isRunningDiagnostics && (
                <button onClick={() => setShowLogModal(false)} style={{ background: "none", border: "none", color: "var(--text-faint)", cursor: "pointer" }}>
                  <X size={18} />
                </button>
              )}
            </div>

            <div
              style={{
                background: "rgba(0,0,0,0.4)",
                padding: 16,
                borderRadius: "var(--radius-sm)",
                fontFamily: "var(--font-mono)",
                fontSize: "0.8rem",
                color: "var(--cyan-400)",
                maxHeight: 400,
                overflowY: "auto",
                lineHeight: 1.6,
              }}
            >
              {diagnosticLogs.map((line, idx) => (
                <div key={idx} style={{ color: line.startsWith("[PASSED]") ? "#10b981" : line.startsWith("[FAILED]") ? "#ef4444" : "var(--cyan-400)" }}>
                  {line}
                </div>
              ))}
              {isRunningDiagnostics && (
                <div style={{ color: "var(--amber-400)", marginTop: 8 }}>Probing live database tables and security policies...</div>
              )}
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 20 }}>
              <button
                onClick={() => setShowLogModal(false)}
                disabled={isRunningDiagnostics}
                className="btn btn-primary"
                style={{ padding: "8px 18px", fontWeight: 700 }}
              >
                Close Output
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Super Admin Publishing Sign-Off Modal */}
      {showPublishApprovalModal && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.8)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
            padding: 20,
          }}
          onClick={() => setShowPublishApprovalModal(false)}
        >
          <div
            className="card"
            style={{
              maxWidth: 640,
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
                <h2 style={{ fontSize: "1.3rem", fontWeight: 800, color: "var(--text-primary)" }}>
                  Festival Publication Authorization
                </h2>
                <span style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>
                  Formal sign-off by College Principal & Steering Committee
                </span>
              </div>
            </div>

            {summary.hasCriticalFailures ? (
              <div
                style={{
                  padding: 16,
                  borderRadius: "var(--radius-sm)",
                  background: "rgba(239, 68, 68, 0.15)",
                  border: "1px solid rgba(239, 68, 68, 0.4)",
                  color: "#ef4444",
                  fontSize: "0.85rem",
                  marginBottom: 20,
                }}
              >
                <strong>CANNOT AUTHORIZE:</strong> Critical security or database failures detected. All critical items must be resolved before publication.
              </div>
            ) : (
              <div
                style={{
                  padding: 16,
                  borderRadius: "var(--radius-sm)",
                  background: "rgba(16, 185, 129, 0.12)",
                  border: "1px solid rgba(16, 185, 129, 0.4)",
                  color: "#10b981",
                  fontSize: "0.85rem",
                  marginBottom: 20,
                }}
              >
                <strong>TECHNICAL AUDIT PASSED:</strong> 100% of automated technical tests passed without critical vulnerabilities.
              </div>
            )}

            <div style={{ display: "grid", gap: 16 }}>
              <div>
                <label style={{ display: "block", fontSize: "0.78rem", fontWeight: 700, textTransform: "uppercase", color: "var(--text-faint)", marginBottom: 6 }}>
                  Super Administrator Full Name & Title
                </label>
                <input
                  type="text"
                  placeholder="e.g. Dr. H. S. Balakrishna, Principal / Festival Director"
                  value={superAdminSignoffName}
                  onChange={(e) => setSuperAdminSignoffName(e.target.value)}
                  className="input"
                  style={{ width: "100%", padding: "10px 14px", background: "var(--navy-800)", border: "1px solid var(--border-subtle)" }}
                />
              </div>

              <div>
                <label style={{ display: "block", fontSize: "0.78rem", fontWeight: 700, textTransform: "uppercase", color: "var(--text-faint)", marginBottom: 6 }}>
                  Executive Sign-Off Remarks
                </label>
                <textarea
                  rows={2}
                  placeholder="Confirmed festival dates (20-21 Nov 2026), prize pool allocation, and campus readiness approved."
                  value={superAdminNotes}
                  onChange={(e) => setSuperAdminNotes(e.target.value)}
                  className="textarea"
                  style={{ width: "100%", padding: "10px 14px", background: "var(--navy-800)", border: "1px solid var(--border-subtle)" }}
                />
              </div>

              <label style={{ display: "flex", alignItems: "flex-start", gap: 10, cursor: "pointer", fontSize: "0.84rem", color: "var(--text-muted)", marginTop: 6 }}>
                <input
                  type="checkbox"
                  checked={publishConsentGiven}
                  onChange={(e) => setPublishConsentGiven(e.target.checked)}
                  style={{ marginTop: 3 }}
                />
                <span>
                  I confirm as an authorized Super Administrator that this application has been formally reviewed, security advisors evaluated, and all governance criteria met for public deployment.
                </span>
              </label>
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: 12, marginTop: 24 }}>
              <button onClick={() => setShowPublishApprovalModal(false)} className="btn btn-ghost">
                Cancel
              </button>
              <button
                onClick={handleApprovePublishing}
                disabled={summary.hasCriticalFailures || !publishConsentGiven || !superAdminSignoffName.trim()}
                className="btn btn-primary"
                style={{ padding: "10px 20px", fontWeight: 700 }}
              >
                Sign & Authorize Publication
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
