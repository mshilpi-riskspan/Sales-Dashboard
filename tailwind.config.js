/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        rs: {
          teal: '#0C8EA3',
          navy: '#1C2E59',
          orange: '#FFA91D',
          border: '#DADEE5',
          surface: '#F1F3F7',
          text: '#303036',
          muted: '#858C9C',
          overdueText: '#b36200',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
