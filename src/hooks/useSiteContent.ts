import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { SiteContent } from "@/types/database";

export function useSiteContent(section: string) {
  const [content, setContent] = useState<SiteContent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase
      .from("site_content")
      .select("*")
      .eq("section", section)
      .eq("is_published", true)
      .order("sort_order", { ascending: true })
      .then(({ data, error }) => {
        if (!error && data) setContent(data as SiteContent[]);
        setLoading(false);
      });
  }, [section]);

  return { content, loading };
}
