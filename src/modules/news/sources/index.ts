/**
 * 数据源适配器汇总
 */

export { wallstreetcnAdapter } from './wallstreetcn';
export { jin10Adapter } from './jin10';
export { xueqiuAdapter } from './xueqiu';
export { thepaperAdapter } from './thepaper';
export { ftchineseAdapter } from './ftchinese';
export { kr36Adapter } from './36kr';
export { hackernewsAdapter } from './hackernews';
export { sspaiAdapter } from './sspai';

import type { NewsSourceAdapter } from '../types';
import { wallstreetcnAdapter } from './wallstreetcn';
import { jin10Adapter } from './jin10';
import { xueqiuAdapter } from './xueqiu';
import { thepaperAdapter } from './thepaper';
import { ftchineseAdapter } from './ftchinese';
import { kr36Adapter } from './36kr';
import { hackernewsAdapter } from './hackernews';
import { sspaiAdapter } from './sspai';

// 所有适配器列表
export const ALL_ADAPTERS: NewsSourceAdapter[] = [
  wallstreetcnAdapter,
  jin10Adapter,
  xueqiuAdapter,
  thepaperAdapter,
  ftchineseAdapter,
  kr36Adapter,
  hackernewsAdapter,
  sspaiAdapter,
];

// 按主题分组的推荐源
export const ADAPTERS_BY_THEME = {
  finance: [wallstreetcnAdapter, jin10Adapter, xueqiuAdapter],
  economy: [thepaperAdapter, ftchineseAdapter, wallstreetcnAdapter],
  ai: [kr36Adapter, hackernewsAdapter, sspaiAdapter],
} as const;
