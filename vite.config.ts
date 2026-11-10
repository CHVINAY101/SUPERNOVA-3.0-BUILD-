import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath, URL } from "node:url";
import fs from "node:fs";

// Load .env explicitly so real project credentials take precedence over any default placeholder container variables
if (fs.existsSync(".env")) {
  try {
    const envRaw = fs.readFileSync(".env", "utf-8");
    for (const line of envRaw.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eqIdx = trimmed.indexOf("=");
      if (eqIdx > 0) {
        const key = trimmed.slice(0, eqIdx).trim();
        const val = trimmed.slice(eqIdx + 1).trim().replace(/^['"](.*)['"]$/, "$1");
        // If system env is unset or holds a placeholder, overwrite with actual .env value
        if (val && (!process.env[key] || process.env[key]?.includes("your-project"))) {
          process.env[key] = val;
        }
      }
    }
  } catch (e) {
    console.warn("Could not read .env file:", e);
  }
}

export default defineConfig({
  plugins: [react()],
  server: {
    host: "0.0.0.0",
    port: 3000,
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
});

