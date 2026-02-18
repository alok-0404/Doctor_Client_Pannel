/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './index.html',
    './src/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        clinic: {
          background: '#f5f9fc',
          card: '#ffffff',
          primary: '#1e88e5',
          accent: '#26a69a',
          border: '#d7e2ed',
          muted: '#607d8b',
        },
      },
      boxShadow: {
        subtle: '0 8px 24px rgba(15, 35, 52, 0.06)',
      },
      fontFamily: {
        sans: ['system-ui', 'Segoe UI', 'sans-serif'],
      },
    },
  },
  plugins: [],
}

