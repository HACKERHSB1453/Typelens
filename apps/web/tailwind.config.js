/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // All colors come from the single theme file (src/index.css) as CSS variables.
        bg: 'rgb(var(--bg-rgb) / <alpha-value>)',
        'bg-dark': 'rgb(var(--bg-dark-rgb) / <alpha-value>)',
        'bg-card': 'rgb(var(--bg-card-rgb) / <alpha-value>)',
        'bg-elev': 'rgb(var(--bg-elev-rgb) / <alpha-value>)',
        sub: 'rgb(var(--sub-rgb) / <alpha-value>)',
        'sub-2': 'rgb(var(--sub-2-rgb) / <alpha-value>)',
        text: 'rgb(var(--text-rgb) / <alpha-value>)',
        main: 'rgb(var(--main-rgb) / <alpha-value>)',
        error: 'rgb(var(--error-rgb) / <alpha-value>)',
        ok: 'rgb(var(--ok-rgb) / <alpha-value>)',
      },
      fontFamily: {
        mono: ['var(--font)'],
      },
      boxShadow: {
        card: '0 1px 0 0 rgba(0,0,0,0.25)',
      },
    },
  },
  plugins: [],
};
