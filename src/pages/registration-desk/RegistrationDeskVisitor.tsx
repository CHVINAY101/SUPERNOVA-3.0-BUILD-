import { useCallback, useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import {
  buildVisitorDisplaySubtitle,
  FACULTY_DESIGNATION_OPTIONS,
  getDbCategoryFromId,
  resolveFacultyDesignationValue,
  validateVisitorFormFields,
  VISITOR_CATEGORY_CARDS,
  type VisitorCategoryId,
} from "@/lib/visitorCategories";
import {
  extractVisitorRegistrationError,
  fetchTicketByRegistration,
  issueTicketForRegistration,
  submitVisitorAndIssueTicket,
} from "@/lib/ticketClient";
import { buildTicketQrContent, downloadTicketPdfFile } from "@/lib/ticketPdfService";
import { TicketPassModal } from "@/components/TicketPassModal";
import { formatIstTimestamp } from "@/lib/registrationDesk";
import type { RegistrationControl, TicketRecord } from "@/types/database";
import {
  AlertCircle,
  CheckCircle2,
  Copy,
  Download,
  Eye,
  Lock,
  Printer,
  RefreshCw,
  UserPlus,
} from "lucide-react";

interface ExistingVisitorMatch {
  id: string;
  registration_ref: string;
  full_name: string;
  email: string;
  phone: string | null;
  visitor_category: string;
  institution: string | null;
  student_class: string | null;
  designation: string | null;
  days_attending: string | null;
  created_at: string;
}

interface IssuedPassView {
  registrationRef: string;
  ticketRef: string;
  qrToken?: string;
  fullName: string;
  email: string;
  phone?: string;
  institution?: string;
  subtitle: string;
  daysAttending: string;
}

export default function RegistrationDeskVisitor() {
  const { hasPermission } = useAuth();
  const canCreateVisitor = hasPermission("visitor:create");
  const canIssueTicket = hasPermission("tickets:manage");
  const submitLockRef = useRef(false);

  const [portalLoading, setPortalLoading] = useState(true);
  const [visitorControl, setVisitorControl] = useState<RegistrationControl | null>(null);

  // Walk-in form state
  const [categoryId, setCategoryId] = useState<VisitorCategoryId>("student");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [studentClass, setStudentClass] = useState("");
  const [designationOption, setDesignationOption] = useState("");
  const [customDesignation, setCustomDesignation] = useState("");
  const [institution, setInstitution] = useState("");
  const [daysAttending, setDaysAttending] = useState("Both");
  const [consent, setConsent] = useState(true);
  const [promoConsent, setPromoConsent] = useState(false);
  const formRef = useRef<HTMLFormElement | null>(null);

  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Duplicate warning & Issued pass state
  const [duplicateMatch, setDuplicateMatch] = useState<ExistingVisitorMatch | null>(null);
  const [issuedPass, setIssuedPass] = useState<IssuedPassView | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState("");
  const [passModalOpen, setPassModalOpen] = useState(false);
  const [copiedRef, setCopiedRef] = useState(false);
  const [downloadingPdf, setDownloadingPdf] = useState(false);

  const loadVisitorControl = useCallback(async () => {
    setPortalLoading(true);
    try {
      const { data } = await supabase
        .from("registration_controls")
        .select("*")
        .eq("form_type", "visitor")
        .limit(1);
      if (Array.isArray(data) && data.length > 0) {
        setVisitorControl(data[0] as RegistrationControl);
      }
    } finally {
      setPortalLoading(false);
    }
  }, []);

  useEffect(() => {
    loadVisitorControl();
  }, [loadVisitorControl]);

  useEffect(() => {
    if (!issuedPass?.ticketRef) {
      setQrDataUrl("");
      return;
    }
    let active = true;
    const payload = buildTicketQrContent(issuedPass.ticketRef, issuedPass.qrToken);
    QRCode.toDataURL(payload, {
      errorCorrectionLevel: "H",
      margin: 1,
      width: 280,
      color: { dark: "#0B1120", light: "#FFFFFF" },
    })
      .then((url) => {
        if (active) setQrDataUrl(url);
      })
      .catch(() => {
        if (active) setQrDataUrl("");
      });
    return () => {
      active = false;
    };
  }, [issuedPass]);

  const portalClosed = (() => {
    if (!visitorControl) return false;
    const now = new Date();
    if (!visitorControl.is_open) return true;
    if (visitorControl.opens_at && now < new Date(visitorControl.opens_at)) return true;
    if (visitorControl.closes_at && now > new Date(visitorControl.closes_at)) return true;
    return false;
  })();

  const clearError = (key: string) => {
    setFieldErrors((prev) => {
      if (!prev[key]) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
  };

  const focusFirstInvalidControl = () => {
    window.requestAnimationFrame(() => {
      const root = formRef.current;
      if (!root) return;
      const target =
        root.querySelector<HTMLElement>('[aria-invalid="true"]') ||
        root.querySelector<HTMLElement>('[role="alert"]');
      if (target) {
        target.scrollIntoView({ behavior: "smooth", block: "center" });
        if (typeof (target as any).focus === "function" && target.tagName !== "P" && target.tagName !== "DIV") {
          target.focus({ preventScroll: true });
        }
      }
    });
  };

  const resetForNextVisitor = () => {
    setFullName("");
    setEmail("");
    setPhone("");
    setStudentClass("");
    setDesignationOption("");
    setCustomDesignation("");
    setInstitution("");
    setDaysAttending("Both");
    setConsent(true);
    setPromoConsent(false);
    setFieldErrors({});
    setSubmitError(null);
    setDuplicateMatch(null);
    setIssuedPass(null);
    setQrDataUrl("");
  };

  const openExistingVisitorPass = async (match: ExistingVisitorMatch) => {
    setIsSubmitting(true);
    setSubmitError(null);
    try {
      let ticket: TicketRecord | null = await fetchTicketByRegistration("visitor", match.id);
      if (!ticket && canIssueTicket) {
        const res = await issueTicketForRegistration("visitor", match.id);
        if (res.ok && res.ticket) {
          ticket = res.ticket;
        }
      }
      const subtitle = buildVisitorDisplaySubtitle({
        visitorCategory: match.visitor_category,
        studentClass: match.student_class,
        designation: match.designation,
      });
      setIssuedPass({
        registrationRef: match.registration_ref,
        ticketRef: ticket?.ticket_ref || match.registration_ref,
        qrToken: ticket?.qr_token,
        fullName: match.full_name,
        email: match.email,
        phone: match.phone || undefined,
        institution: match.institution || undefined,
        subtitle,
        daysAttending: match.days_attending || "Both",
      });
      setDuplicateMatch(null);
    } catch (err: any) {
      setSubmitError(err?.message || "Failed to load existing visitor ticket.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canCreateVisitor || submitLockRef.current || isSubmitting || portalClosed) return;

    const errors = validateVisitorFormFields({
      categoryId,
      fullName,
      email,
      phone,
      studentClass,
      designationOption,
      customDesignation,
      institution,
    });

    if (!consent) {
      errors.consent = "Visitor consent is required before issuing a pass.";
    }

    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      setSubmitError(Object.values(errors)[0] || "Please check the required fields.");
      focusFirstInvalidControl();
      return;
    }

    submitLockRef.current = true;
    setIsSubmitting(true);
    setSubmitError(null);
    setFieldErrors({});
    setDuplicateMatch(null);

    const cleanEmail = email.trim().toLowerCase();

    try {
      // Duplicate prevention check against existing visitor records
      const { data: existingRows, error: dupErr } = await supabase
        .from("visitor_registrations")
        .select(
          "id, registration_ref, full_name, email, phone, visitor_category, institution, student_class, designation, days_attending, created_at"
        )
        .ilike("email", cleanEmail)
        .limit(1);

      if (!dupErr && Array.isArray(existingRows) && existingRows.length > 0) {
        setDuplicateMatch(existingRows[0] as ExistingVisitorMatch);
        return;
      }

      const canonicalCategory = getDbCategoryFromId(categoryId);
      const cleanName = fullName.trim();
      const cleanPhone = phone.trim();
      const cleanClass = categoryId === "student" ? studentClass.trim() : null;
      const cleanDesignation =
        categoryId === "faculty"
          ? resolveFacultyDesignationValue(designationOption, customDesignation)
          : null;
      const cleanInstitution = institution.trim() || null;
      const subtitle = buildVisitorDisplaySubtitle({
        visitorCategory: canonicalCategory,
        studentClass: cleanClass,
        designation: cleanDesignation,
      });

      const result = await submitVisitorAndIssueTicket({
        fullName: cleanName,
        email: cleanEmail,
        phone: cleanPhone,
        institution: cleanInstitution,
        visitorCategory: canonicalCategory,
        studentClass: cleanClass,
        designation: cleanDesignation,
        daysAttending,
        registrationSource: "walk_in",
        promoConsent,
      });

      const ticketRef = result.ticket?.ticket_ref || result.registrationRef;
      setIssuedPass({
        registrationRef: result.registrationRef,
        ticketRef,
        qrToken: result.ticket?.qr_token,
        fullName: cleanName,
        email: cleanEmail,
        phone: cleanPhone || undefined,
        institution: cleanInstitution || undefined,
        subtitle,
        daysAttending,
      });
    } catch (err: any) {
      setSubmitError(extractVisitorRegistrationError(err));
    } finally {
      setIsSubmitting(false);
      submitLockRef.current = false;
    }
  };

  const handleDownloadPdf = async () => {
    if (!issuedPass) return;
    setDownloadingPdf(true);
    try {
      await downloadTicketPdfFile({
        ticketRef: issuedPass.ticketRef,
        qrToken: issuedPass.qrToken,
        recipientName: issuedPass.fullName,
        category: issuedPass.subtitle,
        email: issuedPass.email,
        phone: issuedPass.phone,
        institution: issuedPass.institution,
        registrationType: "visitor",
        daysAttending: issuedPass.daysAttending,
      });
    } finally {
      setDownloadingPdf(false);
    }
  };

  const handleCopyRef = () => {
    if (!issuedPass) return;
    navigator.clipboard.writeText(issuedPass.ticketRef);
    setCopiedRef(true);
    window.setTimeout(() => setCopiedRef(false), 1800);
  };

  return (
    <div className="max-w-2xl mx-auto space-y-5">
      {/* Screen Header */}
      <div className="border-b border-slate-200 pb-3 print:hidden">
        <h1 className="text-2xl font-display font-bold text-slate-900 tracking-tight m-0">
          General Visitor Registration
        </h1>
        <p className="text-sm text-slate-600 mt-1 mb-0">
          Enter visitor details to issue an entry pass immediately. Fields marked * are required.
        </p>
      </div>

      {/* Permission Restriction Banner */}
      {!canCreateVisitor && (
        <div className="p-5 rounded-2xl bg-amber-50 border border-amber-200 text-amber-950 flex items-start gap-3 print:hidden">
          <Lock size={18} className="text-amber-700 shrink-0 mt-0.5" />
          <div className="text-xs sm:text-sm space-y-1">
            <p className="font-bold m-0">Visitor Registration Permission Restricted</p>
            <p className="m-0 text-amber-900">
              Your account does not currently hold the <code className="font-mono text-xs">visitor:create</code> permission. Contact a Super Admin if you need walk-in registration access restored.
            </p>
          </div>
        </div>
      )}

      {/* Closed Banner */}
      {canCreateVisitor && !portalLoading && portalClosed && (
        <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-900 flex items-start gap-3 print:hidden">
          <Lock size={18} className="text-rose-600 shrink-0 mt-0.5" />
          <div className="text-xs sm:text-sm space-y-1">
            <p className="font-bold m-0">General Visitor Registration is Currently Closed</p>
            <p className="m-0 text-rose-700">
              {visitorControl?.closed_message?.trim() ||
                "Submissions are paused by Registration Controls."}
            </p>
          </div>
        </div>
      )}

      {/* Duplicate Detection Card */}
      {duplicateMatch && !issuedPass && (
        <div className="p-5 rounded-2xl bg-amber-50 border border-amber-200 space-y-3 print:hidden">
          <div className="flex items-start gap-2.5 text-amber-900">
            <AlertCircle size={18} className="text-amber-600 shrink-0 mt-0.5" />
            <div>
              <h2 className="text-sm font-bold m-0">
                Existing Visitor Registration Found for {duplicateMatch.email}
              </h2>
              <p className="text-xs text-amber-800 mt-1 mb-0">
                <strong>{duplicateMatch.full_name}</strong> · Ref{" "}
                <span className="font-mono font-bold">{duplicateMatch.registration_ref}</span> ·
                Registered {formatIstTimestamp(duplicateMatch.created_at)}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2.5">
            <button
              type="button"
              disabled={isSubmitting}
              onClick={() => openExistingVisitorPass(duplicateMatch)}
              className="min-h-[44px] inline-flex items-center gap-2 px-4 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold cursor-pointer disabled:opacity-60"
            >
              <span>Open / Print Existing Pass</span>
            </button>
            <button
              type="button"
              onClick={() => setDuplicateMatch(null)}
              className="min-h-[44px] px-4 rounded-xl bg-white border border-amber-300 hover:bg-amber-100 text-xs font-semibold text-amber-900 cursor-pointer"
            >
              Edit Email Address
            </button>
          </div>
        </div>
      )}

      {/* Post-Submit Official Pass Screen */}
      {issuedPass ? (
        <>
          <div className="bg-white border border-slate-200 rounded-2xl p-5 sm:p-6 space-y-5 print:hidden">
            <div className="flex items-start gap-3 pb-4 border-b border-slate-200">
              <CheckCircle2 size={24} className="text-emerald-600 shrink-0 mt-0.5" />
              <div className="min-w-0">
                <p className="text-sm font-semibold text-emerald-700 m-0">
                  Pass Issued
                </p>
                <h2 className="text-xl font-display font-bold text-slate-900 m-0 mt-0.5 break-words">
                  {issuedPass.fullName}
                </h2>
                <p className="text-sm text-slate-600 mt-0.5 m-0 break-words">
                  {issuedPass.subtitle}
                  {issuedPass.institution ? ` · ${issuedPass.institution}` : ""}
                </p>
              </div>
            </div>

            <div className="flex flex-col items-center text-center gap-3 p-4 rounded-2xl bg-slate-50 border border-slate-200">
              {qrDataUrl ? (
                <img
                  src={qrDataUrl}
                  alt={`QR Pass for ${issuedPass.ticketRef}`}
                  className="w-48 h-48 mx-auto block rounded-xl bg-white p-2 border border-slate-200"
                />
              ) : (
                <div className="w-48 h-48 mx-auto flex items-center justify-center text-sm text-slate-500">
                  <RefreshCw size={18} className="animate-spin mr-2" />
                  Generating QR...
                </div>
              )}

              <div className="space-y-1">
                <span className="text-xs font-medium text-slate-500 block">
                  Registration Reference
                </span>
                <div className="flex items-center justify-center gap-2 flex-wrap">
                  <span className="font-mono text-lg font-bold text-slate-900 tabular-nums">
                    {issuedPass.ticketRef}
                  </span>
                  <button
                    type="button"
                    onClick={handleCopyRef}
                    className="min-h-[44px] inline-flex items-center gap-1.5 px-3 rounded-xl bg-white border border-slate-300 hover:bg-slate-100 text-xs font-semibold text-slate-700 cursor-pointer"
                  >
                    <Copy size={14} />
                    <span>{copiedRef ? "Copied" : "Copy"}</span>
                  </button>
                </div>
              </div>
            </div>

            <dl className="grid grid-cols-1 gap-2.5 text-sm m-0">
              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-between gap-2">
                <dt className="text-slate-500 font-medium">Attendance</dt>
                <dd className="font-semibold text-slate-900 m-0 text-right">
                  {issuedPass.daysAttending} (20–21 Nov 2026)
                </dd>
              </div>
              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-between gap-2">
                <dt className="text-slate-500 font-medium shrink-0">Email</dt>
                <dd className="text-slate-900 m-0 break-all text-right">{issuedPass.email}</dd>
              </div>
              {issuedPass.phone && (
                <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-between gap-2">
                  <dt className="text-slate-500 font-medium">Phone</dt>
                  <dd className="font-mono text-slate-900 m-0 text-right">{issuedPass.phone}</dd>
                </div>
              )}
            </dl>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
              <button
                type="button"
                onClick={() => setPassModalOpen(true)}
                className="min-h-[48px] w-full inline-flex items-center justify-center gap-2 px-5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-base font-semibold cursor-pointer"
              >
                <Eye size={18} />
                <span>View Pass</span>
              </button>

              <button
                type="button"
                disabled={downloadingPdf}
                onClick={handleDownloadPdf}
                className="min-h-[48px] w-full inline-flex items-center justify-center gap-2 px-5 rounded-xl bg-[#D5F542] hover:bg-[#c6e830] text-[#0B1120] text-base font-bold cursor-pointer disabled:opacity-60"
              >
                <Download size={18} />
                <span>{downloadingPdf ? "Preparing PDF..." : "Download PDF"}</span>
              </button>

              <button
                type="button"
                onClick={resetForNextVisitor}
                className="min-h-[48px] w-full sm:col-span-2 inline-flex items-center justify-center gap-2 px-5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-base font-semibold cursor-pointer"
              >
                <UserPlus size={18} />
                <span>Register Next Visitor</span>
              </button>

              <button
                type="button"
                onClick={() => window.print()}
                className="min-h-[44px] w-full sm:col-span-2 inline-flex items-center justify-center gap-2 px-5 rounded-xl bg-white border border-slate-300 hover:bg-slate-50 text-slate-800 text-sm font-semibold cursor-pointer"
              >
                <Printer size={16} />
                <span>Print Pass</span>
              </button>
            </div>
          </div>

          <TicketPassModal
            isOpen={passModalOpen}
            onClose={() => setPassModalOpen(false)}
            ticketRef={issuedPass.ticketRef}
            qrToken={issuedPass.qrToken}
            registrationCategory="visitor"
            displayName={issuedPass.fullName}
            subtitle={issuedPass.subtitle}
            institution={issuedPass.institution}
            email={issuedPass.email}
            phone={issuedPass.phone}
            daysAttending={issuedPass.daysAttending}
          />

          {/* Dedicated Print-Only Visitor Pass Sheet */}
          <section
            aria-label="Printable Visitor Pass"
            className="hidden print:block p-8 border-2 border-slate-900 rounded-xl bg-white text-slate-900 max-w-xl mx-auto"
          >
            <div className="border-b-2 border-slate-900 pb-4 mb-5 flex items-center justify-between">
              <div>
                <p className="text-xs font-mono uppercase tracking-widest m-0">
                  SUPERNOVA 3.0 · OFFICIAL WALK-IN PASS
                </p>
                <h2 className="text-2xl font-bold m-0 mt-1">{issuedPass.fullName}</h2>
                <p className="text-sm m-0 mt-0.5">{issuedPass.subtitle}</p>
              </div>
              <div className="text-right font-mono">
                <p className="text-xs uppercase m-0">Ticket Ref</p>
                <p className="text-lg font-bold m-0">{issuedPass.ticketRef}</p>
              </div>
            </div>
            <div className="flex items-center justify-between gap-6">
              <div className="space-y-2 text-sm">
                <p className="m-0">
                  <strong>Venue:</strong> The National College, Basavanagudi, Bengaluru – 04
                </p>
                <p className="m-0">
                  <strong>Dates:</strong> 20–21 November 2026 ({issuedPass.daysAttending})
                </p>
                {issuedPass.institution && (
                  <p className="m-0">
                    <strong>Institution:</strong> {issuedPass.institution}
                  </p>
                )}
                <p className="m-0">
                  <strong>Registration Ref:</strong> {issuedPass.registrationRef}
                </p>
              </div>
              {qrDataUrl && (
                <div className="text-center shrink-0">
                  <img src={qrDataUrl} alt={issuedPass.ticketRef} className="w-36 h-36 border border-slate-300" />
                  <p className="text-[10px] font-mono mt-1 m-0">SCAN AT GATE ENTRY</p>
                </div>
              )}
            </div>
          </section>
        </>
      ) : !canCreateVisitor ? null : (
        /* Walk-In Registration Form */
        <form
          ref={formRef}
          onSubmit={handleSubmit}
          noValidate
          className="bg-white border border-slate-200 rounded-2xl p-5 sm:p-6 space-y-5 print:hidden"
        >
          {/* Step 1: Visitor Category */}
          <div>
            <span className="text-sm font-semibold text-slate-800 block mb-2.5">
              Visitor Category *
            </span>
            <div className="grid grid-cols-1 gap-2.5">
              {VISITOR_CATEGORY_CARDS.map((card) => {
                const selected = categoryId === card.id;
                return (
                  <button
                    key={card.id}
                    type="button"
                    disabled={portalClosed || isSubmitting}
                    onClick={() => {
                      setCategoryId(card.id);
                      clearError("category");
                      clearError("studentClass");
                      clearError("designationOption");
                      clearError("customDesignation");
                      clearError("institution");
                    }}
                    className={`text-left p-4 rounded-xl border transition-colors min-h-[60px] cursor-pointer disabled:opacity-60 ${
                      selected
                        ? "border-blue-600 bg-blue-50 text-slate-900"
                        : "border-slate-200 bg-white hover:bg-slate-50 text-slate-700"
                    }`}
                  >
                    <span className="text-sm font-bold block">{card.title}</span>
                    <span className="text-xs text-slate-600 block mt-0.5 leading-snug">
                      {card.shortDescription}
                    </span>
                  </button>
                );
              })}
            </div>
            {fieldErrors.category && (
              <p role="alert" className="text-sm text-rose-600 mt-1.5 m-0">{fieldErrors.category}</p>
            )}
          </div>

          {/* Step 2: Attendee Details (Single Column Mobile-First) */}
          <div className="grid grid-cols-1 gap-4">
            <div>
              <label htmlFor="desk-vis-name" className="text-sm font-semibold text-slate-800 block mb-1.5">
                Full Name *
              </label>
              <input
                id="desk-vis-name"
                type="text"
                autoComplete="name"
                required
                aria-invalid={Boolean(fieldErrors.fullName)}
                disabled={portalClosed || isSubmitting}
                value={fullName}
                onChange={(e) => {
                  setFullName(e.target.value);
                  clearError("fullName");
                }}
                placeholder="Enter visitor full name"
                className={`w-full h-12 px-4 rounded-xl border bg-white text-base text-slate-900 focus:outline-hidden focus:border-blue-600 ${
                  fieldErrors.fullName ? "border-rose-500" : "border-slate-300"
                }`}
              />
              {fieldErrors.fullName && (
                <p role="alert" className="text-sm text-rose-600 mt-1 m-0">{fieldErrors.fullName}</p>
              )}
            </div>

            <div>
              <label htmlFor="desk-vis-email" className="text-sm font-semibold text-slate-800 block mb-1.5">
                Email Address *
              </label>
              <input
                id="desk-vis-email"
                type="email"
                inputMode="email"
                autoCapitalize="none"
                autoComplete="email"
                required
                aria-invalid={Boolean(fieldErrors.email)}
                disabled={portalClosed || isSubmitting}
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  clearError("email");
                }}
                placeholder="visitor@example.com"
                className={`w-full h-12 px-4 rounded-xl border bg-white text-base text-slate-900 focus:outline-hidden focus:border-blue-600 ${
                  fieldErrors.email ? "border-rose-500" : "border-slate-300"
                }`}
              />
              {fieldErrors.email && (
                <p role="alert" className="text-sm text-rose-600 mt-1 m-0">{fieldErrors.email}</p>
              )}
            </div>

            <div>
              <label htmlFor="desk-vis-phone" className="text-sm font-semibold text-slate-800 block mb-1.5">
                Contact Mobile Number *
              </label>
              <input
                id="desk-vis-phone"
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                required
                aria-invalid={Boolean(fieldErrors.phone)}
                maxLength={20}
                disabled={portalClosed || isSubmitting}
                value={phone}
                onChange={(e) => {
                  setPhone(e.target.value);
                  clearError("phone");
                }}
                placeholder="e.g. 9876543210 or +91 98765 43210"
                className={`w-full h-12 px-4 rounded-xl border bg-white text-base text-slate-900 focus:outline-hidden focus:border-blue-600 ${
                  fieldErrors.phone ? "border-rose-500" : "border-slate-300"
                }`}
              />
              <p className="text-xs text-slate-500 mt-1 mb-0">
                10–15 digits required (country codes and parent or guardian mobile numbers accepted).
              </p>
              {fieldErrors.phone && (
                <p role="alert" className="text-sm text-rose-600 mt-1 m-0">{fieldErrors.phone}</p>
              )}
            </div>

            <div>
              <label htmlFor="desk-vis-days" className="text-sm font-semibold text-slate-800 block mb-1.5">
                Days Attending
              </label>
              <select
                id="desk-vis-days"
                disabled={portalClosed || isSubmitting}
                value={daysAttending}
                onChange={(e) => setDaysAttending(e.target.value)}
                className="w-full h-12 px-4 rounded-xl border border-slate-300 bg-white text-base text-slate-900 focus:outline-hidden focus:border-blue-600"
              >
                <option value="Both">Both Days (20–21 Nov 2026)</option>
                <option value="Day 1">Day 1 Only (20 Nov 2026)</option>
                <option value="Day 2">Day 2 Only (21 Nov 2026)</option>
              </select>
            </div>
          </div>

          {/* Step 3: Category-Specific Fields */}
          <div className="grid grid-cols-1 gap-4 pt-3 border-t border-slate-200">
            {categoryId === "student" && (
              <div>
                <label htmlFor="desk-vis-class" className="text-sm font-semibold text-slate-800 block mb-1.5">
                  Class / Course *
                </label>
                <input
                  id="desk-vis-class"
                  type="text"
                  required
                  aria-invalid={Boolean(fieldErrors.studentClass)}
                  disabled={portalClosed || isSubmitting}
                  value={studentClass}
                  onChange={(e) => {
                    setStudentClass(e.target.value);
                    clearError("studentClass");
                  }}
                  placeholder="e.g. 2nd PUC, BCA 2nd Year, Class 10"
                  className={`w-full h-12 px-4 rounded-xl border bg-white text-base text-slate-900 focus:outline-hidden focus:border-blue-600 ${
                    fieldErrors.studentClass ? "border-rose-500" : "border-slate-300"
                  }`}
                />
                {fieldErrors.studentClass && (
                  <p role="alert" className="text-sm text-rose-600 mt-1 m-0">{fieldErrors.studentClass}</p>
                )}
              </div>
            )}

            {categoryId === "faculty" && (
              <>
                <div>
                  <label htmlFor="desk-vis-desig" className="text-sm font-semibold text-slate-800 block mb-1.5">
                    Designation / Role *
                  </label>
                  <select
                    id="desk-vis-desig"
                    required
                    aria-invalid={Boolean(fieldErrors.designationOption)}
                    disabled={portalClosed || isSubmitting}
                    value={designationOption}
                    onChange={(e) => {
                      setDesignationOption(e.target.value);
                      clearError("designationOption");
                    }}
                    className={`w-full h-12 px-4 rounded-xl border bg-white text-base text-slate-900 focus:outline-hidden focus:border-blue-600 ${
                      fieldErrors.designationOption ? "border-rose-500" : "border-slate-300"
                    }`}
                  >
                    <option value="">Select designation...</option>
                    {FACULTY_DESIGNATION_OPTIONS.map((opt) => (
                      <option key={opt} value={opt}>
                        {opt}
                      </option>
                    ))}
                  </select>
                  {fieldErrors.designationOption && (
                    <p role="alert" className="text-sm text-rose-600 mt-1 m-0">{fieldErrors.designationOption}</p>
                  )}
                </div>

                {designationOption === "Other" && (
                  <div>
                    <label htmlFor="desk-vis-custom-desig" className="text-sm font-semibold text-slate-800 block mb-1.5">
                      Specify Designation *
                    </label>
                    <input
                      id="desk-vis-custom-desig"
                      type="text"
                      required
                      aria-invalid={Boolean(fieldErrors.customDesignation)}
                      disabled={portalClosed || isSubmitting}
                      value={customDesignation}
                      onChange={(e) => {
                        setCustomDesignation(e.target.value);
                        clearError("customDesignation");
                      }}
                      placeholder="Enter official role"
                      className={`w-full h-12 px-4 rounded-xl border bg-white text-base text-slate-900 focus:outline-hidden focus:border-blue-600 ${
                        fieldErrors.customDesignation ? "border-rose-500" : "border-slate-300"
                      }`}
                    />
                    {fieldErrors.customDesignation && (
                      <p role="alert" className="text-sm text-rose-600 mt-1 m-0">{fieldErrors.customDesignation}</p>
                    )}
                  </div>
                )}
              </>
            )}

            <div>
              <label htmlFor="desk-vis-inst" className="text-sm font-semibold text-slate-800 block mb-1.5">
                {categoryId === "general"
                  ? "Institution / Organization (Optional)"
                  : "College / Institution Name *"}
              </label>
              <input
                id="desk-vis-inst"
                type="text"
                required={categoryId !== "general"}
                aria-invalid={Boolean(fieldErrors.institution)}
                disabled={portalClosed || isSubmitting}
                value={institution}
                onChange={(e) => {
                  setInstitution(e.target.value);
                  clearError("institution");
                }}
                placeholder="School, college, or organization name"
                className={`w-full h-12 px-4 rounded-xl border bg-white text-base text-slate-900 focus:outline-hidden focus:border-blue-600 ${
                  fieldErrors.institution ? "border-rose-500" : "border-slate-300"
                }`}
              />
              {fieldErrors.institution && (
                <p role="alert" className="text-sm text-rose-600 mt-1 m-0">{fieldErrors.institution}</p>
              )}
            </div>
          </div>

          {/* Consent */}
          <div className="pt-3 border-t border-slate-200 space-y-2.5">
            <label className="flex items-start gap-3 cursor-pointer text-sm text-slate-700 min-h-[44px]">
              <input
                type="checkbox"
                aria-invalid={Boolean(fieldErrors.consent)}
                checked={consent}
                disabled={portalClosed || isSubmitting}
                onChange={(e) => {
                  setConsent(e.target.checked);
                  clearError("consent");
                }}
                className="mt-0.5 w-5 h-5 accent-blue-600 rounded shrink-0"
              />
              <span>
                Visitor details are accurate and visitor agrees to event guidelines.
              </span>
            </label>
            {fieldErrors.consent && (
              <p role="alert" className="text-sm text-rose-600 mt-1 m-0">{fieldErrors.consent}</p>
            )}

            <label className="flex items-start gap-3 cursor-pointer text-xs sm:text-sm text-slate-600 min-h-[44px]">
              <input
                type="checkbox"
                checked={promoConsent}
                disabled={portalClosed || isSubmitting}
                onChange={(e) => setPromoConsent(e.target.checked)}
                className="mt-0.5 w-5 h-5 accent-blue-600 rounded shrink-0"
              />
              <span>
                Optional: Visitor consents to receive future fest &amp; institutional program updates.
              </span>
            </label>
          </div>

          {submitError && (
            <div role="alert" className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-sm text-rose-800 font-medium flex items-start gap-2.5">
              <AlertCircle size={18} className="shrink-0 mt-0.5 text-rose-600" />
              <span>{submitError}</span>
            </div>
          )}

          <div className="pt-1">
            <button
              type="submit"
              disabled={portalClosed || isSubmitting}
              className="min-h-[48px] w-full px-6 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-base font-semibold inline-flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
            >
              {isSubmitting ? (
                <>
                  <RefreshCw size={18} className="animate-spin" />
                  <span>Issuing Pass...</span>
                </>
              ) : (
                <>
                  <UserPlus size={18} />
                  <span>Complete Registration & Issue Pass</span>
                </>
              )}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
