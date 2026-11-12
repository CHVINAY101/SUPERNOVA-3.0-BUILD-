import React, { useState, useEffect } from "react";
import { useAuth } from "@/lib/auth";
import {
  initGoogleAuth,
  signInWithGoogle,
  logoutGoogle,
  getGoogleAccessToken,
  SCOPES,
} from "@/lib/googleAuth";
import {
  fetchGmailProfile,
  sendGmailDirect,
  listRecentSentFromGmail,
  type GmailProfile,
  type GmailSentMessage,
} from "@/services/gmailApiService";
import {
  sendCrmEmail,
  getCrmEmailHistory,
  getSuggestedRecipients,
  CRM_EMAIL_TEMPLATES,
  type RecipientSuggestion,
} from "@/services/crmEmailService";
import type { CrmEmail } from "@/types/database";
import type { User as FirebaseUser } from "firebase/auth";
import {
  Mail,
  Send,
  RefreshCw,
  Search,
  CheckCircle,
  AlertTriangle,
  Clock,
  Eye,
  Edit3,
  ShieldCheck,
  ChevronDown,
  ChevronUp,
  RotateCcw,
  Users,
  FileText,
  ExternalLink,
  Info,
  X,
  LogOut,
  Inbox,
} from "lucide-react";

export default function AdminCrmEmails() {
  const { user: adminUser } = useAuth();

  // Tab State: "compose" | "history" | "gmail_sent" | "setup"
  const [activeTab, setActiveTab] = useState<"compose" | "history" | "gmail_sent" | "setup">("compose");

  // Google Auth State
  const [googleUser, setGoogleUser] = useState<FirebaseUser | null>(null);
  const [googleToken, setGoogleToken] = useState<string | null>(null);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [gmailProfile, setGmailProfile] = useState<GmailProfile | null>(null);
  const [loadingProfile, setLoadingProfile] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  // Form State
  const [recipient, setRecipient] = useState("");
  const [showCcBcc, setShowCcBcc] = useState(false);
  const [cc, setCc] = useState("");
  const [bcc, setBcc] = useState("");
  const [subject, setSubject] = useState("");
  const [bodyHtml, setBodyHtml] = useState(CRM_EMAIL_TEMPLATES[0].bodyHtml);
  const [selectedTemplate, setSelectedTemplate] = useState(CRM_EMAIL_TEMPLATES[0].id);

  // Mode: "edit" | "preview"
  const [composeMode, setComposeMode] = useState<"edit" | "preview">("edit");

  // Recipient Auto-suggest
  const [suggestions, setSuggestions] = useState<RecipientSuggestion[]>([]);
  const [filteredSuggestions, setFilteredSuggestions] = useState<RecipientSuggestion[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);

  // Confirmation Modal
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [sendResult, setSendResult] = useState<{
    ok: boolean;
    message?: string;
    error?: string;
  } | null>(null);

  // History State
  const [history, setHistory] = useState<CrmEmail[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [historySearch, setHistorySearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [expandedEmailId, setExpandedEmailId] = useState<string | null>(null);

  // Live Gmail Sent Messages
  const [gmailSentMessages, setGmailSentMessages] = useState<GmailSentMessage[]>([]);
  const [loadingGmailSent, setLoadingGmailSent] = useState(false);

  // Retry State
  const [retryingId, setRetryingId] = useState<string | null>(null);

  // Initialize Google Auth listener
  useEffect(() => {
    const unsubscribe = initGoogleAuth(
      (user, token) => {
        setGoogleUser(user);
        setGoogleToken(token);
        loadGmailProfile(token);
      },
      () => {
        setGoogleUser(null);
        setGoogleToken(null);
        setGmailProfile(null);
      }
    );

    loadHistory();
    loadSuggestions();

    return () => unsubscribe();
  }, []);

  const loadGmailProfile = async (token: string) => {
    setLoadingProfile(true);
    setAuthError(null);
    try {
      const profile = await fetchGmailProfile(token);
      setGmailProfile(profile);
    } catch (err: any) {
      console.warn("Could not load Gmail profile:", err);
      setAuthError(err.message || "Failed to load Gmail profile");
    } finally {
      setLoadingProfile(false);
    }
  };

  const handleGoogleLogin = async () => {
    setIsLoggingIn(true);
    setAuthError(null);
    try {
      const res = await signInWithGoogle();
      if (res) {
        setGoogleUser(res.user);
        setGoogleToken(res.accessToken);
        await loadGmailProfile(res.accessToken);
      }
    } catch (err: any) {
      console.error("Google Sign-In failed:", err);
      setAuthError(err.message || "Google sign in failed or popup was closed.");
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleGoogleLogout = async () => {
    await logoutGoogle();
    setGoogleUser(null);
    setGoogleToken(null);
    setGmailProfile(null);
  };

  const loadHistory = async () => {
    setLoadingHistory(true);
    try {
      const emails = await getCrmEmailHistory();
      setHistory(emails);
    } catch (err) {
      console.warn("Failed to load CRM history:", err);
    } finally {
      setLoadingHistory(false);
    }
  };

  const loadGmailSent = async () => {
    const token = googleToken || (await getGoogleAccessToken());
    if (!token) return;
    setLoadingGmailSent(true);
    try {
      const msgs = await listRecentSentFromGmail(token, 10);
      setGmailSentMessages(msgs);
    } catch (err) {
      console.warn("Could not fetch sent emails from Gmail:", err);
    } finally {
      setLoadingGmailSent(false);
    }
  };

  const loadSuggestions = async () => {
    try {
      const list = await getSuggestedRecipients();
      setSuggestions(list);
    } catch (err) {
      console.warn("Failed to load recipient suggestions:", err);
    }
  };

  // Handle Recipient Input & Auto-suggest Filter
  const handleRecipientChange = (val: string) => {
    setRecipient(val);
    if (!val.trim()) {
      setFilteredSuggestions([]);
      setShowSuggestions(false);
      return;
    }
    const q = val.toLowerCase().trim();
    const matches = suggestions.filter(
      (s) =>
        s.email.toLowerCase().includes(q) ||
        s.name.toLowerCase().includes(q) ||
        (s.ref && s.ref.toLowerCase().includes(q))
    );
    setFilteredSuggestions(matches.slice(0, 6));
    setShowSuggestions(matches.length > 0);
  };

  const selectSuggestion = (s: RecipientSuggestion) => {
    setRecipient(s.email);
    setShowSuggestions(false);
  };

  // Handle Template change
  const handleTemplateSelect = (templateId: string) => {
    setSelectedTemplate(templateId);
    const tmpl = CRM_EMAIL_TEMPLATES.find((t) => t.id === templateId);
    if (tmpl) {
      setSubject(tmpl.subject);
      setBodyHtml(tmpl.bodyHtml);
    }
  };

  // Duplicate Check
  const checkDuplicate = (targetRecipient: string, targetSubject: string) => {
    const normRec = targetRecipient.trim().toLowerCase();
    const normSub = targetSubject.trim().toLowerCase();
    return history.some(
      (h) =>
        h.status === "sent" &&
        h.recipient.toLowerCase() === normRec &&
        h.subject.toLowerCase() === normSub
    );
  };

  const isPotentialDuplicate = checkDuplicate(recipient, subject);

  const handleOpenSendConfirmation = (e: React.FormEvent) => {
    e.preventDefault();
    setSendResult(null);

    if (!recipient.trim() || !subject.trim() || !bodyHtml.trim()) {
      setSendResult({
        ok: false,
        error: "Please complete recipient, subject, and message content before sending.",
      });
      return;
    }

    setShowConfirmModal(true);
  };

  // Execute Send: Uses client-side token if authenticated with Google, else falls back to Edge Function
  const handleExecuteSend = async () => {
    setShowConfirmModal(false);
    setIsSending(true);
    setSendResult(null);

    try {
      const activeToken = googleToken || (await getGoogleAccessToken());

      if (activeToken) {
        // Direct Client-Side Gmail API dispatch via OAuth Bearer token
        const sendRes = await sendGmailDirect(
          {
            to: recipient.trim(),
            cc: cc.trim() || undefined,
            bcc: bcc.trim() || undefined,
            subject: subject.trim(),
            bodyHtml,
          },
          activeToken
        );

        setSendResult({
          ok: true,
          message: `Email successfully delivered via Gmail API! Message ID: ${sendRes.id}`,
        });

        // Record in history log
        loadHistory();
        if (gmailProfile) {
          loadGmailProfile(activeToken);
        }
      } else {
        // Dispatch via Supabase Edge Function
        const res = await sendCrmEmail({
          recipient: recipient.trim(),
          cc: cc.trim() || undefined,
          bcc: bcc.trim() || undefined,
          subject: subject.trim(),
          bodyHtml,
        });

        if (res.ok) {
          setSendResult({
            ok: true,
            message: res.skipped
              ? "Duplicate-send protection: this exact message was already processed previously."
              : `Email successfully dispatched via Gmail API! Message ID: ${res.messageId || "ok"}`,
          });
          loadHistory();
        } else {
          setSendResult({
            ok: false,
            error: res.error || "Failed to send email via Gmail API.",
          });
        }
      }
    } catch (err: any) {
      setSendResult({
        ok: false,
        error: err.message || "Failed to dispatch email via Gmail API.",
      });
    } finally {
      setIsSending(false);
    }
  };

  // Handle Retry
  const handleRetry = async (item: CrmEmail) => {
    if (item.status === "sent") {
      alert("This email has already been sent successfully.");
      return;
    }

    setRetryingId(item.id);
    const activeToken = googleToken || (await getGoogleAccessToken());

    if (activeToken) {
      try {
        await sendGmailDirect(
          {
            to: item.recipient,
            cc: item.cc || undefined,
            bcc: item.bcc || undefined,
            subject: item.subject,
            bodyHtml: item.body_html,
          },
          activeToken
        );
        alert("Email retried and sent successfully via Gmail API!");
        loadHistory();
      } catch (err: any) {
        alert(`Retry failed: ${err.message}`);
      } finally {
        setRetryingId(null);
      }
    } else {
      const res = await sendCrmEmail({
        recipient: item.recipient,
        cc: item.cc || undefined,
        bcc: item.bcc || undefined,
        subject: item.subject,
        bodyHtml: item.body_html,
      });
      setRetryingId(null);

      if (res.ok) {
        alert("Email retried and sent successfully!");
        loadHistory();
      } else {
        alert(`Retry failed: ${res.error}`);
      }
    }
  };

  // Filtered History
  const filteredHistory = history.filter((item) => {
    const matchesSearch =
      !historySearch.trim() ||
      item.recipient.toLowerCase().includes(historySearch.toLowerCase()) ||
      item.subject.toLowerCase().includes(historySearch.toLowerCase()) ||
      (item.sent_by_email && item.sent_by_email.toLowerCase().includes(historySearch.toLowerCase()));

    const matchesStatus =
      statusFilter === "all" || item.status === statusFilter;

    return matchesSearch && matchesStatus;
  });

  return (
    <div className="space-y-6 max-w-6xl mx-auto pb-12">
      {/* Page Header */}
      <div className="bg-white rounded-2xl border-2 border-slate-200 p-6 shadow-sm">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-xl bg-[#191936] text-[#D5F542] flex items-center justify-center shrink-0 shadow-sm">
              <Mail size={24} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-mono font-bold uppercase tracking-wider text-blue-600 bg-blue-50 px-2 py-0.5 rounded-md border border-blue-200">
                  Google Workspace · Gmail API
                </span>
                <span className="text-xs text-slate-400">·</span>
                <span className="text-xs font-mono text-slate-500">
                  Admin: {adminUser?.email}
                </span>
              </div>
              <h1 className="text-2xl font-display font-extrabold text-slate-900 mt-1">
                CRM Email Centre
              </h1>
              <p className="text-sm text-slate-600 mt-0.5">
                Official communications and registration outreach via{" "}
                <strong className="text-slate-900 font-mono">
                  animationthenationalcollege@gmail.com
                </strong>
                .
              </p>
            </div>
          </div>

          {/* Google Workspace Authentication Card */}
          <div className="flex items-center gap-3">
            {googleUser ? (
              <div className="flex items-center gap-3 bg-emerald-50 border border-emerald-300 rounded-2xl p-2.5 px-3.5">
                <div className="w-8 h-8 rounded-full bg-emerald-600 text-white flex items-center justify-center font-bold text-xs">
                  {googleUser.email?.[0].toUpperCase() || "G"}
                </div>
                <div className="text-left">
                  <div className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                    <span className="text-xs font-mono font-bold text-emerald-950">
                      {gmailProfile?.emailAddress || googleUser.email}
                    </span>
                  </div>
                  <span className="text-[10px] text-emerald-700 font-mono block">
                    {loadingProfile
                      ? "Verifying profile..."
                      : gmailProfile
                      ? `${gmailProfile.messagesTotal.toLocaleString()} messages in Gmail`
                      : "Gmail Token Active"}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={handleGoogleLogout}
                  className="p-1.5 text-slate-400 hover:text-red-600 rounded-lg transition-colors cursor-pointer ml-2"
                  title="Sign out of Google"
                >
                  <LogOut size={16} />
                </button>
              </div>
            ) : (
              <div className="flex flex-col items-end gap-1">
                {/* Official Sign in with Google Button */}
                <button
                  type="button"
                  onClick={handleGoogleLogin}
                  disabled={isLoggingIn}
                  className="inline-flex items-center gap-2.5 px-4 py-2 bg-white text-slate-700 border border-slate-300 rounded-xl hover:bg-slate-50 shadow-xs text-xs font-bold font-sans transition-all cursor-pointer disabled:opacity-60"
                >
                  <svg className="w-4 h-4" viewBox="0 0 48 48">
                    <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
                    <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
                    <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
                    <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
                  </svg>
                  <span>{isLoggingIn ? "Authenticating..." : "Connect Official Gmail Account"}</span>
                </button>
                <span className="text-[10px] text-slate-500 font-mono">
                  Target: animationthenationalcollege@gmail.com
                </span>
              </div>
            )}
          </div>
        </div>

        {authError && (
          <div className="mt-4 p-3 rounded-xl bg-amber-50 border border-amber-300 text-amber-900 text-xs flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertTriangle size={16} className="text-amber-600 shrink-0" />
              <span>{authError}</span>
            </div>
            <button
              type="button"
              onClick={() => setAuthError(null)}
              className="text-amber-700 hover:text-amber-950"
            >
              <X size={14} />
            </button>
          </div>
        )}

        {/* Tab Navigation */}
        <div className="mt-6 flex border-b border-slate-200 gap-6">
          <button
            type="button"
            onClick={() => setActiveTab("compose")}
            className={`pb-3 text-sm font-heading font-bold uppercase tracking-wider transition-all cursor-pointer border-b-2 flex items-center gap-2 ${
              activeTab === "compose"
                ? "border-[#191936] text-[#191936]"
                : "border-transparent text-slate-400 hover:text-slate-700"
            }`}
          >
            <Edit3 size={16} />
            <span>Compose Message</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("history")}
            className={`pb-3 text-sm font-heading font-bold uppercase tracking-wider transition-all cursor-pointer border-b-2 flex items-center gap-2 ${
              activeTab === "history"
                ? "border-[#191936] text-[#191936]"
                : "border-transparent text-slate-400 hover:text-slate-700"
            }`}
          >
            <Clock size={16} />
            <span>CRM Outbound Log</span>
            {history.length > 0 && (
              <span className="px-2 py-0.5 text-xs bg-slate-100 rounded-full font-mono text-slate-700">
                {history.length}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => {
              setActiveTab("gmail_sent");
              loadGmailSent();
            }}
            className={`pb-3 text-sm font-heading font-bold uppercase tracking-wider transition-all cursor-pointer border-b-2 flex items-center gap-2 ${
              activeTab === "gmail_sent"
                ? "border-[#191936] text-[#191936]"
                : "border-transparent text-slate-400 hover:text-slate-700"
            }`}
          >
            <Inbox size={16} />
            <span>Gmail Sent Box</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("setup")}
            className={`pb-3 text-sm font-heading font-bold uppercase tracking-wider transition-all cursor-pointer border-b-2 flex items-center gap-2 ${
              activeTab === "setup"
                ? "border-[#191936] text-[#191936]"
                : "border-transparent text-slate-400 hover:text-slate-700"
            }`}
          >
            <ShieldCheck size={16} />
            <span>OAuth &amp; Permissions</span>
          </button>
        </div>
      </div>

      {/* TAB 1: COMPOSE */}
      {activeTab === "compose" && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main Form (2 cols) */}
          <div className="lg:col-span-2 space-y-6">
            {/* Status alerts */}
            {sendResult && (
              <div
                className={`p-4 rounded-xl border flex items-start gap-3 ${
                  sendResult.ok
                    ? "bg-emerald-50 border-emerald-300 text-emerald-900"
                    : "bg-red-50 border-red-300 text-red-900"
                }`}
              >
                {sendResult.ok ? (
                  <CheckCircle size={20} className="shrink-0 text-emerald-600 mt-0.5" />
                ) : (
                  <AlertTriangle size={20} className="shrink-0 text-red-600 mt-0.5" />
                )}
                <div className="flex-1 text-xs sm:text-sm">
                  <p className="font-bold m-0">{sendResult.ok ? "Email Dispatched" : "Delivery Error"}</p>
                  <p className="m-0 mt-0.5 leading-relaxed font-mono text-xs">
                    {sendResult.message || sendResult.error}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setSendResult(null)}
                  className="text-slate-400 hover:text-slate-700 p-1"
                >
                  <X size={16} />
                </button>
              </div>
            )}

            {/* Warning if Duplicate */}
            {isPotentialDuplicate && (
              <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-300 text-amber-900 text-xs flex items-start gap-2.5">
                <AlertTriangle size={16} className="shrink-0 text-amber-600 mt-0.5" />
                <div>
                  <span className="font-bold block">Duplicate Protection Notice:</span>
                  An email with this exact recipient and subject was already sent previously. If you proceed, the system will apply idempotency verification to prevent accidental spam.
                </div>
              </div>
            )}

            {/* Compose Card */}
            <form onSubmit={handleOpenSendConfirmation} className="bg-white rounded-2xl border-2 border-slate-200 p-6 shadow-sm space-y-5">
              {/* Header Mode Toggle */}
              <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-mono font-bold uppercase tracking-wider text-slate-500">
                    Sender:
                  </span>
                  <span className="font-mono text-xs font-bold text-slate-900 bg-slate-100 px-2.5 py-1 rounded-md border border-slate-200">
                    {googleUser?.email || "animationthenationalcollege@gmail.com"}
                  </span>
                </div>

                <div className="flex p-1 bg-slate-100 rounded-lg border border-slate-200">
                  <button
                    type="button"
                    onClick={() => setComposeMode("edit")}
                    className={`px-3 py-1 rounded-md text-xs font-heading font-bold uppercase tracking-wider cursor-pointer ${
                      composeMode === "edit"
                        ? "bg-white text-slate-900 shadow-xs"
                        : "text-slate-600 hover:text-slate-900"
                    }`}
                  >
                    Edit HTML
                  </button>
                  <button
                    type="button"
                    onClick={() => setComposeMode("preview")}
                    className={`px-3 py-1 rounded-md text-xs font-heading font-bold uppercase tracking-wider cursor-pointer flex items-center gap-1 ${
                      composeMode === "preview"
                        ? "bg-white text-slate-900 shadow-xs"
                        : "text-slate-600 hover:text-slate-900"
                    }`}
                  >
                    <Eye size={13} />
                    <span>Preview</span>
                  </button>
                </div>
              </div>

              {/* Recipient Field with Autocomplete */}
              <div className="relative">
                <label className="block text-xs font-heading font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  To (Recipient Email) <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <input
                    type="email"
                    value={recipient}
                    onChange={(e) => handleRecipientChange(e.target.value)}
                    placeholder="student@example.com or search registrant..."
                    required
                    className="w-full h-11 pl-10 pr-24 bg-slate-50 border border-slate-300 rounded-xl text-sm font-body outline-none focus:bg-white focus:border-blue-600 focus:ring-2 focus:ring-blue-100 transition-all font-mono"
                  />
                  <Mail size={16} className="absolute left-3.5 top-3 text-slate-400" />
                  <button
                    type="button"
                    onClick={() => setShowCcBcc(!showCcBcc)}
                    className="absolute right-2.5 top-2 px-2 py-1 rounded text-[11px] font-mono font-bold text-slate-500 hover:text-slate-900 hover:bg-slate-200 transition-colors"
                  >
                    {showCcBcc ? "Hide CC" : "Cc / Bcc"}
                  </button>
                </div>

                {/* Suggestions Dropdown */}
                {showSuggestions && (
                  <div className="absolute z-20 left-0 right-0 top-full mt-1 bg-white border border-slate-200 rounded-xl shadow-lg max-h-56 overflow-y-auto divide-y divide-slate-100">
                    <div className="p-2 text-[11px] font-mono font-bold uppercase text-slate-400 bg-slate-50">
                      Matching Registrants ({filteredSuggestions.length})
                    </div>
                    {filteredSuggestions.map((s, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => selectSuggestion(s)}
                        className="w-full px-3 py-2 text-left hover:bg-blue-50 flex items-center justify-between transition-colors cursor-pointer"
                      >
                        <div>
                          <p className="text-xs font-bold text-slate-900 m-0">{s.name}</p>
                          <p className="text-[11px] font-mono text-slate-500 m-0">{s.email}</p>
                        </div>
                        <span className="text-[10px] font-mono font-bold uppercase px-2 py-0.5 rounded bg-slate-100 text-slate-600">
                          {s.type} {s.ref ? `· ${s.ref}` : ""}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Optional CC & BCC Fields */}
              {showCcBcc && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-3.5 bg-slate-50 rounded-xl border border-slate-200">
                  <div>
                    <label className="block text-[11px] font-heading font-bold text-slate-600 uppercase tracking-wider mb-1">
                      Cc (Optional)
                    </label>
                    <input
                      type="email"
                      value={cc}
                      onChange={(e) => setCc(e.target.value)}
                      placeholder="coordinator@nationalcollege.edu"
                      className="w-full h-9 px-3 bg-white border border-slate-300 rounded-lg text-xs font-mono outline-none focus:border-blue-600"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-heading font-bold text-slate-600 uppercase tracking-wider mb-1">
                      Bcc (Optional)
                    </label>
                    <input
                      type="email"
                      value={bcc}
                      onChange={(e) => setBcc(e.target.value)}
                      placeholder="archive@nationalcollege.edu"
                      className="w-full h-9 px-3 bg-white border border-slate-300 rounded-lg text-xs font-mono outline-none focus:border-blue-600"
                    />
                  </div>
                </div>
              )}

              {/* Subject Field */}
              <div>
                <label className="block text-xs font-heading font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  Subject Line <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  placeholder="e.g. Supernova 3.0 — Schedule Briefing & Venue Pass"
                  required
                  className="w-full h-11 px-3.5 bg-slate-50 border border-slate-300 rounded-xl text-sm font-body outline-none focus:bg-white focus:border-blue-600 focus:ring-2 focus:ring-blue-100 transition-all font-medium"
                />
              </div>

              {/* Message Content: Edit vs Preview */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-xs font-heading font-bold text-slate-700 uppercase tracking-wider">
                    Email HTML Body <span className="text-red-500">*</span>
                  </label>
                  <span className="text-[11px] font-mono text-slate-400">
                    Supports inline HTML &amp; CSS styling
                  </span>
                </div>

                {composeMode === "edit" ? (
                  <textarea
                    rows={12}
                    value={bodyHtml}
                    onChange={(e) => setBodyHtml(e.target.value)}
                    required
                    className="w-full p-3.5 bg-slate-900 text-slate-100 rounded-xl text-xs font-mono border border-slate-800 outline-none focus:ring-2 focus:ring-blue-500 leading-relaxed resize-y"
                  />
                ) : (
                  <div className="border border-slate-200 rounded-xl p-4 bg-slate-100 max-h-[460px] overflow-y-auto">
                    <div className="bg-white rounded-lg shadow-xs p-4">
                      <div className="border-b border-slate-100 pb-2 mb-3 text-xs text-slate-500 font-mono space-y-0.5">
                        <p className="m-0">
                          <strong>From:</strong>{" "}
                          {googleUser?.email || "animationthenationalcollege@gmail.com"}
                        </p>
                        <p className="m-0"><strong>To:</strong> {recipient || "(recipient address)"}</p>
                        {cc && <p className="m-0"><strong>Cc:</strong> {cc}</p>}
                        <p className="m-0"><strong>Subject:</strong> {subject || "(no subject)"}</p>
                      </div>
                      <div
                        dangerouslySetInnerHTML={{ __html: bodyHtml }}
                        className="prose prose-sm max-w-none"
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Action Buttons */}
              <div className="flex items-center justify-between pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => {
                    setRecipient("");
                    setSubject("");
                    setBodyHtml(CRM_EMAIL_TEMPLATES[0].bodyHtml);
                    setSendResult(null);
                  }}
                  className="px-4 py-2 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 text-xs font-heading font-bold uppercase tracking-wider transition-colors cursor-pointer"
                >
                  Clear Form
                </button>

                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setComposeMode(composeMode === "edit" ? "preview" : "edit")}
                    className="px-4 py-2.5 rounded-xl border border-slate-200 text-slate-700 hover:bg-slate-50 text-xs font-heading font-bold uppercase tracking-wider transition-colors cursor-pointer flex items-center gap-1.5"
                  >
                    <Eye size={15} />
                    <span>{composeMode === "edit" ? "Preview Render" : "Back to Editor"}</span>
                  </button>

                  <button
                    type="submit"
                    disabled={isSending}
                    className="px-6 py-2.5 rounded-xl bg-[#191936] text-[#D5F542] hover:bg-[#25254D] border-2 border-[#191936] text-xs font-heading font-bold uppercase tracking-wider shadow-sm transition-all cursor-pointer flex items-center gap-2 disabled:opacity-60"
                  >
                    <Send size={15} />
                    <span>{isSending ? "Dispatching..." : "Send via Gmail"}</span>
                  </button>
                </div>
              </div>
            </form>
          </div>

          {/* Sidebar Tools & Templates (1 col) */}
          <div className="space-y-6">
            {/* Template Selector Card */}
            <div className="bg-white rounded-2xl border-2 border-slate-200 p-5 shadow-sm space-y-4">
              <div className="flex items-center gap-2 text-slate-900">
                <FileText size={18} className="text-blue-600" />
                <h3 className="text-sm font-heading font-bold uppercase tracking-wider m-0">
                  Email Templates
                </h3>
              </div>
              <p className="text-xs text-slate-500 m-0">
                Quickly populate official letterhead templates with verified event formatting.
              </p>

              <div className="space-y-2">
                {CRM_EMAIL_TEMPLATES.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => handleTemplateSelect(t.id)}
                    className={`w-full text-left p-3 rounded-xl border transition-all cursor-pointer ${
                      selectedTemplate === t.id
                        ? "bg-blue-50/80 border-blue-400 text-blue-950 font-bold"
                        : "bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100"
                    }`}
                  >
                    <p className="text-xs m-0">{t.name}</p>
                    <p className="text-[11px] text-slate-500 font-normal truncate mt-0.5 m-0 font-mono">
                      {t.subject}
                    </p>
                  </button>
                ))}
              </div>
            </div>

            {/* Quick Contacts from Registrations */}
            <div className="bg-white rounded-2xl border-2 border-slate-200 p-5 shadow-sm space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-slate-900">
                  <Users size={18} className="text-blue-600" />
                  <h3 className="text-sm font-heading font-bold uppercase tracking-wider m-0">
                    Quick Contacts
                  </h3>
                </div>
                <span className="text-[11px] font-mono text-slate-400">
                  {suggestions.length} loaded
                </span>
              </div>
              <p className="text-xs text-slate-500 m-0">
                Click any registered contact to populate the recipient field:
              </p>

              <div className="max-h-64 overflow-y-auto divide-y divide-slate-100 pr-1">
                {suggestions.slice(0, 8).map((s, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => selectSuggestion(s)}
                    className="w-full text-left py-2 px-1 hover:bg-slate-50 rounded transition-colors flex items-center justify-between cursor-pointer"
                  >
                    <div className="min-w-0 pr-2">
                      <p className="text-xs font-bold text-slate-900 truncate m-0">{s.name}</p>
                      <p className="text-[11px] font-mono text-slate-500 truncate m-0">{s.email}</p>
                    </div>
                    <span className="text-[10px] font-mono font-bold uppercase px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 shrink-0">
                      {s.type}
                    </span>
                  </button>
                ))}
                {suggestions.length === 0 && (
                  <p className="text-xs text-slate-400 py-4 text-center">No registrants loaded</p>
                )}
              </div>
            </div>

            {/* Registration Confirmation Note */}
            <div className="bg-blue-50/60 rounded-2xl border border-blue-200 p-4 space-y-2">
              <div className="flex items-center gap-2 text-blue-900">
                <Info size={16} className="text-blue-600 shrink-0" />
                <h4 className="text-xs font-heading font-bold uppercase tracking-wider m-0">
                  Registration Workflow Policy
                </h4>
              </div>
              <p className="text-xs text-blue-800/80 leading-relaxed m-0">
                Automatic transactional registration confirmations currently run via the Resend Edge Function (<code>send-registration-confirmation</code>). CRM Gmail is used for manual communications, bracket notices, and inquiries.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: CRM OUTBOUND LOG */}
      {activeTab === "history" && (
        <div className="bg-white rounded-2xl border-2 border-slate-200 p-6 shadow-sm space-y-5">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-100">
            <div>
              <h2 className="text-lg font-heading font-bold text-slate-900 m-0">
                CRM Outbound Email Log
              </h2>
              <p className="text-xs text-slate-500 m-0 mt-0.5">
                Audit trail of all administrative emails dispatched via the Gmail integration.
              </p>
            </div>

            <div className="flex items-center gap-3">
              {/* Search */}
              <div className="relative">
                <input
                  type="text"
                  value={historySearch}
                  onChange={(e) => setHistorySearch(e.target.value)}
                  placeholder="Filter by recipient or subject..."
                  className="h-9 pl-8 pr-3 text-xs bg-slate-50 border border-slate-200 rounded-lg outline-none focus:border-blue-600 font-mono w-56"
                />
                <Search size={14} className="absolute left-2.5 top-2.5 text-slate-400" />
              </div>

              {/* Status filter */}
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="h-9 px-2.5 text-xs bg-slate-50 border border-slate-200 rounded-lg outline-none font-mono text-slate-700"
              >
                <option value="all">All Statuses</option>
                <option value="sent">Sent</option>
                <option value="failed">Failed</option>
                <option value="sending">Sending</option>
              </select>

              <button
                type="button"
                onClick={loadHistory}
                disabled={loadingHistory}
                className="p-2 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-600 transition-colors"
                title="Refresh log"
              >
                <RefreshCw size={14} className={loadingHistory ? "animate-spin" : ""} />
              </button>
            </div>
          </div>

          {/* History Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-500 font-heading uppercase tracking-wider text-[11px] border-b border-slate-200">
                <tr>
                  <th className="py-3 px-4">Recipient</th>
                  <th className="py-3 px-4">Subject</th>
                  <th className="py-3 px-4">Sender / Actor</th>
                  <th className="py-3 px-4">Timestamp</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-mono">
                {filteredHistory.map((item) => {
                  const isExpanded = expandedEmailId === item.id;
                  return (
                    <React.Fragment key={item.id}>
                      <tr className="hover:bg-slate-50/70 transition-colors">
                        <td className="py-3 px-4 font-bold text-slate-900">
                          {item.recipient}
                          {item.cc && (
                            <span className="block text-[10px] text-slate-400 font-normal">
                              Cc: {item.cc}
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-4 text-slate-800 max-w-xs truncate font-medium">
                          {item.subject}
                        </td>
                        <td className="py-3 px-4 text-slate-500 text-[11px]">
                          {item.sent_by_email || item.sender_email}
                        </td>
                        <td className="py-3 px-4 text-slate-500 text-[11px]">
                          {item.sent_at
                            ? new Date(item.sent_at).toLocaleString()
                            : new Date(item.created_at).toLocaleString()}
                        </td>
                        <td className="py-3 px-4">
                          <span
                            className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                              item.status === "sent"
                                ? "bg-emerald-50 text-emerald-800 border border-emerald-300"
                                : item.status === "failed"
                                ? "bg-red-50 text-red-800 border border-red-300"
                                : "bg-amber-50 text-amber-800 border border-amber-300"
                            }`}
                          >
                            <span
                              className={`w-1.5 h-1.5 rounded-full ${
                                item.status === "sent"
                                  ? "bg-emerald-500"
                                  : item.status === "failed"
                                  ? "bg-red-500"
                                  : "bg-amber-500 animate-pulse"
                              }`}
                            />
                            {item.status}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-right space-x-2">
                          <button
                            type="button"
                            onClick={() =>
                              setExpandedEmailId(isExpanded ? null : item.id)
                            }
                            className="p-1 rounded text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
                            title="View details"
                          >
                            {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                          </button>

                          {item.status === "failed" && (
                            <button
                              type="button"
                              onClick={() => handleRetry(item)}
                              disabled={retryingId === item.id}
                              className="px-2 py-1 rounded bg-red-100 hover:bg-red-200 text-red-800 text-[10px] font-bold uppercase tracking-wider transition-colors inline-flex items-center gap-1 cursor-pointer disabled:opacity-50"
                              title="Retry failed email"
                            >
                              <RotateCcw size={11} className={retryingId === item.id ? "animate-spin" : ""} />
                              <span>Retry</span>
                            </button>
                          )}
                        </td>
                      </tr>

                      {/* Expandable row with email preview & technical log */}
                      {isExpanded && (
                        <tr className="bg-slate-50/80">
                          <td colSpan={6} className="p-4">
                            <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
                              <div className="flex items-center justify-between text-[11px] font-mono text-slate-500 border-b pb-2">
                                <div>
                                  <span className="font-bold text-slate-700">Gmail Message ID:</span>{" "}
                                  <span>{item.gmail_message_id || "N/A (pending/failed)"}</span>
                                </div>
                                <div>
                                  <span className="font-bold text-slate-700">Idempotency Key:</span>{" "}
                                  <span>{item.idempotency_key || "N/A"}</span>
                                </div>
                              </div>

                              {item.error_message && (
                                <div className="p-2.5 rounded-lg bg-red-50 border border-red-200 text-red-900 text-xs font-mono">
                                  <strong>Error details:</strong> {item.error_message}
                                </div>
                              )}

                              <div className="text-xs">
                                <span className="text-slate-400 block mb-1 font-mono uppercase text-[10px] font-bold">
                                  Dispatched Content:
                                </span>
                                <div
                                  dangerouslySetInnerHTML={{ __html: item.body_html }}
                                  className="p-3 bg-slate-50 rounded-lg border border-slate-200 max-h-60 overflow-y-auto"
                                />
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}

                {filteredHistory.length === 0 && (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-slate-400">
                      No outbound CRM emails match the criteria.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 3: GMAIL SENT BOX */}
      {activeTab === "gmail_sent" && (
        <div className="bg-white rounded-2xl border-2 border-slate-200 p-6 shadow-sm space-y-5">
          <div className="flex items-center justify-between pb-4 border-b border-slate-100">
            <div>
              <h2 className="text-lg font-heading font-bold text-slate-900 m-0">
                Direct Gmail Sent Mailbox
              </h2>
              <p className="text-xs text-slate-500 m-0 mt-0.5">
                Real-time messages sent from <code>animationthenationalcollege@gmail.com</code> via the Gmail REST API.
              </p>
            </div>
            <button
              type="button"
              onClick={loadGmailSent}
              disabled={loadingGmailSent || !googleToken}
              className="p-2 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-600 transition-colors"
              title="Refresh Gmail sent"
            >
              <RefreshCw size={14} className={loadingGmailSent ? "animate-spin" : ""} />
            </button>
          </div>

          {!googleUser ? (
            <div className="text-center py-12 space-y-3">
              <Inbox size={40} className="mx-auto text-slate-300" />
              <h3 className="text-sm font-bold text-slate-700 m-0">Google Account Not Connected</h3>
              <p className="text-xs text-slate-500 max-w-sm mx-auto m-0">
                Click the "Connect Official Gmail Account" button above to view sent messages directly from the Gmail mailbox.
              </p>
              <button
                type="button"
                onClick={handleGoogleLogin}
                className="px-4 py-2 bg-blue-600 text-white rounded-xl text-xs font-bold font-heading uppercase tracking-wider"
              >
                Sign In With Google
              </button>
            </div>
          ) : loadingGmailSent ? (
            <div className="py-12 text-center text-xs font-mono text-slate-500">
              Fetching sent messages from Gmail API...
            </div>
          ) : gmailSentMessages.length === 0 ? (
            <div className="py-8 text-center text-xs font-mono text-slate-400">
              No recent sent messages found in Gmail.
            </div>
          ) : (
            <div className="divide-y divide-slate-100 font-mono text-xs">
              {gmailSentMessages.map((msg) => (
                <div key={msg.id} className="py-3 hover:bg-slate-50 flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-slate-900">{msg.to}</span>
                      <span className="text-[10px] text-slate-400">·</span>
                      <span className="text-[11px] text-slate-500">{msg.date}</span>
                    </div>
                    <p className="font-medium text-slate-800 m-0 mt-0.5">{msg.subject}</p>
                    {msg.snippet && (
                      <p className="text-slate-500 text-[11px] truncate m-0 mt-0.5">{msg.snippet}</p>
                    )}
                  </div>
                  <span className="text-[10px] font-mono text-slate-400 px-2 py-0.5 rounded bg-slate-100 shrink-0">
                    ID: {msg.id.slice(0, 8)}...
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* TAB 4: SETUP GUIDE & PERMISSIONS */}
      {activeTab === "setup" && (
        <div className="bg-white rounded-2xl border-2 border-slate-200 p-6 sm:p-8 shadow-sm space-y-6">
          <div className="flex items-start justify-between border-b border-slate-100 pb-4">
            <div>
              <span className="text-[11px] font-mono font-bold uppercase tracking-wider text-blue-600 bg-blue-50 px-2.5 py-0.5 rounded-md border border-blue-200">
                Google Cloud Project: graphite-computing-5bcxw
              </span>
              <h2 className="text-xl font-display font-extrabold text-slate-900 mt-1">
                Gmail API OAuth Configuration
              </h2>
              <p className="text-xs sm:text-sm text-slate-600 mt-1">
                Configured with authorized scopes for <code>animationthenationalcollege@gmail.com</code>.
              </p>
            </div>
            <a
              href="https://console.cloud.google.com/"
              target="_blank"
              rel="noreferrer"
              className="px-3 py-1.5 rounded-xl border border-slate-200 text-slate-700 hover:bg-slate-50 text-xs font-heading font-bold uppercase tracking-wider flex items-center gap-1.5"
            >
              <span>GCP Console</span>
              <ExternalLink size={14} />
            </a>
          </div>

          {/* Active Scopes List */}
          <div className="space-y-3">
            <h3 className="text-sm font-heading font-bold uppercase tracking-wider text-slate-900 m-0">
              Active Authorized Gmail Scopes ({SCOPES.length})
            </h3>
            <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-1.5 font-mono text-xs">
              {SCOPES.map((sc, idx) => (
                <div key={idx} className="flex items-center gap-2 text-slate-700">
                  <CheckCircle size={14} className="text-emerald-600 shrink-0" />
                  <span>{sc}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Firebase Configuration Info */}
          <div className="space-y-2">
            <h3 className="text-sm font-heading font-bold uppercase tracking-wider text-slate-900 m-0">
              OAuth Client Details
            </h3>
            <div className="p-4 bg-slate-900 text-slate-200 rounded-xl font-mono text-xs space-y-1 leading-relaxed overflow-x-auto">
              <div><span className="text-slate-400">Google Cloud Project:</span> graphite-computing-5bcxw</div>
              <div><span className="text-slate-400">Authorized Account:</span> animationthenationalcollege@gmail.com</div>
              <div><span className="text-slate-400">OAuth Client ID:</span> 765390400911-2tjs0gc0v3t04doovvvk2vk75oa2u79c.apps.googleusercontent.com</div>
              <div><span className="text-slate-400">Token Storage:</span> In-memory volatile cache (Security Hardened)</div>
            </div>
          </div>
        </div>
      )}

      {/* MANDATORY CONFIRMATION MODAL FOR OUTBOUND EMAIL */}
      {showConfirmModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="bg-white rounded-3xl border-3 border-slate-900 max-w-lg w-full p-6 sm:p-8 shadow-2xl space-y-5 animate-scaleUp">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-amber-100 text-amber-800 flex items-center justify-center shrink-0">
                <Send size={24} />
              </div>
              <div>
                <h3 className="text-lg font-heading font-extrabold text-slate-900 m-0">
                  Confirm Outbound Email Dispatch
                </h3>
                <p className="text-xs text-slate-500 m-0">
                  This will dispatch an official email via the Gmail API.
                </p>
              </div>
            </div>

            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 text-xs font-mono space-y-2">
              <div>
                <span className="text-slate-400 block text-[10px] font-bold uppercase">From Address:</span>
                <span className="font-bold text-slate-900">
                  {googleUser?.email || "animationthenationalcollege@gmail.com"}
                </span>
              </div>
              <div>
                <span className="text-slate-400 block text-[10px] font-bold uppercase">To (Recipient):</span>
                <span className="font-bold text-blue-700">{recipient}</span>
              </div>
              {cc && (
                <div>
                  <span className="text-slate-400 block text-[10px] font-bold uppercase">Cc:</span>
                  <span>{cc}</span>
                </div>
              )}
              <div>
                <span className="text-slate-400 block text-[10px] font-bold uppercase">Subject:</span>
                <span className="font-medium text-slate-900">{subject}</span>
              </div>
            </div>

            {isPotentialDuplicate && (
              <div className="p-3 bg-amber-50 rounded-xl border border-amber-300 text-xs text-amber-900">
                ⚠️ <strong>Warning:</strong> An email with this recipient and subject was already sent previously.
              </div>
            )}

            <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setShowConfirmModal(false)}
                className="px-4 py-2.5 rounded-xl border border-slate-300 text-slate-700 hover:bg-slate-50 text-xs font-heading font-bold uppercase tracking-wider transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleExecuteSend}
                disabled={isSending}
                className="px-6 py-2.5 rounded-xl bg-[#191936] text-[#D5F542] hover:bg-[#25254D] text-xs font-heading font-bold uppercase tracking-wider shadow-sm transition-all cursor-pointer flex items-center gap-2"
              >
                <Send size={14} />
                <span>Confirm &amp; Send Now</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
