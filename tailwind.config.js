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
          DEFAULT: "#151535",
          deep: "#0F0F28",
          muted: "#2A2A54",
        },
        blue: {
          electric: "#1719C9",
          DEFAULT: "#1719C9",
        },
        lime: {
          accent: "#C8F500",
          DEFAULT: "#C8F500",
        },
        magenta: {
          vibrant: "#EF28D0",
          DEFAULT: "#EF28D0",
        },
        orange: {
          vibrant: "#FF7025",
          DEFAULT: "#FF7025",
        },
        purple: {
          accent: "#8737E8",
          DEFAULT: "#8737E8",
        },
        yellow: {
          accent: "#FFD52E",
          DEFAULT: "#FFD52E",
        },
        offwhite: "#F8F7FC",
        grey: {
          subtle: "#EAEAF2",
          border: "#D8D8E5",
        },
      },
      fontFamily: {
        heading: ["Space Grotesk", "sans-serif"],
        display: ["Space Grotesk", "sans-serif"],
        body: ["Inter", "Manrope", "sans-serif"],
        mono: ["JetBrains Mono", "monospace"],
      },
      boxShadow: {
        hard: "4px 4px 0px #151535",
        "hard-sm": "2px 2px 0px #151535",
        "hard-lg": "6px 6px 0px #151535",
        "hard-lime": "4px 4px 0px #C8F500",
      },
    },
  },
  plugins: [],
};
