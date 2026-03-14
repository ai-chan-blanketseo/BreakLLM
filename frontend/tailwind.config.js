/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // Hacker green terminal palette
        terminal: {
          bg: "#0d1117",
          surface: "#161b22",
          border: "#30363d",
          green: "#39d353",
          "green-dim": "#196127",
          red: "#f85149",
          yellow: "#e3b341",
          blue: "#58a6ff",
          muted: "#8b949e",
          text: "#c9d1d9",
        },
      },
      fontFamily: {
        mono: ["'JetBrains Mono'", "'Fira Code'", "Consolas", "monospace"],
      },
    },
  },
  plugins: [],
};
