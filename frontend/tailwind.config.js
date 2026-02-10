/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        navy: {
          50: '#fdf2f7',
          100: '#fce7f1',
          200: '#fbcfe4',
          300: '#f9a8d0',
          400: '#f472b0',
          500: '#ec4899',
          600: '#DC006C',
          700: '#be185d',
          800: '#9d174d',
          900: '#831843',
        },
        gold: {
          50: '#fffbeb',
          100: '#fef3c7',
          200: '#fde68a',
          300: '#fcd34d',
          400: '#fbbf24',
          500: '#d4a847',
          600: '#b8942e',
          700: '#92710a',
          800: '#78611d',
          900: '#5c4813',
        },
      },
    },
  },
  plugins: [],
}
