/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
        serif: ['Fraunces', 'Iowan Old Style', 'Palatino Linotype', 'Georgia', 'serif'],
      },
      colors: {
        // Verde "lampada da biblioteca": colore principale dell'app
        brand: {
          50: '#f1f7f5',
          100: '#dcede7',
          200: '#bbdbd0',
          300: '#8fc0b0',
          400: '#5f9f8b',
          500: '#3f8470',
          600: '#2f6b5b',
          700: '#27574b',
          800: '#21463d',
          900: '#1c3a33',
        },
        paper: '#f8f6f1',
      },
      boxShadow: {
        soft: '0 1px 2px rgb(28 25 23 / 0.04), 0 4px 16px -4px rgb(28 25 23 / 0.08)',
        lift: '0 2px 4px rgb(28 25 23 / 0.06), 0 12px 28px -8px rgb(28 25 23 / 0.22)',
      },
    },
  },
  plugins: [],
}
