import { useState, useEffect, useCallback } from "react";
import { CONFIG } from "../config.ts";

export type CountdownState = "BEFORE" | "LIVE" | "AFTER";

export interface TimeBreakdown {
  days: number;
  hours: number;
  mins: number;
  secs: number;
  isZero: boolean;
}

export interface CountdownData {
  state: CountdownState;
  days: number;
  hours: number;
  mins: number;
  secs: number;
  daysStr: string;
  hoursStr: string;
  minsStr: string;
  secsStr: string;
  liveDay: "DAY 1" | "DAY 2";
  accessibleText: string;
}

/**
 * Pure calculation for time remaining until target timestamp.
 * Deterministic, unit-testable, handles negative/past values safely.
 */
export function calculateTimeRemaining(
  targetTimestampMs: number,
  currentTimestampMs: number
): TimeBreakdown {
  const diff = Math.max(0, targetTimestampMs - currentTimestampMs);
  const totalSeconds = Math.floor(diff / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const mins = Math.floor((totalSeconds % 3600) / 60);
  const secs = totalSeconds % 60;

  return {
    days,
    hours,
    mins,
    secs,
    isZero: diff === 0,
  };
}

function getNowTimestamp(): number {
  if (CONFIG.DEBUG) {
    try {
      const search =
        typeof window !== "undefined" && window.location
          ? window.location.search
          : (globalThis as any).window?.location?.search || "";
      if (search) {
        const params = new URLSearchParams(search);
        const nowParam = params.get("now");
        if (nowParam) {
          const normalized = nowParam.includes(" ") ? nowParam.replace(" ", "+") : nowParam;
          const parsed = Date.parse(normalized);
          if (!isNaN(parsed)) return parsed;
        }
      }
    } catch {
      // ignore
    }
  }
  return Date.now();
}

export function computeCountdown(nowMs?: number): CountdownData {
  const now = typeof nowMs === "number" ? nowMs : getNowTimestamp();
  const startMs = Date.parse(CONFIG.EVENT_START);
  const endMs = Date.parse(CONFIG.EVENT_END);

  if (now > endMs) {
    return {
      state: "AFTER",
      days: 0,
      hours: 0,
      mins: 0,
      secs: 0,
      daysStr: "00",
      hoursStr: "00",
      minsStr: "00",
      secsStr: "00",
      liveDay: "DAY 2",
      accessibleText: "SUPERNOVA 3.0 has concluded. Thank you for participating.",
    };
  }

  if (now >= startMs && now <= endMs) {
    // Determine Day 1 or Day 2 based on IST (Asia/Kolkata)
    const istFormatter = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Kolkata",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    const istDate = istFormatter.format(new Date(now));
    const liveDay = istDate.endsWith("21") ? "DAY 2" : "DAY 1";

    return {
      state: "LIVE",
      days: 0,
      hours: 0,
      mins: 0,
      secs: 0,
      daysStr: "00",
      hoursStr: "00",
      minsStr: "00",
      secsStr: "00",
      liveDay,
      accessibleText: `SUPERNOVA 3.0 IS LIVE! (${liveDay})`,
    };
  }

  // BEFORE
  const { days, hours, mins, secs } = calculateTimeRemaining(startMs, now);
  const daysStr = String(days).padStart(2, "0");
  const hoursStr = String(hours).padStart(2, "0");
  const minsStr = String(mins).padStart(2, "0");
  const secsStr = String(secs).padStart(2, "0");

  const accessibleText = `${days} days, ${hours} hours, ${mins} minutes, ${secs} seconds until SUPERNOVA 3.0 starts`;

  return {
    state: "BEFORE",
    days,
    hours,
    mins,
    secs,
    daysStr,
    hoursStr,
    minsStr,
    secsStr,
    liveDay: "DAY 1",
    accessibleText,
  };
}

export function useCountdown(): CountdownData {
  const [data, setData] = useState<CountdownData>(() => computeCountdown());

  const update = useCallback(() => {
    setData(computeCountdown());
  }, []);

  useEffect(() => {
    update();

    // Exact single-interval timer ticking every second
    const interval = setInterval(update, 1000);

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        update();
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [update]);

  return data;
}
