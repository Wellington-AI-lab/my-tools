/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/**/*.{astro,html,js,ts,jsx,tsx,md,mdx}',
  ],
  darkMode: 'class',
  theme: {
    extend: {
      /* Titan UI Design System */
      colors: {
        titan: {
          surface: {
            base: '#FFFFFF',
            subtle: '#FAFAFA',
          },
          ink: {
            primary: '#1F2937',
            secondary: '#6B7280',
          },
          action: {
            primary: '#00B812',
            hover: '#00A50F',
          },
          border: {
            subtle: '#E5E7EB',
            default: '#D1D5DB',
          },
        },
        /* Legacy tokens (for backward compatibility) */
        onekey: {
          dark: {
            primary: '#F5F5F5',
            secondary: '#FFFFFF',
            tertiary: '#E5E5E5',
          },
          accent: {
            green: '#00B812',
            greenLight: '#00FFAA',
            greenDark: '#00CC6A',
            blue: '#3B82F6',
            purple: '#8B5CF6',
          },
          text: {
            primary: '#1F2937',
            secondary: '#6B7280',
            muted: '#9CA3AF',
          },
        },
      },
      fontFamily: {
        /* Inter - The OneKey standard */
        sans: [
          'Inter',
          '-apple-system',
          'BlinkMacSystemFont',
          'Segoe UI',
          'sans-serif',
        ],
        /* Georgia for all numbers/numeric content */
        mono: ['"Georgia"', "'Times New Roman'", 'serif'],
      },
      borderRadius: {
        /* Hardware Radius */
        'titan-sm': '8px',
        'titan-md': '16px',
        'titan-lg': '24px',
        'titan-xl': '9999px', /* Pill shape */
      },
      boxShadow: {
        /* Minimal shadows - only for hover */
        'titan-hover': '0 8px 24px rgba(0, 0, 0, 0.06)',
        'titan-card': '0 1px 3px rgba(0, 0, 0, 0.04)',
      },
      fontSize: {
        /* Titan Type Scale */
        'titan-xs': ['0.75rem', { lineHeight: '1.5' }],
        'titan-sm': ['0.875rem', { lineHeight: '1.5' }],
        'titan-base': ['1rem', { lineHeight: '1.6' }],
        'titan-lg': ['1.125rem', { lineHeight: '1.6' }],
        'titan-xl': ['1.25rem', { lineHeight: '1.4', letterSpacing: '-0.01em' }],
        'titan-2xl': ['1.5rem', { lineHeight: '1.3', letterSpacing: '-0.02em' }],
        'titan-3xl': ['1.875rem', { lineHeight: '1.2', letterSpacing: '-0.02em' }],
        'titan-4xl': ['2.25rem', { lineHeight: '1.1', letterSpacing: '-0.02em' }],
      },
      transitionTimingFunction: {
        'titan': 'cubic-bezier(0.33, 1, 0.68, 1)',
      },
    },
  },
  plugins: [],
};
