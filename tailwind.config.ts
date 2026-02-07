import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#19202a",
        paper: "#fcfaf6",
        accent: "#0b7f63",
        accentSoft: "#ccefe5",
        clay: "#e8e1d2",
      },
      fontFamily: {
        sans: ['"Space Grotesk"', '"IBM Plex Sans"', "sans-serif"],
        mono: ['"IBM Plex Mono"', "ui-monospace", "monospace"],
      },
      boxShadow: {
        panel: "0 12px 38px rgba(25, 32, 42, 0.10)",
      },
      keyframes: {
        fadeInUp: {
          "0%": { opacity: "0", transform: "translateY(12px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
      },
      animation: {
        fadeInUp: "fadeInUp 0.35s ease-out",
      },
    },
  },
  plugins: [],
};

export default config;
