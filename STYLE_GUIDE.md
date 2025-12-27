# 样式规范使用指南

本文档描述了整个平台的统一样式规范，所有模块应遵循此规范以确保 UI 一致性。

## 📚 快速开始

```typescript
import {
  FONTS,
  HEADING_STYLES,
  TEXT_COLORS,
  STATUS_COLORS,
  CARD_STYLES,
  BUTTON_STYLES,
  formatNumber,
  formatPercent,
  formatNumberStyled,
  formatPercentStyled,
} from '@/lib/styles';
```

## 🎨 字体规范

### 数字和英文
所有数字和英文应使用 **Georgia** 衬线字体：

```tsx
// 数字
<span className={FONTS.number}>1,234.56</span>
// 或使用 Tailwind 类
<span className="font-mono">1,234.56</span>

// 英文标题
<h1 className={FONTS.english}>My Title</h1>
```

### 中文
中文默认使用仿宋字体（body 默认），通常不需要额外指定：

```tsx
<p>中文内容</p>
```

## 📏 字体大小规范

| 用途 | Tailwind 类 | 实际大小 | 使用场景 |
|------|-----------|---------|---------|
| 辅助文字 | `text-xs` | 12px | 标签、提示文字 |
| 小号文字 | `text-sm` | 14px | 次要信息 |
| 基础文字 | `text-base` | 16px | 正文（默认） |
| 大号文字 | `text-lg` | 18px | 强调文字 |
| 标题 | `text-xl` | 20px | H2 标题 |
| 大标题 | `text-2xl` | 24px | H1 标题 |
| 超大标题 | `text-3xl` | 30px | 页面主标题 |

## 📝 标题样式规范

所有模块标题应遵循以下规范：
- ✅ **居中显示** (`text-center`)
- ✅ **加粗** (`font-bold`)
- ✅ **字体大小比所在模块的其他文字大 2 号**

```tsx
// H1: 页面主标题
<h1 className={HEADING_STYLES.h1}>股票组合模拟收益率回测</h1>
// 等同于: text-2xl font-bold text-onekey-text-primary text-center mb-4

// H2: 区块标题
<h2 className={HEADING_STYLES.h2}>回测结果</h2>
// 等同于: text-xl font-bold text-onekey-text-primary text-center mb-4

// H3: 子标题
<h3 className={HEADING_STYLES.h3}>组合成分</h3>
// 等同于: text-lg font-bold text-onekey-text-primary
```

## 🔢 数字格式化

### 基础格式化函数

```typescript
import { formatNumber, formatPercent, formatCurrency } from '@/lib/styles';

// 千分位 + 两位小数
formatNumber(1234.567) // "1,234.57"
formatNumber(1234.567, 3) // "1,234.567"

// 百分比（带符号）
formatPercent(15.5) // "+15.50%"
formatPercent(-5.2) // "-5.20%"

// 货币
formatCurrency(1234.56) // "$1,234.56"
formatCurrency(1234.56, '¥') // "¥1,234.56"
```

### 带样式的格式化（用于 innerHTML）

```typescript
import { formatNumberStyled, formatPercentStyled } from '@/lib/styles';

// 自动添加等宽字体类
formatNumberStyled(1234.56)
// '<span class="font-mono">1,234.56</span>'

// 自动添加等宽字体 + 颜色
formatPercentStyled(15.5) // 正数：绿色
// '<span class="font-mono text-green-600">+15.50%</span>'

formatPercentStyled(-5.2) // 负数：红色
// '<span class="font-mono text-red-500">-5.20%</span>'
```

### 在 JavaScript 中使用

```javascript
// 在 stocks.astro 的 <script> 中
import { formatNumber, formatPercent, FONTS, TEXT_COLORS } from '@/lib/styles';

function renderResults(data) {
  const fmt = (n, decimals = 2) => formatNumber(n, decimals);
  const fmtPct = (n) => formatPercent(n);
  
  return `
    <div class="${FONTS.number} text-2xl font-bold ${TEXT_COLORS.positive}">
      ${fmtPct(data.cagr)}
    </div>
  `;
}
```

## 🎨 颜色规范

### 文字颜色

```tsx
<span className={TEXT_COLORS.primary}>主要文字</span>      // #1A1A1A
<span className={TEXT_COLORS.secondary}>次要文字</span>  // #4A4A4A
<span className={TEXT_COLORS.muted}>弱化文字</span>      // #6B6B6B
<span className={TEXT_COLORS.positive}>正收益</span>     // 绿色
<span className={TEXT_COLORS.negative}>负收益</span>     // 红色
```

### 状态标签颜色

```tsx
// Stable：绿色背景
<span className={BADGE_STYLES.stable}>stable</span>

// Beta：红色背景
<span className={BADGE_STYLES.beta}>beta</span>

// Alpha：灰色背景（默认）
<span className={BADGE_STYLES.alpha}>alpha</span>
```

## 🎴 组件样式

### 卡片

```tsx
// 基础卡片（玻璃效果）
<div className={CARD_STYLES.base}>
  内容
</div>

// 白色背景卡片
<div className={CARD_STYLES.white}>
  内容
</div>

// 半透明白色背景卡片
<div className={CARD_STYLES.white50}>
  内容
</div>
```

### 按钮

```tsx
// 主要按钮（渐变绿色）
<button className={BUTTON_STYLES.primary}>提交</button>

// 次要按钮（白色 + 边框）
<button className={BUTTON_STYLES.secondary}>取消</button>

// 危险按钮（红色）
<button className={BUTTON_STYLES.danger}>删除</button>
```

### 输入框

```tsx
// 普通输入框
<input className={INPUT_STYLES.base} />

// 数字输入框（等宽字体）
<input className={INPUT_STYLES.number} type="number" />
```

## 📐 布局规范

### 网格布局

```tsx
// 两列网格（响应式）
<div className={GRID_STYLES.cols2}>
  <div>列1</div>
  <div>列2</div>
</div>

// 四列网格（响应式）
<div className={GRID_STYLES.cols4}>
  <div>列1</div>
  <div>列2</div>
  <div>列3</div>
  <div>列4</div>
</div>
```

### 间距

```tsx
// 区块间距
<div className={SPACING.section}>内容</div>

// 卡片间距
<div className={`grid ${SPACING.card}`}>
  <div>卡片1</div>
  <div>卡片2</div>
</div>
```

## 🔧 工具函数

### 组合样式类

```typescript
import { cn } from '@/lib/styles';

// 组合多个类名
const className = cn(
  CARD_STYLES.base,
  'mt-4',
  'custom-class',
  condition && 'conditional-class'
);
```

## 📋 完整示例

### 示例：指标卡片

```tsx
import {
  CARD_STYLES,
  FONTS,
  TEXT_COLORS,
  formatPercent,
  formatNumber,
} from '@/lib/styles';

function MetricCard({ label, value, isPercent = false }) {
  return (
    <div className={CARD_STYLES.white}>
      <div className={`text-xs ${TEXT_COLORS.muted} uppercase tracking-wide mb-1`}>
        {label}
      </div>
      <div className={`text-2xl font-bold ${FONTS.number} ${value >= 0 ? TEXT_COLORS.positive : TEXT_COLORS.negative}`}>
        {isPercent ? formatPercent(value) : formatNumber(value)}
      </div>
    </div>
  );
}
```

### 示例：动态生成 HTML（Astro）

```javascript
// 在 <script> 标签中
import {
  CARD_STYLES,
  HEADING_STYLES,
  FONTS,
  TEXT_COLORS,
  formatNumberStyled,
  formatPercentStyled,
} from '@/lib/styles';

function renderResults(data) {
  return `
    <div class="${CARD_STYLES.base}">
      <h2 class="${HEADING_STYLES.h2}">回测结果</h2>
      
      <div class="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div class="${CARD_STYLES.white}">
          <div class="text-xs ${TEXT_COLORS.muted}">年化收益 CAGR</div>
          <div class="text-2xl font-bold">${formatPercentStyled(data.cagr)}</div>
        </div>
        
        <div class="${CARD_STYLES.white}">
          <div class="text-xs ${TEXT_COLORS.muted}">总收益</div>
          <div class="text-2xl font-bold">${formatPercentStyled(data.totalReturn)}</div>
        </div>
      </div>
    </div>
  `;
}
```

## ✅ 检查清单

在创建新模块或修改现有模块时，请确保：

- [ ] 所有数字使用 `font-mono` 或 `FONTS.number`
- [ ] 所有标题使用 `HEADING_STYLES.h1/h2/h3`
- [ ] 数字格式化使用 `formatNumber()` 或 `formatPercent()`
- [ ] 状态标签使用 `BADGE_STYLES.stable/beta/alpha`
- [ ] 卡片使用 `CARD_STYLES.base/white/white50`
- [ ] 按钮使用 `BUTTON_STYLES.primary/secondary/danger`
- [ ] 颜色使用 `TEXT_COLORS.*` 常量

## 📖 参考

- 样式规范源码：`src/lib/styles.ts`
- 使用示例：`src/lib/styles.example.ts`
- Tailwind 配置：`tailwind.config.js`
- 全局样式：`src/styles/global.css`

