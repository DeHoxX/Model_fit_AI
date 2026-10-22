/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        dark: {
          base: '#121615',
          sidebar: '#0e1211',
          surface: '#181e1c',
          elevated: '#1f2724',
          bubble: '#2e3e37',
          hover: '#25302c',
          border: '#242e2a',
          borderActive: '#3c4e46',
          borderSubtle: '#1b2320',
        },
        sage: {
          50: '#f2f7f4',
          100: '#e1ede7',
          200: '#c5dcd1',
          300: '#9ec4b3',
          400: '#75a691',
          500: '#538972',
          600: '#3f6d5a',
          700: '#345749',
          800: '#2c463b',
          900: '#253a32',
          950: '#14211c',
        },
        alloc: {
          weights: '#5a826e',
          kv: '#3a727d',
          headroom: '#283731',
        }
      },
      fontFamily: {
        sans: ['Inter', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
      }
    },
  },
  plugins: [],
}
