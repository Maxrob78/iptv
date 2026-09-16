module.exports = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx}",
    "./components/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        netflix: {
          black: '#141414',
          red: '#E50914',
          gray: '#808080',
          darkgray: '#181818'
        }
      },
      screens: {
        '3xl': '2000px', // Spécifique aux écrans 1440p (2560px) et 4K
      },
      scale: {
        '105': '1.05',
      },
      keyframes: {
        shimmer: {
          '0%': { transform: 'translateX(-200%)' },
          '100%': { transform: 'translateX(400%)' },
        },
        float: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-10px)' },
        },
        'pulse-glow': {
          '0%, 100%': { opacity: 1, filter: 'brightness(1)' },
          '50%': { opacity: 0.8, filter: 'brightness(1.5)' },
        }
      },
      animation: {
        shimmer: 'shimmer 1.5s ease-in-out infinite',
        float: 'float 6s ease-in-out infinite',
        'pulse-glow': 'pulse-glow 4s cubic-bezier(0.4, 0, 0.6, 1) infinite',
      },
    },
  },
  plugins: [],
}
