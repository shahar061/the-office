import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        bg: "#0f0f1a",
        surface: "#1a1a2e",
        "surface-light": "#151528",
        border: "#2a2a3a",
        "text-primary": "#e2e8f0",
        "text-secondary": "#94a3b8",
        "text-muted": "#64748b",
        "text-dim": "#4b5563",
        "accent-blue": "#3b82f6",
        "accent-purple": "#6366f1",
        "accent-amber": "#f59e0b",
        "accent-green": "#22c55e",
        "accent-red": "#ef4444",
      },
      fontFamily: {
        pixel: ['"Press Start 2P"', "monospace"],
      },
    },
  },
  plugins: [],
};

export default config;
