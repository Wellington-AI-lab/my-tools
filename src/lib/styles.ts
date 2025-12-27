/**
 * 统一样式规范系统
 * 
 * 本文件定义了整个平台的字体、颜色、排版、组件样式等统一规范
 * 所有模块应遵循此规范以确保 UI 一致性
 */

// ============================================================================
// 字体规范
// ============================================================================

/**
 * 字体族定义
 * 
 * ⚠️ 重要：所有数字必须使用 Georgia 字体（强制要求）
 */
export const FONTS = {
  /** 
   * 数字：Georgia 衬线字体（强制）
   * 使用方式：<span className={FONTS.number}>1234.56</span>
   * 或直接使用 Tailwind 类：<span className="font-mono">1234.56</span>
   */
  number: 'font-mono', // Tailwind: Georgia, 'Times New Roman', serif (强制)
  /** 英文：Georgia 衬线字体 */
  english: 'font-english', // Tailwind: Georgia, serif
  /** 中文：仿宋字体 */
  chinese: 'font-chinese', // Tailwind: FangSong, STFangSong, ...
  /** 默认：继承 body 字体 */
  default: '',
} as const;

/**
 * 字体大小规范（相对于基础文字 base）
 */
export const FONT_SIZES = {
  /** 辅助文字：12px */
  xs: 'text-xs',
  /** 小号文字：14px */
  sm: 'text-sm',
  /** 基础文字：16px（默认） */
  base: 'text-base',
  /** 大号文字：18px */
  lg: 'text-lg',
  /** 标题：20px */
  xl: 'text-xl',
  /** 大标题：24px */
  '2xl': 'text-2xl',
  /** 超大标题：30px */
  '3xl': 'text-3xl',
  /** 特大标题：36px */
  '4xl': 'text-4xl',
  /** 最大标题：48px */
  '5xl': 'text-5xl',
} as const;

/**
 * 标题样式规范
 * - 居中显示
 * - 加粗
 * - 字体大小比所在模块的其他文字大 2 号
 */
export const HEADING_STYLES = {
  /** H1 样式：2xl + 居中 + 加粗 + 下边距 */
  h1: 'text-2xl font-bold text-onekey-text-primary text-center mb-4',
  /** H2 样式：xl + 居中 + 加粗 + 下边距 */
  h2: 'text-xl font-bold text-onekey-text-primary text-center mb-4',
  /** H3 样式：lg + 加粗 */
  h3: 'text-lg font-bold text-onekey-text-primary',
} as const;

// ============================================================================
// 颜色规范
// ============================================================================

/**
 * 文字颜色
 */
export const TEXT_COLORS = {
  primary: 'text-onekey-text-primary', // #1A1A1A
  secondary: 'text-onekey-text-secondary', // #4A4A4A
  muted: 'text-onekey-text-muted', // #6B6B6B
  /** 正收益：绿色 */
  positive: 'text-green-600',
  /** 负收益：红色 */
  negative: 'text-red-500',
  /** 警告：红色 */
  warning: 'text-red-500',
} as const;

/**
 * 状态标签颜色
 */
export const STATUS_COLORS = {
  /** stable：绿色背景 */
  stable: 'bg-green-100 text-green-700 border-green-300',
  /** beta：红色背景 */
  beta: 'bg-red-100 text-red-700 border-red-300',
  /** alpha：灰色背景（默认） */
  alpha: 'bg-onekey-dark-tertiary text-onekey-text-secondary border-black/10',
} as const;

// ============================================================================
// 数字格式化
// ============================================================================

/**
 * 数字格式化：千分位逗号 + 两位小数
 * 
 * ⚠️ 重要：返回的数字字符串必须配合 `font-mono` 或 `FONTS.number` 使用
 * 以确保显示为 Georgia 字体（强制要求）
 * 
 * @param n 数字
 * @param decimals 小数位数，默认 2
 * @returns 格式化后的字符串，如 "1,234.56"
 * 
 * @example
 * formatNumber(1234.567) // "1,234.57"
 * formatNumber(1234.567, 3) // "1,234.567"
 * 
 * // 使用时必须配合字体类：
 * <span className={FONTS.number}>{formatNumber(1234.56)}</span>
 */
export function formatNumber(n: number, decimals: number = 2): string {
  if (!Number.isFinite(n)) return '0.00';
  return n.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

/**
 * 百分比格式化：带符号 + 千分位 + 两位小数
 * 
 * @param n 数字（如 15.5 表示 15.5%）
 * @returns 格式化后的字符串，如 "+15.50%" 或 "-5.20%"
 * 
 * @example
 * formatPercent(15.5) // "+15.50%"
 * formatPercent(-5.2) // "-5.20%"
 */
export function formatPercent(n: number, decimals: number = 2): string {
  const val = Number.isFinite(n) ? n : 0;
  const sign = val >= 0 ? '+' : '';
  return `${sign}${formatNumber(val, decimals)}%`;
}

/**
 * 货币格式化：千分位 + 两位小数 + 货币符号
 * 
 * @param n 金额
 * @param symbol 货币符号，默认 "$"
 * @returns 格式化后的字符串，如 "$1,234.56"
 */
export function formatCurrency(n: number, symbol: string = '$'): string {
  return `${symbol}${formatNumber(n, 2)}`;
}

// ============================================================================
// 组件样式规范
// ============================================================================

/**
 * 卡片样式
 */
export const CARD_STYLES = {
  /** 基础卡片：玻璃效果 + 圆角 + 内边距 */
  base: 'glass-effect rounded-xl p-6',
  /** 白色背景卡片 */
  white: 'bg-white rounded-xl p-4 border border-black/5 shadow-sm',
  /** 半透明白色背景卡片 */
  white50: 'bg-white/50 rounded-xl p-4 border border-black/5',
} as const;

/**
 * 按钮样式
 */
export const BUTTON_STYLES = {
  /** 主要按钮：渐变绿色背景 */
  primary: 'w-full py-2.5 px-4 bg-gradient-neon text-white font-bold rounded-lg hover:opacity-90 transition-opacity',
  /** 次要按钮：白色背景 + 边框 */
  secondary: 'text-sm px-3 py-1.5 rounded-full border border-black/10 bg-white hover:border-onekey-accent-green/30',
  /** 危险按钮：红色 */
  danger: 'text-sm px-3 py-1.5 rounded-full border border-red-300 bg-red-50 text-red-700 hover:bg-red-100',
} as const;

/**
 * 状态标签样式
 */
const BADGE_BASE = 'text-xs px-2 py-0.5 rounded-full border';
export const BADGE_STYLES = {
  base: BADGE_BASE,
  stable: `${BADGE_BASE} ${STATUS_COLORS.stable}`,
  beta: `${BADGE_BASE} ${STATUS_COLORS.beta}`,
  alpha: `${BADGE_BASE} ${STATUS_COLORS.alpha}`,
} as const;

/**
 * 输入框样式
 */
export const INPUT_STYLES = {
  base: 'w-full px-4 py-2 bg-white border border-black/10 rounded-lg focus:outline-none focus:border-onekey-accent-green',
  /** 数字输入框：等宽字体 */
  number: 'w-full px-4 py-2 bg-white border border-black/10 rounded-lg font-mono focus:outline-none focus:border-onekey-accent-green',
} as const;

// ============================================================================
// 布局规范
// ============================================================================

/**
 * 间距规范
 */
export const SPACING = {
  /** 组件间距 */
  section: 'mt-4',
  /** 卡片间距 */
  card: 'gap-4',
  /** 内部元素间距 */
  inner: 'space-y-4',
} as const;

/**
 * 网格布局
 */
export const GRID_STYLES = {
  /** 两列网格（响应式：移动端单列，桌面端两列） */
  cols2: 'grid grid-cols-1 md:grid-cols-2 gap-4',
  /** 四列网格（响应式：移动端两列，桌面端四列） */
  cols4: 'grid grid-cols-2 md:grid-cols-4 gap-3',
} as const;

// ============================================================================
// 工具函数：组合样式类
// ============================================================================

/**
 * 组合多个 Tailwind 类名
 * 
 * @param classes 类名数组
 * @returns 组合后的类名字符串
 * 
 * @example
 * cn('text-xl', 'font-bold', 'text-center') // "text-xl font-bold text-center"
 */
export function cn(...classes: (string | undefined | null | false)[]): string {
  return classes.filter(Boolean).join(' ');
}

/**
 * 数字显示样式：Georgia 字体（强制）+ 格式化
 * 
 * ⚠️ 重要：此函数自动应用 Georgia 字体，确保所有数字统一使用 Georgia
 * 
 * @param n 数字
 * @param decimals 小数位数
 * @returns 格式化后的 HTML 字符串（带 Georgia 字体类）
 * 
 * @example
 * formatNumberStyled(1234.56) // '<span class="font-mono">1,234.56</span>'
 * // 渲染后数字会强制使用 Georgia 字体
 */
export function formatNumberStyled(n: number, decimals: number = 2): string {
  return `<span class="${FONTS.number}">${formatNumber(n, decimals)}</span>`;
}

/**
 * 百分比显示样式：等宽字体 + 格式化 + 颜色
 * 
 * @param n 数字
 * @param decimals 小数位数
 * @returns 格式化后的 HTML 字符串（带样式类和颜色）
 */
export function formatPercentStyled(n: number, decimals: number = 2): string {
  const val = Number.isFinite(n) ? n : 0;
  const colorClass = val >= 0 ? TEXT_COLORS.positive : TEXT_COLORS.negative;
  return `<span class="${FONTS.number} ${colorClass}">${formatPercent(n, decimals)}</span>`;
}

// ============================================================================
// 导出规范文档（供开发者参考）
// ============================================================================

/**
 * 样式规范使用指南
 * 
 * ## 字体使用
 * ```tsx
 * // 数字
 * <span className={FONTS.number}>1234.56</span>
 * 
 * // 英文
 * <h1 className={FONTS.english}>My Title</h1>
 * 
 * // 中文（通常不需要，默认就是中文字体）
 * <p className={FONTS.chinese}>中文内容</p>
 * ```
 * 
 * ## 标题使用
 * ```tsx
 * <h1 className={HEADING_STYLES.h1}>页面标题</h1>
 * <h2 className={HEADING_STYLES.h2}>区块标题</h2>
 * ```
 * 
 * ## 数字格式化
 * ```tsx
 * // 基础格式化
 * formatNumber(1234.56) // "1,234.56"
 * formatPercent(15.5) // "+15.50%"
 * 
 * // 带样式的格式化（用于 innerHTML）
 * formatNumberStyled(1234.56) // '<span class="font-mono">1,234.56</span>'
 * formatPercentStyled(15.5) // '<span class="font-mono text-green-600">+15.50%</span>'
 * ```
 * 
 * ## 组件样式
 * ```tsx
 * // 卡片
 * <div className={CARD_STYLES.base}>内容</div>
 * 
 * // 按钮
 * <button className={BUTTON_STYLES.primary}>提交</button>
 * 
 * // 状态标签
 * <span className={cn(BADGE_STYLES.base, STATUS_COLORS.stable)}>stable</span>
 * ```
 */
export const STYLE_GUIDE = {
  fonts: FONTS,
  fontSizes: FONT_SIZES,
  headingStyles: HEADING_STYLES,
  textColors: TEXT_COLORS,
  statusColors: STATUS_COLORS,
  cardStyles: CARD_STYLES,
  buttonStyles: BUTTON_STYLES,
  badgeStyles: BADGE_STYLES,
  inputStyles: INPUT_STYLES,
  spacing: SPACING,
  gridStyles: GRID_STYLES,
} as const;

