/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        navy: {
          DEFAULT: "#0F172A",
          midnight: "#0B1120",
          deep: "#080D1A",
          surface: "#141E33",
          card: "#162036",
          border: "#1E2B45",
          muted: "#1E293B",
        },
        charcoal: {
          DEFAULT: "#1E293B",
          dark: "#131B2B",
          surface: "#1A2438",
          border: "#2A364F",
          light: "#334155",
        },
        blue: {
          DEFAULT: "#3B82F6",
          electric: "#38BDF8",
          soft: "#60A5FA",
          accent: "#2563EB",
          subtle: "rgba(56, 189, 248, 0.12)",
        },
        lavender: {
          DEFAULT: "#A5B4FC",
          muted: "#94A3B8",
          soft: "#C7D2FE",
          accent: "#818CF8",
        },
        offwhite: "#F8FAFC",
        grey: {
          subtle: "#F1F5F9",
          border: "#E2E8F0",
        },
      },
      fontFamily: {
        heading: ["'Bricolage Grotesque'", "-apple-system", "BlinkMacSystemFont", "sans-serif"],
        display: ["'Bricolage Grotesque'", "-apple-system", "BlinkMacSystemFont", "sans-serif"],
        body: ["'DM Sans'", "-apple-system", "BlinkMacSystemFont", "'Segoe UI'", "Roboto", "sans-serif"],
        sans: ["'DM Sans'", "-apple-system", "BlinkMacSystemFont", "'Segoe UI'", "Roboto", "sans-serif"],
        mono: ["'JetBrains Mono'", "monospace"],
      },
    },
  },
  plugins: [],
};
