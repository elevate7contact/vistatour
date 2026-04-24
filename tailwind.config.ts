import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        'paseo-gold': '#d8a15a',
        'paseo-dark': '#0f0f10',
        'paseo-dark-2': '#1a1a1c',
        'paseo-cream': '#f4ede1'
      },
      fontFamily: {
        sans: ['var(--font-inter)', 'system-ui', 'sans-serif'],
        serif: ['var(--font-instrument)', 'Georgia', 'serif']
      },
      keyframes: {
        kenburns: {
          '0%': { transform: 'scale(1) translate(0, 0)' },
          '100%': { transform: 'scale(1.12) translate(-2%, -1%)' }
        },
        bgcycle: {
          '0%,20%': { opacity: '1' },
          '25%,95%': { opacity: '0' },
          '100%': { opacity: '1' }
        }
      },
      animation: {
        kenburns: 'kenburns 12s ease-in-out infinite alternate'
      }
    }
  },
  plugins: []
};

export default config;
