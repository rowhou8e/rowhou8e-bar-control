import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './src/app/**/*.{ts,tsx}',
    './src/components/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        // ระบบสี status ตามสเปก: เขียว=ปกติ, เหลือง=ใกล้ถึงกำหนด, แดง=ห้ามใช้/เร่งด่วน, เทา=ยังไม่ดำเนินการ
        status: {
          ok: '#16A34A',
          okBg: '#DCFCE7',
          warn: '#D97706',
          warnBg: '#FEF3C7',
          danger: '#DC2626',
          dangerBg: '#FEE2E2',
          idle: '#6B7280',
          idleBg: '#F3F4F6',
        },
        brand: {
          50: '#FAFAFA',
          100: '#F0F0F0',
          200: '#E0E0E0',
          300: '#C7C7C7',
          400: '#9E9E9E',
          500: '#757575',
          600: '#424242',
          700: '#2E2E2E',
          800: '#1A1A1A',
          900: '#0D0D0D',
        },
      },
      fontFamily: {
        sans: ['var(--font-noto-thai)', 'system-ui', 'sans-serif'],
      },
      maxWidth: {
        app: '480px',
      },
      boxShadow: {
        card: '0 1px 3px 0 rgba(0,0,0,0.08), 0 1px 2px -1px rgba(0,0,0,0.06)',
        nav: '0 -1px 8px 0 rgba(0,0,0,0.06)',
      },
    },
  },
  plugins: [],
};

export default config;
