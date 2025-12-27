/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/**/*.{astro,html,js,ts,jsx,tsx,md,mdx}',
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // OneKey 风格配色（绿色主题，灰白色背景）
        onekey: {
          dark: {
            primary: '#F5F5F5',      // 主背景：浅灰白色
            secondary: '#FFFFFF',    // 次要背景：纯白色
            tertiary: '#E5E5E5',     // 第三级背景：浅灰色
          },
          accent: {
            green: '#00FF88',      // 主绿色（霓虹绿）
            greenLight: '#00FFAA', // 浅绿色
            greenDark: '#00CC6A',  // 深绿色
            blue: '#3B82F6',
            purple: '#8B5CF6',
            neon: '#00FF88',        // 使用绿色替代原来的青色
          },
          text: {
            primary: '#1A1A1A',     // 主文字：深灰色（在浅色背景上）
            secondary: '#4A4A4A',    // 次要文字：中灰色
            muted: '#6B6B6B',       // 弱化文字：浅灰色
          },
        },
      },
      fontFamily: {
        // 默认字体：中文使用方正仿宋，英文和数字使用 Georgia
        sans: ['Georgia', 'FangSong', 'STFangSong', 'FangSong_GB2312', 'STFangsong', 'serif'],
        // 中文专用字体
        chinese: ['FangSong', 'STFangSong', 'FangSong_GB2312', 'STFangsong', 'serif'],
        // 英文和数字专用字体
        english: ['Georgia', 'serif'],
        // 数字字体：使用 Georgia 衬线字体
        mono: ['Georgia', '"Times New Roman"', 'serif'],
      },
      fontSize: {
        // 字体大小规范：美观、大方、统一
        'xs': ['0.75rem', { lineHeight: '1.5' }],      // 12px - 辅助文字
        'sm': ['0.875rem', { lineHeight: '1.5' }],     // 14px - 小号文字
        'base': ['1rem', { lineHeight: '1.6' }],        // 16px - 基础文字
        'lg': ['1.125rem', { lineHeight: '1.6' }],     // 18px - 大号文字
        'xl': ['1.25rem', { lineHeight: '1.5' }],      // 20px - 标题
        '2xl': ['1.5rem', { lineHeight: '1.4' }],      // 24px - 大标题
        '3xl': ['1.875rem', { lineHeight: '1.3' }],    // 30px - 超大标题
        '4xl': ['2.25rem', { lineHeight: '1.2' }],     // 36px - 特大标题
        '5xl': ['3rem', { lineHeight: '1.1' }],        // 48px - 最大标题
      },
      backgroundImage: {
        'gradient-neon': 'linear-gradient(135deg, #00FF88 0%, #00CC6A 50%, #00FFAA 100%)',
        'gradient-green': 'linear-gradient(135deg, #00FF88 0%, #00CC6A 100%)',
        'gradient-dark': 'linear-gradient(135deg, #F5F5F5 0%, #FFFFFF 100%)',
      },
      backdropBlur: {
        xs: '2px',
      },
    },
  },
  plugins: [],
};

