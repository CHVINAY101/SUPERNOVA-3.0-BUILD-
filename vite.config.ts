import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath, URL } from "node:url";

const rootDir = fileURLToPath(new URL(".", import.meta.url));
const srcDir = fileURLToPath(new URL("./src", import.meta.url));
const PLACEHOLDER_ENV_RE = /(?:your-project|your-key|your-anon-key|your-publishable-key|placeholder|example\.supabase\.co)/i;

function isValidSupabaseHttpUrl(val: string | undefined): val is string {
  if (!val) return false;
  const trimmed = val.trim();
  if (!trimmed || PLACEHOLDER_RE_CHECK(trimmed)) return false;
  try {
    const parsed = new URL(trimmed);
    return (parsed.protocol === "http:" || parsed.protocol === "https:") && Boolean(parsed.hostname);
  } catch {
    return false;
  }
}

function PLACEHOLDER_RE_CHECK(val: string): boolean {
  return PLACEHOLDER_ENV_RE.test(val) || val.includes("<") || val.includes(">");
}

function isValidBrowserSupabaseKey(val: string | undefined): val is string {
  if (!val) return false;
  const trimmed = val.trim();
  if (!trimmed || trimmed.length < 20 || PLACEHOLDER_RE_CHECK(trimmed)) return false;
  if (trimmed.startsWith("sb_secret_")) return false;
  if (trimmed.startsWith("sb_publishable_")) {
    return /^sb_publishable_[A-Za-z0-9_-]{10,}$/.test(trimmed);
  }
  if (trimmed.startsWith("eyJ")) {
    return /^eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(trimmed);
  }
  return trimmed.length >= 24;
}

function resolveContainerViteEnv(mode: string): void {
  const managedKeys = [
    "VITE_SUPABASE_URL",
    "VITE_SUPABASE_PUBLISHABLE_KEY",
    "VITE_SUPABASE_ANON_KEY",
    "VITE_USE_MOCK",
  ] as const;

  const savedProcessValues: Record<string, string | undefined> = {};

  for (const key of managedKeys) {
    if (key in process.env) {
      savedProcessValues[key] = process.env[key];
      delete process.env[key];
    }
  }

  for (const [key, val] of Object.entries(process.env)) {
    if (!key.startsWith("VITE_")) continue;
    if (!val || PLACEHOLDER_RE_CHECK(val)) {
      delete process.env[key];
    }
  }

  // Load .env / .env.[mode] cleanly without stale or corrupted container process.env overrides
  const fileEnv = loadEnv(mode, rootDir, "VITE_");

  const resolvedUrl = isValidSupabaseHttpUrl(fileEnv.VITE_SUPABASE_URL)
    ? fileEnv.VITE_SUPABASE_URL.trim()
    : isValidSupabaseHttpUrl(savedProcessValues.VITE_SUPABASE_URL)
    ? savedProcessValues.VITE_SUPABASE_URL.trim()
    : isValidSupabaseHttpUrl(process.env.SUPABASE_URL)
    ? process.env.SUPABASE_URL.trim()
    : undefined;

  if (resolvedUrl) {
    process.env.VITE_SUPABASE_URL = resolvedUrl;
  }

  const resolvedPublishableKey = isValidBrowserSupabaseKey(fileEnv.VITE_SUPABASE_PUBLISHABLE_KEY)
    ? fileEnv.VITE_SUPABASE_PUBLISHABLE_KEY.trim()
    : isValidBrowserSupabaseKey(savedProcessValues.VITE_SUPABASE_PUBLISHABLE_KEY)
    ? savedProcessValues.VITE_SUPABASE_PUBLISHABLE_KEY.trim()
    : isValidBrowserSupabaseKey(process.env.SUPABASE_PUBLISHABLE_KEY)
    ? process.env.SUPABASE_PUBLISHABLE_KEY.trim()
    : undefined;

  if (resolvedPublishableKey) {
    process.env.VITE_SUPABASE_PUBLISHABLE_KEY = resolvedPublishableKey;
  }

  const resolvedAnonKey = isValidBrowserSupabaseKey(fileEnv.VITE_SUPABASE_ANON_KEY)
    ? fileEnv.VITE_SUPABASE_ANON_KEY.trim()
    : isValidBrowserSupabaseKey(savedProcessValues.VITE_SUPABASE_ANON_KEY)
    ? savedProcessValues.VITE_SUPABASE_ANON_KEY.trim()
    : undefined;

  if (resolvedAnonKey) {
    process.env.VITE_SUPABASE_ANON_KEY = resolvedAnonKey;
  }

  const fileMock = (fileEnv.VITE_USE_MOCK || "").trim().toLowerCase();
  const procMock = (savedProcessValues.VITE_USE_MOCK || "").trim().toLowerCase();
  if (fileMock === "true" || fileMock === "false") {
    process.env.VITE_USE_MOCK = fileMock;
  } else if (procMock === "true" || procMock === "false") {
    process.env.VITE_USE_MOCK = procMock;
  } else {
    process.env.VITE_USE_MOCK = "false";
  }
}

const TRUSTED_ALLOWED_HOSTS = [
  "ais-dev-5tohkryzefthou5qsf4ikc-441356495771.asia-east1.run.app",
  "ais-pre-5tohkryzefthou5qsf4ikc-441356495771.asia-east1.run.app",
  "ais-dev-gtvpgyx77kg4dppd2w2lyu-799227307816.asia-northeast1.run.app",
  "ais-pre-gtvpgyx77kg4dppd2w2lyu-799227307816.asia-northeast1.run.app",
  "localhost",
  "127.0.0.1",
];

export default defineConfig(({ mode }) => {
  resolveContainerViteEnv(mode);

  return {
    root: rootDir,
    envDir: rootDir,
    envPrefix: "VITE_",
    plugins: [react()],
    server: {
      host: "0.0.0.0",
      port: 3000,
      allowedHosts: TRUSTED_ALLOWED_HOSTS,
      hmr: false,
    },
    preview: {
      host: "0.0.0.0",
      port: 3000,
      allowedHosts: TRUSTED_ALLOWED_HOSTS,
    },
    resolve: {
      alias: {
        "@": srcDir,
      },
    },
  };
});
