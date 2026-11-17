import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath, URL } from "node:url";

const rootDir = fileURLToPath(new URL(".", import.meta.url));
const srcDir = fileURLToPath(new URL("./src", import.meta.url));
const PLACEHOLDER_ENV_RE = /(?:your-project|placeholder)/i;

function resolveContainerViteEnv(mode: string): void {
  const placeholderKeys: Array<[string, string | undefined]> = [];

  for (const [key, val] of Object.entries(process.env)) {
    if (!key.startsWith("VITE_")) continue;
    if (!val || PLACEHOLDER_ENV_RE.test(val)) {
      placeholderKeys.push([key, val]);
      delete process.env[key];
    }
  }

  if (placeholderKeys.length === 0) return;

  const loaded = loadEnv(mode, rootDir, "VITE_");
  for (const [key, originalVal] of placeholderKeys) {
    if (!(key in loaded) && originalVal !== undefined) {
      process.env[key] = originalVal;
    }
  }
}

const TRUSTED_ALLOWED_HOSTS = [
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
