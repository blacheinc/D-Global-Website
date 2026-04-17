import type { Config } from 'tailwindcss';
import animate from 'tailwindcss-animate';

const config: Config = {
  darkMode: 'class',
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './features/**/*.{ts,tsx}',
  ],
  theme: {
    container: {
      center: true,
      padding: {
        DEFAULT: '1rem',
        sm: '1.5rem',
        lg: '2rem',
      },
      screens: {
        '2xl': '1400px',
      },
    },
    extend: {
      colors: {
        background: 'hsl(var(--bg) / <alpha-value>)',
        surface: 'hsl(var(--surface) / <alpha-value>)',
        elevated: 'hsl(var(--elevated) / <alpha-value>)',
        accent: {
          DEFAULT: 'hsl(var(--accent) / <alpha-value>)',
          hot: 'hsl(var(--accent-hot) / <alpha-value>)',
          deep: 'hsl(var(--accent-deep) / <alpha-value>)',
        },
        foreground: 'hsl(var(--fg) / <alpha-value>)',
        muted: 'hsl(var(--muted) / <alpha-value>)',
        border: 'hsl(var(--border) / <alpha-value>)',
        ring: 'hsl(var(--accent) / <alpha-value>)',
      },
      fontFamily: {
        display: ['var(--font-display)', 'ui-serif', 'Georgia', 'serif'],
        sans: ['var(--font-body)', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      fontSize: {
        'display-2xl': ['clamp(3rem, 7vw, 6.5rem)', { lineHeight: '0.95', letterSpacing: '-0.02em' }],
        'display-xl': ['clamp(2.25rem, 5vw, 4.5rem)', { lineHeight: '1', letterSpacing: '-0.02em' }],
        'display-lg': ['clamp(1.75rem, 3.5vw, 3rem)', { lineHeight: '1.05', letterSpacing: '-0.01em' }],
      },
      borderRadius: {
        DEFAULT: 'var(--radius)',
        lg: '1rem',
        xl: '1.25rem',
        '2xl': '1.5rem',
      },
      boxShadow: {
        glow: '0 0 24px 2px hsl(var(--accent) / 0.55), 0 0 48px 8px hsl(var(--accent) / 0.2)',
        'glow-sm': '0 0 12px 1px hsl(var(--accent) / 0.5)',
        lift: '0 12px 36px rgba(0,0,0,0.55), 0 2px 6px rgba(0,0,0,0.4)',
      },
      backgroundImage: {
        'grid-fade':
          'radial-gradient(ellipse 80% 60% at 50% 0%, hsl(var(--accent) / 0.15), transparent 60%)',
        'noise':
          "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='160' height='160'><filter id='n'><feTurbulence baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 0.04 0'/></filter><rect width='100%25' height='100%25' filter='url(%23n)'/></svg>\")",
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%': { opacity: '0', transform: 'translateY(16px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        pulseRed: {
          '0%, 100%': { boxShadow: '0 0 0 0 hsl(var(--accent) / 0.7)' },
          '50%': { boxShadow: '0 0 0 14px hsl(var(--accent) / 0)' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
      },
      animation: {
        'fade-in': 'fadeIn 0.6s ease-out both',
        'slide-up': 'slideUp 0.6s cubic-bezier(.2,.7,.2,1) both',
        'pulse-red': 'pulseRed 2.2s ease-out infinite',
        shimmer: 'shimmer 2.5s linear infinite',
      },
    },
  },
  plugins: [animate],
};

export default config;
