import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  theme: {
    extend: {
      // Couleurs VIVES (fonds, bordures, anneaux). Les couleurs d'action et de
      // statut passent par `--*-rgb` pour accepter l'opacité (bg-success/15,
      // border-accent/40) : avec un simple var(--success), Tailwind n'émet
      // aucune règle pour ces classes.
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
        success: "rgb(var(--success-rgb) / <alpha-value>)",
        warning: "rgb(var(--warning-rgb) / <alpha-value>)",
        danger: "rgb(var(--danger-rgb) / <alpha-value>)",
        onDanger: "var(--on-danger)",
      },
      // En TEXTE, les mêmes noms prennent l'encre du thème (globals.css) :
      // text-accent, text-success… restent ≥ 4,5:1 sur surface, survol et fond
      // teinté, en clair comme en sombre. bg-accent garde le bleu vif.
      textColor: {
        accent: "rgb(var(--accent-ink-rgb) / <alpha-value>)",
        success: "rgb(var(--success-ink-rgb) / <alpha-value>)",
        warning: "rgb(var(--warning-ink-rgb) / <alpha-value>)",
        danger: "rgb(var(--danger-ink-rgb) / <alpha-value>)",
      },
      borderRadius: {
        sm: "8px",
        md: "12px",
        lg: "20px",
        xl: "24px",
      },
      // Toute nouvelle ombre se déclare aussi dans SHADOW_TOKENS (lib/utils.ts).
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
      // Toute nouvelle taille se déclare aussi dans FONT_SIZE_TOKENS (lib/utils.ts),
      // sinon cn() la confond avec une couleur (test : tests/utils-cn.test.ts).
      // Minimum 11 px pour tout texte d'interface. Interlettrage négatif modéré :
      // au-delà de -0,03 em, les espaces entre mots s'écrasent.
      fontSize: {
        display: ["clamp(2.25rem, 3.8vw, 3.3rem)", { lineHeight: "1.12", letterSpacing: "-0.03em", fontWeight: "450" }],
        h1: ["clamp(2rem, 3vw, 2.8rem)", { lineHeight: "1.15", letterSpacing: "-0.025em", fontWeight: "450" }],
        h2: ["23px", { lineHeight: "32px", letterSpacing: "-0.02em", fontWeight: "500" }],
        h3: ["18px", { lineHeight: "26px", letterSpacing: "-0.01em", fontWeight: "600" }],
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
