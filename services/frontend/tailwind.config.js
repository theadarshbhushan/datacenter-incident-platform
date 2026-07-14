/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        darkBg: "#0B0F19",
        panelBg: "#151C2C",
        cardBg: "rgba(21, 28, 44, 0.6)",
        borderSlate: "#222D44",
        accentCyan: "#00E5FF",
        accentEmerald: "#10B981",
        accentRose: "#F43F5E",
        accentAmber: "#F59E0B"
      },
      fontFamily: {
        sans: ["Inter", "sans-serif"],
      }
    },
  },
  plugins: [],
}
