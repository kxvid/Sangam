import type { Config } from "tailwindcss";
import forms from "@tailwindcss/forms";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["ui-sans-serif", "system-ui", "-apple-system", "Segoe UI", "Roboto", "sans-serif"],
        mono: ["ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
      },
      colors: {
        ink: {
          950: "#08090b",
          900: "#0e1014",
          800: "#161a21",
          700: "#1f242d",
          600: "#2a3140",
          500: "#3a4256",
          400: "#6b7384",
          300: "#9ba2b1",
          200: "#cfd3dc",
          100: "#e7e9ef",
          50: "#f6f7f9",
        },
      },
      boxShadow: {
        card: "0 1px 0 rgba(255,255,255,0.04) inset, 0 8px 24px -12px rgba(0,0,0,0.6)",
      },
    },
  },
  plugins: [forms({ strategy: "class" })],
};

export default config;
