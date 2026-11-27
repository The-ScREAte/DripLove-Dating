import type { Config } from "tailwindcss";
import plugin from "tailwindcss/plugin";

export default {
  darkMode: ["class"],
  content: [
    "./pages/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./app/**/*.{ts,tsx}",
    "./src/**/*.{ts,tsx}",
  ],
  prefix: "",
  theme: {
    container: {
      center: true,
      padding: '2rem',
      screens: {
        '2xl': '1400px',
        'lg': '1024px',
        'md': '768px',
        'sm': '390px' // Ensures perfect fit for mobile width
      }
    },
    extend: {
      colors: {
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))'
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))'
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))'
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))'
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))'
        },
        popover: {
          DEFAULT: 'hsl(var(--popover))',
          foreground: 'hsl(var(--popover-foreground))'
        },
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))'
        },
        brand: {
          DEFAULT: 'hsl(var(--dl-brand) / <alpha-value>)',
          strong: 'hsl(var(--dl-brand-strong) / <alpha-value>)',
          ink: 'hsl(var(--dl-brand-ink) / <alpha-value>)',
          from: 'hsl(var(--dl-brand-from) / <alpha-value>)',
          to: 'hsl(var(--dl-brand-to) / <alpha-value>)'
        },
        danger: {
          DEFAULT: 'hsl(var(--dl-danger) / <alpha-value>)',
          strong: 'hsl(var(--dl-danger-strong) / <alpha-value>)'
        },
        success: 'hsl(var(--dl-success) / <alpha-value>)',
        warning: 'hsl(var(--dl-warning) / <alpha-value>)',
        surface: {
          DEFAULT: 'hsl(var(--dl-surface) / <alpha-value>)',
          raised: 'hsl(var(--dl-surface-raised) / <alpha-value>)'
        },
        sidebar: {
          DEFAULT: 'hsl(var(--sidebar-background))',
          foreground: 'hsl(var(--sidebar-foreground))',
          primary: 'hsl(var(--sidebar-primary))',
          'primary-foreground': 'hsl(var(--sidebar-primary-foreground))',
          accent: 'hsl(var(--sidebar-accent))',
          'accent-foreground': 'hsl(var(--sidebar-accent-foreground))',
          border: 'hsl(var(--sidebar-border))',
          ring: 'hsl(var(--sidebar-ring))'
        }
      },
      borderRadius: {
        control: 'var(--dl-r-control)',
        input: 'var(--dl-r-input)',
        card: 'var(--dl-r-card)',
        sheet: 'var(--dl-r-sheet)',
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)'
      },
      boxShadow: {
        'dl-sm': 'var(--dl-shadow-sm)',
        'dl-md': 'var(--dl-shadow-md)',
        'dl-lg': 'var(--dl-shadow-lg)',
        'dl-brand': 'var(--dl-shadow-brand)'
      },
      backgroundImage: {
        'brand-gradient': 'linear-gradient(135deg, hsl(var(--dl-brand-from)) 0%, hsl(var(--dl-brand-to)) 100%)',
        'brand-gradient-strong': 'linear-gradient(135deg, hsl(var(--dl-brand-strong)) 0%, hsl(271 81% 48%) 100%)'
      },
      minHeight: { touch: 'var(--dl-touch)' },
      minWidth: { touch: 'var(--dl-touch)' },
      keyframes: {
        'accordion-down': {
          from: { height: '0' },
          to: { height: 'var(--radix-accordion-content-height)' }
        },
        'accordion-up': {
          from: { height: 'var(--radix-accordion-content-height)' },
          to: { height: '0' }
        },
        'dash': {
          '0%': { strokeDashoffset: '301.59' },
          '100%': { strokeDashoffset: '0' }
        },
        'ellipse-dash': {
          '0%': { strokeDashoffset: '850' },
          '100%': { strokeDashoffset: '0' }
        },
        'clock-fill': {
          '0%': { strokeDashoffset: '251.2' },
          '100%': { strokeDashoffset: '0' }
        },
        'clock-rotate': {
          '0%': { transform: 'rotate(0deg)' },
          '100%': { transform: 'rotate(360deg)' }
        }
      },
      animation: {
        'accordion-down': 'accordion-down 0.2s ease-out',
        'accordion-up': 'accordion-up 0.2s ease-out',
        'dash': 'dash 5s linear forwards',
        'ellipse-dash': 'ellipse-dash 1.5s linear forwards',
        'clock-fill': 'clock-fill 1.5s linear forwards',
        'clock-rotate': 'clock-rotate 4s linear forwards'
      }
    }
  },
  plugins: [
    require("tailwindcss-animate"),
    plugin(function({ addVariant }) {
      addVariant('ios', '@supports (-webkit-touch-callout: none)');
    })
  ],
} satisfies Config;
