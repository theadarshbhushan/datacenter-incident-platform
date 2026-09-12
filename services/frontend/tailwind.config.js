/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        ibmBlue: {
          DEFAULT: "#0F62FE",
          hover: "#0353E9",
          active: "#002D9C",
          subtle: "#EDF5FF",
        },
        canvasBg: "#F4F4F4",
        surface: "#FFFFFF",
        cardBorder: "#E0E0E0",
        textPrimary: "#161616",
        textSecondary: "#525252",
        statusSuccess: {
          DEFAULT: "#24A148",
          bg: "#DEFBE6",
          border: "#A7F0BA",
        },
        statusWarning: {
          DEFAULT: "#F1C21B",
          bg: "#FEF7D9",
          border: "#FDE876",
        },
        statusDanger: {
          DEFAULT: "#DA1E28",
          bg: "#FFF1F1",
          border: "#FFD7D9",
        },
      },
      borderRadius: {
        DEFAULT: "4px",
        sm: "2px",
        md: "4px",
        lg: "6px",
      },
      fontFamily: {
        sans: ["Inter", "-apple-system", "BlinkMacSystemFont", "Segoe UI", "Roboto", "sans-serif"],
      },
      boxShadow: {
        card: "0 1px 2px 0 rgba(0, 0, 0, 0.05)",
        drawer: "-4px 0 16px rgba(0, 0, 0, 0.08)",
        modal: "0 12px 24px rgba(0, 0, 0, 0.12)",
      }
    },
  },
  plugins: [],
}
