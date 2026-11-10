import type { ReactNode } from "react";

export function StepIndicator({ steps, current }: { steps: string[]; current: number }) {
  return (
    <ol aria-label="Registration progress" style={{ display: "flex", gap: 8, flexWrap: "wrap", listStyle: "none", padding: 0, margin: "0 0 32px" }}>
      {steps.map((label, index) => {
        const active = index === current;
        const done = index < current;
        return (
          <li key={label} aria-current={active ? "step" : undefined} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", borderRadius: 999, border: "1px solid var(--line)", background: active ? "var(--ink)" : "transparent", color: active ? "var(--paper)" : done ? "var(--ink)" : "var(--ink-muted)", fontSize: ".78rem", fontWeight: 600 }}>
            <span>{index + 1}</span>
            {label}
          </li>
        );
      })}
    </ol>
  );
}

export function Field({ label, error, children }: { label: string; error?: string; children: ReactNode }) {
  return (
    <label style={{ display: "grid", gap: 8 }}>
      <span className="label">{label}</span>
      {children}
      {error && <span role="alert" style={{ color: "#b42318", fontSize: ".8rem" }}>{error}</span>}
    </label>
  );
}

export function ReviewRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "180px 1fr", gap: 16, padding: "12px 0", borderBottom: "1px solid var(--line-soft)" }}>
      <span style={{ color: "var(--ink-muted)", fontSize: ".84rem" }}>{label}</span>
      <span style={{ fontWeight: 600, overflowWrap: "anywhere" }}>{value || "Not provided"}</span>
    </div>
  );
}

export function ConfirmationCard({ reference, title, children }: { reference: string; title: string; children: ReactNode }) {
  return (
    <div className="card" style={{ padding: 40, textAlign: "center" }}>
      <p style={{ color: "var(--sky-deep)", fontSize: ".78rem", fontWeight: 700, letterSpacing: ".12em", textTransform: "uppercase" }}>Submission received</p>
      <h2 style={{ margin: "12px 0 16px", fontSize: "clamp(1.8rem, 4vw, 2.6rem)" }}>{title}</h2>
      <p style={{ color: "var(--ink-soft)", marginBottom: 24 }}>Your registration reference</p>
      <p style={{ display: "inline-block", padding: "14px 22px", border: "1px dashed var(--ink)", borderRadius: 12, fontSize: "1.4rem", fontWeight: 700, letterSpacing: ".08em" }}>{reference}</p>
      <div style={{ marginTop: 24, color: "var(--ink-soft)", textAlign: "left" }}>{children}</div>
    </div>
  );
}

export function SubmitError({ message }: { message: string | null }) {
  if (!message) return null;
  return <p role="alert" style={{ marginTop: 16, padding: "12px 16px", borderRadius: 10, border: "1px solid #b42318", color: "#b42318", background: "#fff4f2", fontSize: ".9rem" }}>{message}</p>;
}
