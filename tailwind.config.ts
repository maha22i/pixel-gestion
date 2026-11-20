import type { Config } from "tailwindcss";
const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        navy: { DEFAULT: "#2C3E50", 50: "#F3F5F7", 100: "#E4E9EE", 200: "#C5CFD9", 600: "#34495E", 700: "#2C3E50", 800: "#22303E", 900: "#18222C" },
        gold: { DEFAULT: "#F5A623", 50: "#FEF6E7", 100: "#FDEBC8", 500: "#F5A623", 600: "#D98C0B" },
      },
      fontFamily: { sans: ["Carlito", "Calibri", "ui-sans-serif", "system-ui", "sans-serif"] },
    },
  },
  plugins: [],
};
export default config;
