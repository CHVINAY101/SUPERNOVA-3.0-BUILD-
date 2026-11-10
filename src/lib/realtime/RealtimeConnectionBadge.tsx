import React from "react";
import type { ConnectionState } from "./useRealtimeSubscription";
import { Radio, AlertCircle, RefreshCw } from "lucide-react";

interface RealtimeConnectionBadgeProps {
  state: ConnectionState;
  lastEventTime?: Date | null;
  className?: string;
  showText?: boolean;
  variant?: "dark" | "light";
}

export const RealtimeConnectionBadge: React.FC<RealtimeConnectionBadgeProps> = ({
  state,
  lastEventTime,
  className = "",
  showText = true,
  variant = "dark",
}) => {
  const getBadgeConfig = () => {
    switch (state) {
      case "CONNECTED":
        return {
          color: "#10b981", // Green
          bgColor: variant === "dark" ? "rgba(16, 185, 129, 0.15)" : "rgba(16, 185, 129, 0.1)",
          borderColor: variant === "dark" ? "rgba(16, 185, 129, 0.3)" : "#10b981",
          label: "LIVE REALTIME",
          dotClass: "animate-pulse",
          icon: Radio,
        };
      case "CONNECTING":
        return {
          color: "#38bdf8", // Sky blue
          bgColor: variant === "dark" ? "rgba(56, 189, 248, 0.15)" : "rgba(56, 189, 248, 0.1)",
          borderColor: variant === "dark" ? "rgba(56, 189, 248, 0.3)" : "#38bdf8",
          label: "CONNECTING...",
          dotClass: "animate-ping",
          icon: RefreshCw,
        };
      case "RECONNECTING":
        return {
          color: "#f59e0b", // Amber
          bgColor: variant === "dark" ? "rgba(245, 158, 11, 0.15)" : "rgba(245, 158, 11, 0.1)",
          borderColor: variant === "dark" ? "rgba(245, 158, 11, 0.3)" : "#f59e0b",
          label: "RECONNECTING...",
          dotClass: "animate-spin",
          icon: RefreshCw,
        };
      case "ERROR":
        return {
          color: "#ef4444", // Red
          bgColor: variant === "dark" ? "rgba(239, 68, 68, 0.15)" : "rgba(239, 68, 68, 0.1)",
          borderColor: variant === "dark" ? "rgba(239, 68, 68, 0.3)" : "#ef4444",
          label: "CONNECTION ERROR",
          dotClass: "",
          icon: AlertCircle,
        };
      case "DISCONNECTED":
      default:
        return {
          color: "#94a3b8", // Slate
          bgColor: variant === "dark" ? "rgba(148, 163, 184, 0.15)" : "rgba(148, 163, 184, 0.1)",
          borderColor: variant === "dark" ? "rgba(148, 163, 184, 0.3)" : "#94a3b8",
          label: "OFFLINE",
          dotClass: "",
          icon: Radio,
        };
    }
  };

  const config = getBadgeConfig();
  const IconComponent = config.icon;

  return (
    <div
      className={`inline-flex items-center gap-2 px-2.5 py-1 rounded-full text-[11px] font-mono font-bold tracking-wider select-none ${className}`}
      style={{
        backgroundColor: config.bgColor,
        borderColor: config.borderColor,
        borderWidth: "1px",
        borderStyle: "solid",
        color: config.color,
      }}
      title={`Supabase Realtime Status: ${state}${
        lastEventTime ? ` · Last payload received: ${lastEventTime.toLocaleTimeString()}` : ""
      }`}
    >
      <span
        className={`w-2 h-2 rounded-full ${config.dotClass}`}
        style={{ backgroundColor: config.color }}
      />
      <IconComponent size={12} className={state === "RECONNECTING" || state === "CONNECTING" ? "animate-spin" : ""} />
      {showText && <span>{config.label}</span>}
      {lastEventTime && state === "CONNECTED" && (
        <span className="opacity-70 text-[10px] hidden sm:inline">
          · {lastEventTime.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
        </span>
      )}
    </div>
  );
};
