/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        // Approximation of the app's "garden" green scale.
        // garden-600 === #4d7c0f matches the bed color used in the live app.
        garden: {
          50: '#f3f8ee',
          100: '#e3f0d5',
          200: '#c8e2ad',
          300: '#a6cf7c',
          400: '#84bb52',
          500: '#65a234',
          600: '#4d7c0f',
          700: '#3f6212',
          800: '#365314',
          900: '#1a2e05',
        },
      },
    },
  },
  plugins: [],
}
