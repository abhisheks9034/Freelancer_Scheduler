export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        dark: {
          950: '#0a0a0b',
          900: '#121316',
          800: '#181a1f',
          700: '#22242a',
          600: '#2c2f36',
        },
        accent: {
          500: '#c0a062',
          600: '#b09055',
        }
      },
      fontFamily: {
        syne: ['Syne', 'sans-serif'],
        mono: ['DM Mono', 'monospace'],
      },
      backdropBlur: {
        xs: '2px',
      }
    },
  },
  plugins: [],
}
