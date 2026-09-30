import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: "var(--bg)",
        surface: "var(--surface)",
        surfaceHover: "var(--surface-hover)",
        border: "var(--border)",
        text: "var(--text)",
        textSecondary: "var(--text-secondary)",
        accent: "rgb(var(--accent-rgb) / <alpha-value>)",
        accentHover: "var(--accent-hover)",
        onAccent: "var(--on-accent)",
        success: "var(--success)",
        warning: "var(--warning)",
        danger: "var(--danger)",
        onDanger: "var(--on-danger)",
      },
      borderRadius: {
        sm: "8px",
        md: "12px",
        lg: "20px",
        xl: "24px",
      },
      boxShadow: {
        card: "0 1px 2px rgba(0,0,0,0.035), 0 12px 32px rgba(0,0,0,0.035)",
        elevated: "0 10px 34px rgba(0,0,0,0.11)",
      },
      fontFamily: {
        sans: [
          "DM Sans Variable",
          "Avenir Next",
          "Segoe UI",
          "system-ui",
          "sans-serif",
        ],
        display: ["Plus Jakarta Sans Variable", "Avenir Next", "system-ui", "sans-serif"],
      },
      fontSize: {
        display: ["clamp(2.25rem, 3.8vw, 3.3rem)", { lineHeight: "1.12", letterSpacing: "-0.055em", fontWeight: "450" }],
        h1: ["clamp(2rem, 3vw, 2.8rem)", { lineHeight: "1.15", letterSpacing: "-0.05em", fontWeight: "450" }],
        h2: ["23px", { lineHeight: "32px", letterSpacing: "-0.04em", fontWeight: "500" }],
        h3: ["18px", { lineHeight: "26px", letterSpacing: "-0.025em", fontWeight: "600" }],
        body: ["16px", { lineHeight: "25px", fontWeight: "400" }],
        small: ["14px", { lineHeight: "21px", fontWeight: "400" }],
        caption: ["12px", { lineHeight: "18px", fontWeight: "500" }],
      },
      keyframes: {
        fadeIn: { "0%": { opacity: "0" }, "100%": { opacity: "1" } },
        slideUp: {
          "0%": { opacity: "0", transform: "translateY(8px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
      },
      animation: {
        fadeIn: "fadeIn 200ms ease-out",
        slideUp: "slideUp 250ms ease-out",
      },
    },
  },
  plugins: [],
};

export default config;
