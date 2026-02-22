import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "var(--background)",
        foreground: "var(--foreground)",
        primary: "var(--color-primary)",
        "primary-hover": "var(--color-primary-hover)",
        "app-dark": "var(--color-app-dark)",
        "app-panel": "var(--color-app-panel)",
        "app-border": "var(--color-app-border)",
        "text-primary": "var(--color-text-primary)",
        "text-secondary": "var(--color-text-secondary)",
        "budget-safe": "var(--color-budget-safe)",
        "budget-caution": "var(--color-budget-caution)",
        "budget-critical": "var(--color-budget-critical)",
      },
    },
  },
  plugins: [],
};
export default config;
