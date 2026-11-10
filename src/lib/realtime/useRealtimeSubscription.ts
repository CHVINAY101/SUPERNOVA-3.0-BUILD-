import { useEffect, useState, useRef, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import type { RealtimeChannel, RealtimePostgresChangesPayload } from "@supabase/supabase-js";

export type ConnectionState = "CONNECTED" | "CONNECTING" | "RECONNECTING" | "DISCONNECTED" | "ERROR";

export interface RealtimeSubscriptionConfig {
  table: string;
  schema?: string;
  event?: "INSERT" | "UPDATE" | "DELETE" | "*";
  filter?: string;
  onPayload?: (payload: RealtimePostgresChangesPayload<any>) => void;
  onRefresh?: () => void | Promise<void>;
}

export interface UseRealtimeResult {
  connectionState: ConnectionState;
  lastEventTime: Date | null;
  reconnectCount: number;
}

/**
 * Custom React hook for robust, centralized Supabase Realtime subscriptions.
 * - Manages single or multiple table changes
 * - Handles auto-reconnect and invokes onRefresh on recovery
 * - Prevents memory leaks by cleaning up channel on component unmount
 * - Debounces rapid-fire payload bursts
 */
export function useRealtimeSubscription(
  configs: RealtimeSubscriptionConfig | RealtimeSubscriptionConfig[],
  channelNamePrefix = "sn3-realtime"
): UseRealtimeResult {
  const [connectionState, setConnectionState] = useState<ConnectionState>("CONNECTING");
  const [lastEventTime, setLastEventTime] = useState<Date | null>(null);
  const [reconnectCount, setReconnectCount] = useState<number>(0);

  const configsRef = useRef(configs);
  configsRef.current = configs;

  const refreshDebounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const triggerDebouncedRefresh = useCallback(() => {
    if (refreshDebounceTimerRef.current) {
      clearTimeout(refreshDebounceTimerRef.current);
    }
    refreshDebounceTimerRef.current = setTimeout(() => {
      const currentConfigs = Array.isArray(configsRef.current)
        ? configsRef.current
        : [configsRef.current];

      currentConfigs.forEach((c) => {
        if (c.onRefresh) {
          try {
            c.onRefresh();
          } catch (err) {
            console.warn("[Realtime] Error executing onRefresh callback:", err);
          }
        }
      });
    }, 250); // 250ms debounce window
  }, []);

  useEffect(() => {
    let isMounted = true;
    const configArray = Array.isArray(configsRef.current)
      ? configsRef.current
      : [configsRef.current];

    if (configArray.length === 0) {
      setConnectionState("DISCONNECTED");
      return;
    }

    const uniqueChannelName = `${channelNamePrefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const channel: RealtimeChannel = supabase.channel(uniqueChannelName);

    configArray.forEach((config) => {
      const { table, schema = "public", event = "*", filter, onPayload } = config;

      const filterOptions: any = {
        event,
        schema,
        table,
      };

      if (filter) {
        filterOptions.filter = filter;
      }

      channel.on("postgres_changes", filterOptions, (payload: RealtimePostgresChangesPayload<any>) => {
        if (!isMounted) return;
        setLastEventTime(new Date());

        if (onPayload) {
          try {
            onPayload(payload);
          } catch (err) {
            console.warn(`[Realtime] Error handling payload for ${table}:`, err);
          }
        }

        // Always trigger refresh if registered
        triggerDebouncedRefresh();
      });
    });

    channel.subscribe((status, err) => {
      if (!isMounted) return;

      if (status === "SUBSCRIBED") {
        setConnectionState("CONNECTED");
      } else if (status === "CHANNEL_ERROR") {
        console.warn(`[Realtime] Subscription error on ${uniqueChannelName}:`, err);
        setConnectionState("ERROR");
      } else if (status === "TIMED_OUT") {
        setConnectionState("RECONNECTING");
        setReconnectCount((prev) => prev + 1);
      } else if (status === "CLOSED") {
        setConnectionState("DISCONNECTED");
      }
    });

    // Reconnection listener on browser online/offline
    const handleOnline = () => {
      if (!isMounted) return;
      setConnectionState("RECONNECTING");
      triggerDebouncedRefresh();
    };

    window.addEventListener("online", handleOnline);

    return () => {
      isMounted = false;
      window.removeEventListener("online", handleOnline);
      if (refreshDebounceTimerRef.current) {
        clearTimeout(refreshDebounceTimerRef.current);
      }
      supabase.removeChannel(channel).catch((err) => {
        console.warn(`[Realtime] Error tearing down channel ${uniqueChannelName}:`, err);
      });
    };
  }, [channelNamePrefix, triggerDebouncedRefresh]);

  return {
    connectionState,
    lastEventTime,
    reconnectCount,
  };
}
