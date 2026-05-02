/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["DM Sans", "system-ui", "sans-serif"],
        display: ["Outfit", "system-ui", "sans-serif"],
      },
      colors: {
        surface: {
          50: "#f8fafc",
          100: "#f1f5f9",
          200: "#e2e8f0",
          800: "#1e293b",
          900: "#0f172a",
          950: "#020617",
        },
        accent: {
          DEFAULT: "#0ea5e9",
          dim: "#0284c7",
        },
        mint: "#34d399",
        amber: "#fbbf24",
      },
      boxShadow: {
        card: "0 1px 0 rgba(15, 23, 42, 0.06), 0 12px 40px -12px rgba(15, 23, 42, 0.12)",
      },
    },
  },
  plugins: [],
};
