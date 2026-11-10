import { PageHero, PageSection, ContentBlock, LoadingBlock } from "@/components/PageLayout";
import { useSiteContent } from "@/hooks/useSiteContent";
import type { ReactNode } from "react";

interface ContentPageProps {
  section: string;
  badge: string;
  badgeVariant?: "cyan" | "violet" | "neutral";
  title: string;
  subtitle: string;
  extraContent?: ReactNode;
}

export function ContentPage({ section, badge, badgeVariant = "cyan", title, subtitle, extraContent }: ContentPageProps) {
  const { content, loading } = useSiteContent(section);

  return (
    <div>
      <PageHero title={title} subtitle={subtitle} badge={badge} badgeVariant={badgeVariant} />
      <PageSection>
        {loading ? (
          <LoadingBlock />
        ) : content.length > 0 ? (
          content.map((item) => <ContentBlock key={item.id} title={item.title} body={item.body} />)
        ) : (
          <div className="card" style={{ textAlign: "center", padding: "var(--space-12)" }}>
            <p className="tbd" style={{ fontSize: "1.05rem" }}>Content to be announced. Please check back soon.</p>
          </div>
        )}
      </PageSection>
      {extraContent}
    </div>
  );
}

export function SettingsRow({ label, value }: { label: string; value: string | null }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "var(--space-3) 0", borderBottom: "1px solid var(--border-subtle)" }}>
      <span style={{ color: "var(--text-muted)", fontSize: "0.9rem" }}>{label}</span>
      <span style={{ color: value ? "var(--text-primary)" : "var(--text-faint)", fontStyle: value ? "normal" : "italic", fontSize: "0.9rem" }}>
        {value || "To be announced"}
      </span>
    </div>
  );
}

export { PageHero, PageSection, ContentBlock, LoadingBlock };
