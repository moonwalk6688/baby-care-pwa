import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        cream: "#fff8ef",
        linen: "#f7efe4",
        sage: "#7f9b8f",
        mint: "#d9eee5",
        clay: "#c98564",
        ink: "#24302b"
      },
      boxShadow: {
        soft: "0 16px 45px rgba(61, 44, 32, 0.08)"
      }
    }
  },
  plugins: []
};

export default config;
