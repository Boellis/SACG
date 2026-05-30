/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        garden: { 50:'#f1f8f1',100:'#dcefdc',500:'#4caf50',600:'#3d9140',700:'#2f7233' },
      },
    },
  },
  plugins: [],
};
