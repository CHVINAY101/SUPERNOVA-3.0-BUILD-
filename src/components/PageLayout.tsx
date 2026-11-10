import type { ReactNode } from "react";

interface PageHeroProps { title: string; subtitle?: string; badge?: string; badgeVariant?: "cyan" | "violet" | "neutral"; }
export function PageHero({ title, subtitle, badge, badgeVariant = "cyan" }: PageHeroProps) {
  return <section className="page-hero"><div className="container">{badge && <span className={`badge badge-${badgeVariant}`} style={{ marginBottom: 24 }}>{badge}</span>}<h1 style={{ maxWidth: 900, fontSize: "clamp(3.1rem, 8vw, 7rem)" }}>{title}</h1>{subtitle && <p style={{ maxWidth: 600, marginTop: 28, color: "var(--ink-soft)", fontSize: "clamp(1rem, 2vw, 1.18rem)" }}>{subtitle}</p>}</div></section>;
}

interface PageSectionProps { children: ReactNode; title?: string; subtitle?: string; id?: string; className?: string; }
export function PageSection({ children, title, subtitle, id, className = "" }: PageSectionProps) {
  return <section className={`section ${className}`} id={id}><div className="container">{title && <h2 className="section-title">{title}</h2>}{subtitle && <p className="section-subtitle">{subtitle}</p>}{children}</div></section>;
}

export function ContentBlock({ title, body }: { title: string; body: string | null }) { return <article className="card" style={{ marginBottom: 16 }}><h3 style={{ marginBottom: 16, fontSize: "1.5rem" }}>{title}</h3>{body ? <p style={{ color: "var(--ink-soft)", whiteSpace: "pre-wrap" }}>{body}</p> : <p className="tbd">Content to be announced.</p>}</article>; }
export function LoadingBlock() { return <div style={{ padding: 72 }}><div className="loading-spinner" /></div>; }
export function EmptyState({ title, message }: { title: string; message?: string }) { return <div className="empty-state"><h3>{title}</h3>{message && <p>{message}</p>}</div>; }
