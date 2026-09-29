/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      // Palette shared with floatingsphere's web view: cool blue-black neutrals,
      // one amber accent. gray-950 = its --bg, gray-900 = --surface,
      // gray-100/300/500/600 = --ink/--ink-2/--ink-3/--ink-4.
      colors: {
        gray: {
          50: '#f5f6f8',
          100: '#edf0f5',
          200: '#dcdfe6',
          300: '#b3b8c7',
          400: '#9398a4',
          500: '#80858f',
          600: '#5c606b',
          700: '#393c47',
          800: '#23252f',
          900: '#15161e',
          950: '#0d0e13',
        },
        brand: {
          50: '#fef8e7',
          100: '#fdefc4',
          200: '#fbe08a',
          300: '#fbcf5c',
          400: '#fabf40',
          500: '#f0a91c',
          600: '#a86f06',
          700: '#8a5a05',
          800: '#6b4608',
          900: '#4d330a',
          950: '#2a1c05',
        },
        ink: '#1a1406',
      },
      fontFamily: {
        sans: ['"JetBrains Mono Variable"', '"JetBrains Mono"', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
        mono: ['"JetBrains Mono Variable"', '"JetBrains Mono"', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      animation: {
        'bounce-in': 'bounceIn 0.5s ease-out',
        'slide-up': 'slideUp 0.4s ease-out',
        'fade-in': 'fadeIn 0.3s ease-out',
        'pop': 'pop 0.3s ease-out',
        'pulse-soft': 'pulseSoft 2s ease-in-out infinite',
        'confetti': 'confetti 1s ease-out forwards',
        'check': 'check 0.4s ease-out',
        'shake': 'shake 0.5s ease-in-out',
      },
      keyframes: {
        bounceIn: {
          '0%': { transform: 'scale(0.3)', opacity: '0' },
          '50%': { transform: 'scale(1.05)' },
          '70%': { transform: 'scale(0.9)' },
          '100%': { transform: 'scale(1)', opacity: '1' },
        },
        slideUp: {
          '0%': { transform: 'translateY(20px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        pop: {
          '0%': { transform: 'scale(0.8)', opacity: '0' },
          '100%': { transform: 'scale(1)', opacity: '1' },
        },
        pulseSoft: {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.7' },
        },
        check: {
          '0%': { transform: 'scale(0) rotate(-45deg)', opacity: '0' },
          '50%': { transform: 'scale(1.2) rotate(0deg)' },
          '100%': { transform: 'scale(1) rotate(0deg)', opacity: '1' },
        },
        shake: {
          '0%, 100%': { transform: 'translateX(0)' },
          '25%': { transform: 'translateX(-4px)' },
          '75%': { transform: 'translateX(4px)' },
        },
      },
    },
  },
  plugins: [require('@tailwindcss/typography')],
};
