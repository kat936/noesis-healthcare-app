/**
 * Noesis.io Health — Tailwind configuration
 * © 2026 Athena Core Technologies, Inc.
 */
/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './index.html',
    './src/**/*.{js,jsx,ts,tsx}',
    './noesis-health-app.jsx',
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        noesis: {
          teal: '#14b8a6',
          ink: '#0f172a',
          slate: '#1e293b',
        },
      },
      fontFamily: {
        sans: [
          '-apple-system',
          'BlinkMacSystemFont',
          'Segoe UI',
          'Roboto',
          'Helvetica Neue',
          'Arial',
          'sans-serif',
        ],
      },
    },
  },
  plugins: [],
};
