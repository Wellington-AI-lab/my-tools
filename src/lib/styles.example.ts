/**
 * 样式规范使用示例
 * 
 * 本文件展示了如何在各个模块中使用统一的样式规范
 * 注意：这是示例文件，不会被编译到最终代码中
 */

import {
  FONTS,
  HEADING_STYLES,
  TEXT_COLORS,
  STATUS_COLORS,
  CARD_STYLES,
  BUTTON_STYLES,
  BADGE_STYLES,
  formatNumber,
  formatPercent,
  formatNumberStyled,
  formatPercentStyled,
  cn,
} from '@/lib/styles';

// ============================================================================
// 示例 1: 标题使用
// ============================================================================

export function ExampleHeading() {
  return `
    <!-- H1: 页面主标题 -->
    <h1 class="${HEADING_STYLES.h1}">股票组合模拟收益率回测</h1>
    
    <!-- H2: 区块标题 -->
    <h2 class="${HEADING_STYLES.h2}">回测结果</h2>
    
    <!-- H3: 子标题 -->
    <h3 class="${HEADING_STYLES.h3}">组合成分</h3>
  `;
}

// ============================================================================
// 示例 2: 数字格式化
// ============================================================================

export function ExampleNumberFormatting() {
  const value = 1234.567;
  const percent = 15.5;
  
  return `
    <!-- 基础格式化 -->
    <div class="${FONTS.number}">${formatNumber(value)}</div>
    <!-- 输出: 1,234.57 -->
    
    <!-- 百分比格式化 -->
    <div class="${FONTS.number} ${TEXT_COLORS.positive}">${formatPercent(percent)}</div>
    <!-- 输出: +15.50% -->
    
    <!-- 带样式的格式化（用于 innerHTML） -->
    <div>${formatNumberStyled(value)}</div>
    <!-- 输出: <span class="font-mono">1,234.57</span> -->
    
    <div>${formatPercentStyled(percent)}</div>
    <!-- 输出: <span class="font-mono text-green-600">+15.50%</span> -->
  `;
}

// ============================================================================
// 示例 3: 卡片和按钮
// ============================================================================

export function ExampleCards() {
  return `
    <!-- 基础卡片 -->
    <div class="${CARD_STYLES.base}">
      <h2 class="${HEADING_STYLES.h2}">标题</h2>
      <p class="${TEXT_COLORS.secondary}">内容</p>
    </div>
    
    <!-- 白色背景卡片 -->
    <div class="${CARD_STYLES.white}">
      <div class="text-xs ${TEXT_COLORS.muted}">标签</div>
      <div class="${FONTS.number} text-2xl font-bold">${formatNumber(1234.56)}</div>
    </div>
    
    <!-- 按钮 -->
    <button class="${BUTTON_STYLES.primary}">提交</button>
    <button class="${BUTTON_STYLES.secondary}">取消</button>
  `;
}

// ============================================================================
// 示例 4: 状态标签
// ============================================================================

export function ExampleBadges() {
  return `
    <!-- Stable 状态 -->
    <span class="${BADGE_STYLES.stable}">stable</span>
    
    <!-- Beta 状态 -->
    <span class="${BADGE_STYLES.beta}">beta</span>
    
    <!-- Alpha 状态 -->
    <span class="${BADGE_STYLES.alpha}">alpha</span>
  `;
}

// ============================================================================
// 示例 5: 组合样式类
// ============================================================================

export function ExampleCombinedStyles() {
  // 使用 cn() 函数组合多个样式类
  const cardClass = cn(
    CARD_STYLES.base,
    'mt-4', // 额外的间距
    'custom-class' // 自定义类
  );
  
  return `
    <div class="${cardClass}">
      内容
    </div>
  `;
}

// ============================================================================
// 示例 6: 在 JavaScript/TypeScript 中使用（动态生成 HTML）
// ============================================================================

export function ExampleDynamicHTML() {
  const data = {
    cagr: 15.5,
    totalReturn: 1234.56,
    maxDrawdown: -20.3,
  };
  
  // 生成指标卡片 HTML
  const html = `
    <div class="grid grid-cols-2 md:grid-cols-4 gap-3">
      <div class="${CARD_STYLES.white}">
        <div class="text-xs ${TEXT_COLORS.muted} uppercase tracking-wide mb-1">年化收益 CAGR</div>
        <div class="text-2xl font-bold ${FONTS.number} ${TEXT_COLORS.positive}">
          ${formatPercent(data.cagr)}
        </div>
      </div>
      
      <div class="${CARD_STYLES.white}">
        <div class="text-xs ${TEXT_COLORS.muted} uppercase tracking-wide mb-1">总收益</div>
        <div class="text-2xl font-bold ${FONTS.number} ${TEXT_COLORS.positive}">
          ${formatPercent(data.totalReturn)}
        </div>
      </div>
      
      <div class="${CARD_STYLES.white}">
        <div class="text-xs ${TEXT_COLORS.muted} uppercase tracking-wide mb-1">最大回撤</div>
        <div class="text-2xl font-bold ${FONTS.number} ${TEXT_COLORS.negative}">
          ${formatNumber(data.maxDrawdown)}%
        </div>
      </div>
    </div>
  `;
  
  return html;
}

