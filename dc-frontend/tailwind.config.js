/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        canvas: '#F8FAF8',
        surface: '#FFFFFF',
        line: { DEFAULT: '#E3EAE5', strong: '#CFDAD3' },
        ink: { DEFAULT: '#17211C', muted: '#64736A', faint: '#8A978F' },
        brand: {
          DEFAULT: '#16834A',
          hover: '#12693B',
          dark: '#0E5230',
          light: '#E3F5E9',
          50: '#F1FAF4',
          100: '#E3F5E9',
          200: '#C3E8D0',
          300: '#94D5AD',
          400: '#5BBA82',
          500: '#2F9D61',
          600: '#16834A',
          700: '#12693B',
          800: '#0E5230',
          900: '#0B3F25',
        },
        critical: { DEFAULT: '#DC2626', bg: '#FEF2F2', line: '#FECACA' },
        warning: { DEFAULT: '#D97706', bg: '#FFFBEB', line: '#FDE68A' },
        healthy: { DEFAULT: '#16834A', bg: '#E3F5E9', line: '#C3E8D0' },
        info: { DEFAULT: '#2563EB', bg: '#EFF6FF', line: '#BFDBFE' },
        violet: { DEFAULT: '#7C3AED', bg: '#F5F3FF', line: '#DDD6FE' },
        orange: { DEFAULT: '#EA580C', bg: '#FFF7ED', line: '#FED7AA' },
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', '-apple-system', 'Segoe UI', 'sans-serif'],
      },
      boxShadow: {
        card: '0 1px 2px rgba(23, 33, 28, 0.04), 0 1px 3px rgba(23, 33, 28, 0.04)',
        pop: '0 8px 24px rgba(23, 33, 28, 0.10), 0 2px 6px rgba(23, 33, 28, 0.06)',
        lift: '0 24px 48px -12px rgba(23, 33, 28, 0.18)',
      },
      borderRadius: { xl: '14px', '2xl': '18px' },
      keyframes: {
        'fade-in': { from: { opacity: 0, transform: 'translateY(4px)' }, to: { opacity: 1, transform: 'none' } },
        'slide-in': { from: { transform: 'translateX(100%)' }, to: { transform: 'none' } },
      },
      animation: {
        'fade-in': 'fade-in 160ms ease-out',
        'slide-in': 'slide-in 200ms ease-out',
      },
    },
  },
  plugins: [],
}
