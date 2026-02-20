import type { Config } from 'tailwindcss'

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['DM Sans', '-apple-system', 'sans-serif'],
        mono: ['DM Mono', 'monospace'],
      },
      colors: {
        fabric: {
          black: '#000000',
          white: '#ffffff',
          50: '#fafafa',
          100: '#f0f0ee',
          200: '#e2e2df',
          300: '#c8c8c4',
          400: '#a0a09c',
          500: '#787874',
          600: '#58584f',
          700: '#3a3a34',
          800: '#1a1a16',
        },
        blue: { DEFAULT: '#3d8af7', light: '#6aa4f9' },
        pink: { DEFAULT: '#fe83e0' },
        green: { DEFAULT: '#0dc956' },
        orange: { DEFAULT: '#f7931e' },
        red: { DEFAULT: '#d03a3d' },
        // Category colors
        cat: {
          gen: '#8b5cf6',
          llm: '#3d8af7',
          search: '#0dc956',
          code: '#fe83e0',
          agent: '#f7931e',
          data: '#06b6d4',
          embed: '#ec4899',
          infra: '#d97706',
          speech: '#14b8a6',
          vision: '#e82d35',
        },
      },
      maxWidth: {
        container: '1400px',
        page: '960px',
      },
      borderRadius: {
        card: '14px',
        section: '12px',
        tag: '100px',
      },
      keyframes: {
        pulse: {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.4' },
        },
      },
      animation: {
        'dot-pulse': 'pulse 2s infinite',
      },
    },
  },
  plugins: [],
}
export default config
