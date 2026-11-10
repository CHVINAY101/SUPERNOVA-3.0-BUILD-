import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { EventSetting } from "@/types/database";

export function useEventSettings() {
  const [settings, setSettings] = useState<Record<string, string | null>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase
      .from("event_settings")
      .select("key, value")
      .eq("is_published", true)
      .then(({ data, error }) => {
        if (!error && data) {
          const map: Record<string, string | null> = {};
          (data as Pick<EventSetting, "key" | "value">[]).forEach((s) => {
            map[s.key] = s.value;
          });
          setSettings(map);
        }
        setLoading(false);
      });
  }, []);

  return { settings, loading };
}
