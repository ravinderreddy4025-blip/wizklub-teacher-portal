import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const inventoryFrontendRoot = path.resolve(__dirname, '../../frontend/inventory')
const schoolPortalRoot = path.resolve(__dirname, '../../school-portal/frontend/src')

/*
 * Theme mirrored from frontend/inventory/tailwind.config.js (keep in sync) — this config compiles the
 * embedded Kit Inventory (school role) inside the Teachers Portal.
 */
const WK = {
  navy: '#02344F',
  'navy-2': '#0B4A6B',
  orange: '#FF8C2B',
  'orange-hover': '#FF9D47',
  edge: '#D9661A',
  sun: '#FFB547',
  band: '#F47D31',
  frame: '#E8661E', // solid app frame + menu (option C): white menu text = 3.31:1
  dome: '#F28C43',
  'orange-text': '#B4430F',
  'orange-text-hover': '#8F3409',
  cream: '#FFF7EE',
  peach: '#FFE7CF',
  'peach-2': '#FFD1A8',
  ink: '#02344F',
  body: '#4A5B68',
  muted: '#6C6E72',
  control: '#85878A',
  line: '#E6E7E8',
  mist: '#F2F2F2',
}

/** Headspace-style app chrome: flat band + lighter dome rising from the bottom (Teachers Portal tokens.css). */
const CHROME = 'radial-gradient(ellipse 150% 88% at 50% 100%, #F28C43 0 99.4%, rgba(242,140,67,0) 100%), #F47D31'

const SUCCESS = {
  50: '#EAF8EE',
  100: '#D6F4DE',
  200: '#A9E3BA',
  300: '#6FCB8A',
  400: '#2FA85A',
  500: '#0B7F35',
  600: '#04742D',
  700: '#04742D',
  800: '#035A23',
  900: '#023F18',
}

const ERROR = {
  50: '#FEF0F0',
  100: '#FDE0E0',
  200: '#F8C4C4',
  300: '#EF9A9A',
  400: '#E05A5A',
  500: '#C62828',
  600: '#B42323',
  700: '#B42323',
  800: '#8E1B1B',
  900: '#6B1414',
}

const INFO = {
  50: '#E6F2FF',
  100: '#CCE4FF',
  200: '#99C9FF',
  500: '#0062CC',
  600: '#0062CC',
  700: '#004FA5',
  800: '#003D80',
  900: '#002D5E',
}

const NEUTRAL = {
  50: '#FFF7EE',
  100: '#F2F2F2',
  200: '#E6E7E8',
  300: '#CECFD0',
  400: '#6C6E72',
  500: '#5F6368',
  600: '#4A5B68',
  700: '#4A5B68',
  800: '#02344F',
  900: '#02344F',
}

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
        wk: WK,
        brand: {
          primary: WK.orange,
          orange: WK.orange,
          'orange-light': WK.sun,
          'orange-peach': WK.peach,
          'orange-vivid': WK['orange-hover'],
          'orange-deep': WK['orange-text'],
          blue: WK.orange,
          'blue-alt': WK['orange-hover'],
          deep: WK.navy,
          dark: WK.navy,
          ink: WK.ink,
          navy: WK.navy,
          black: WK.ink,
          sky: WK.sun,
          muted: WK.muted,
          'muted-light': WK.control,
          gray: WK.body,
          'gray-mid': WK.muted,
          surface: '#FFFFFF',
          white: '#FFFFFF',
          gradientStart: WK.dome,
          gradientMid: WK.band,
          gradientEnd: WK.band,
        },
        slate: NEUTRAL,
        gray: NEUTRAL,
        orange: {
          50: '#FFF7EE',
          100: '#FFE7CF',
          200: '#FFD1A8',
          300: '#FFB547',
          400: '#FF9D47',
          500: '#FF8C2B',
          600: '#B4430F',
          700: '#8F3409',
          800: '#6E2807',
          900: '#4A1B05',
        },
        amber: {
          50: '#FFF6E5',
          100: '#FFEECC',
          200: '#FFDF99',
          300: '#FFCB66',
          400: '#FFB547',
          500: '#F5A524',
          600: '#8A5500',
          700: '#8A5500',
          800: '#6B4200',
          900: '#4D2F00',
        },
        success: SUCCESS,
        emerald: SUCCESS,
        green: SUCCESS,
        error: ERROR,
        red: ERROR,
        warning: {
          50: '#FFF6E5',
          100: '#FFEECC',
          200: '#FFDF99',
          300: '#FFCB66',
          400: '#F5A524',
          500: '#FFB547',
          600: '#8A5500',
          700: '#8A5500',
          800: '#6B4200',
        },
        info: INFO,
        blue: INFO,
      },
      textColor: {
        brand: {
          primary: WK['orange-text'],
          orange: WK['orange-text'],
          'orange-light': WK['orange-text'],
          'orange-vivid': WK['orange-text'],
          'orange-deep': WK['orange-text'],
          blue: WK['orange-text'],
          'blue-alt': WK['orange-text'],
          sky: WK['orange-text'],
        },
        orange: {
          400: WK['orange-text'],
          500: WK['orange-text'],
        },
        amber: {
          400: '#8A5500',
          500: '#8A5500',
        },
        warning: {
          500: '#8A5500',
        },
      },
      fontFamily: {
        heading: ['Poppins', 'system-ui', 'sans-serif'],
        body: ['Poppins', 'system-ui', 'sans-serif'],
        ui: ['Poppins', 'system-ui', 'sans-serif'],
        sans: ['Poppins', 'system-ui', '-apple-system', 'BlinkMacSystemFont', '"Segoe UI"', 'Roboto', 'sans-serif'],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'Consolas', 'monospace'],
      },
      borderRadius: {
        card: '16px',
        panel: '24px',
      },
      animation: {
        'fade-in': 'fadeIn 0.3s ease-out',
        'slide-up': 'slideUp 0.3s cubic-bezier(0.22, 1, 0.36, 1)',
        'pulse-subtle': 'pulseSubtle 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'float': 'float 8s ease-in-out infinite',
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
        'soft': '0 1px 4px 0 rgba(0, 0, 0, 0.16)',
        'card': '0 1px 12px 0 rgba(0, 0, 0, 0.16)',
        'glass': '0 1px 12px 0 rgba(0, 0, 0, 0.16)',
        'glass-lg': '0 10px 30px -6px rgba(0, 0, 0, 0.22)',
        'glass-inset': 'none',
        'premium': '0 1px 12px 0 rgba(0, 0, 0, 0.16)',
        'hover': '0 4px 18px 0 rgba(0, 0, 0, 0.18)',
        'inner-soft': 'none',
        'brand': '0 3px 0 #D9661A',
        'glow-orange': '0 3px 0 #D9661A',
        'glow-blue': '0 1px 4px 0 rgba(0, 0, 0, 0.16)',
        'glow-sky': '0 1px 4px 0 rgba(0, 0, 0, 0.16)',
      },
      backdropBlur: {
        xs: '4px',
        '3xl': '40px',
      },
      backgroundImage: {
        'brand-gradient': CHROME,
        'brand-gradient-soft': 'linear-gradient(120deg, #FFF7EE 0%, #FFE7CF 100%)',
        'wizklub-hero': 'linear-gradient(120deg, #02344F 0%, #0B4A6B 100%)',
        'wk-chrome': CHROME,
        'wk-promo': 'linear-gradient(120deg, #02344F 0%, #0B4A6B 100%)',
        'mesh': 'none',
      },
    },
  },
  plugins: [],
}
