import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const inventoryFrontendRoot = path.resolve(__dirname, '../../frontend/inventory')
const schoolPortalRoot = path.resolve(__dirname, '../../school-portal/frontend/src')

/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './index.html',
    './src/**/*.{js,jsx}',
    `${inventoryFrontendRoot}/src/**/*.{js,jsx}`,
    `${schoolPortalRoot}/**/*.{js,jsx}`,
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          primary: '#F7941D',
          orange: '#F7941D',
          'orange-light': '#FBB040',
          'orange-peach': '#FBB040',
          'orange-vivid': '#F26522',
          'orange-deep': '#F15A24',
          blue: '#F7941D',
          'blue-alt': '#F26522',
          deep: '#414042',
          dark: '#5C3D2E',
          ink: '#414042',
          navy: '#F15A24',
          black: '#2E2A28',
          sky: '#FBB040',
          muted: '#8A7A6E',
          'muted-light': '#A6988C',
          gray: '#6B5E54',
          'gray-mid': '#7A6B60',
          surface: '#FFFFFF',
          white: '#FFFFFF',
          gradientStart: '#FBB040',
          gradientMid: '#F7941D',
          gradientEnd: '#F15A24',
        },
        slate: {
          50: '#FFFFFF',
          100: '#FFF8F0',
          200: '#FEECD8',
          300: '#FDD9B0',
          400: '#C4A07A',
          500: '#8A7A6E',
          600: '#6B5E54',
          700: '#5C4A3A',
          800: '#414042',
          900: '#2E2A28',
        },
        success: {
          50: '#eaf7ee',
          100: '#d4edda',
          500: '#28A745',
          600: '#218838',
        },
        error: {
          50: '#fdf0f1',
          100: '#f8d7da',
          500: '#DC3545',
          600: '#c82333',
          700: '#B91C1C',
          200: '#FECACA',
        },
        warning: {
          50: '#FFF8F0',
          100: '#FEECD8',
          500: '#F7941D',
          600: '#F15A24',
        },
        info: {
          50: '#FFF8F0',
          100: '#FDD9B0',
          500: '#F7941D',
          600: '#F26522',
        },
      },
      fontFamily: {
        heading: ['Nunito', 'sans-serif'],
        body: ['"Segoe UI"', 'Segoe UI', 'system-ui', 'sans-serif'],
        ui: ['Poppins', 'sans-serif'],
        sans: ['"Segoe UI"', 'Segoe UI', 'system-ui', 'sans-serif'],
        mono: ['Consolas', 'Monaco', 'monospace'],
      },
      animation: {
        'fade-in': 'fadeIn 0.3s ease-out',
        'slide-up': 'slideUp 0.4s cubic-bezier(0.16, 1, 0.3, 1)',
        'pulse-subtle': 'pulseSubtle 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        float: 'float 8s ease-in-out infinite',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%': { opacity: '0', transform: 'translateY(10px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        pulseSubtle: {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '.7' },
        },
        float: {
          '0%, 100%': { transform: 'translateY(0px)' },
          '50%': { transform: 'translateY(-12px)' },
        },
      },
      boxShadow: {
        soft: '0 4px 20px -2px rgba(65, 64, 66, 0.1)',
        glass: '0 8px 32px rgba(241, 90, 36, 0.14), inset 0 1px 0 rgba(255, 255, 255, 0.28)',
        'glass-lg': '0 20px 50px rgba(241, 90, 36, 0.18), inset 0 1px 0 rgba(255, 255, 255, 0.32)',
        'glass-inset': 'inset 0 1px 0 rgba(255, 255, 255, 0.35), inset 0 -1px 0 rgba(0, 0, 0, 0.05)',
        premium: '0 10px 25px -5px rgba(241, 90, 36, 0.12), 0 8px 10px -6px rgba(65, 64, 66, 0.06)',
        'inner-soft': 'inset 0 2px 4px 0 rgba(65, 64, 66, 0.04)',
        'glow-orange': '0 0 28px rgba(247, 148, 29, 0.38)',
        'glow-blue': '0 0 28px rgba(251, 176, 64, 0.3)',
        'glow-sky': '0 0 28px rgba(242, 101, 34, 0.3)',
      },
      backdropBlur: {
        xs: '4px',
        '3xl': '40px',
      },
      backgroundImage: {
        'brand-gradient': 'linear-gradient(135deg, #FBB040 0%, #F7941D 38%, #F26522 72%, #F15A24 100%)',
        'brand-gradient-soft': 'linear-gradient(135deg, rgba(251,176,64,0.95) 0%, rgba(247,148,29,0.92) 45%, rgba(241,90,36,0.9) 100%)',
        'wizklub-hero': 'linear-gradient(135deg, #FBB040 0%, #F7941D 40%, #F26522 75%, #F15A24 100%)',
        mesh: 'radial-gradient(at 18% 22%, rgba(251,176,64,0.4) 0, transparent 48%), radial-gradient(at 82% 12%, rgba(247,148,29,0.28) 0, transparent 42%), radial-gradient(at 65% 88%, rgba(241,90,36,0.16) 0, transparent 50%)',
      },
    },
  },
  plugins: [],
}
