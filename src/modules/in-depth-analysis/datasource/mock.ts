import type { RednoteRawItem, RednoteTimeRangePreset } from '@/modules/in-depth-analysis/types';

// 内联 mock 数据，避免依赖外部 JSON 文件
const MOCK_ITEMS: RednoteRawItem[] = [
  {
    id: 'mock-1',
    title: 'AI 工具推荐：提升效率的 10 个实用技巧',
    content: '分享几个我常用的 AI 工具，帮助提升工作效率。',
    author: '科技博主',
    likes: 1234,
    collects: 567,
    comments: 89,
    published_at: Date.now() - 3600000,
    tags: ['AI', '效率', '工具'],
  },
  {
    id: 'mock-2',
    title: '前端开发 2024 年趋势分析',
    content: '今年前端领域有哪些新趋势？本文为你详细解读。',
    author: '前端达人',
    likes: 892,
    collects: 345,
    comments: 56,
    published_at: Date.now() - 7200000,
    tags: ['前端', '技术', '趋势'],
  },
  {
    id: 'mock-3',
    title: '理财入门：从零开始学投资',
    content: '新手理财指南，教你如何开始投资理财。',
    author: '财经小助手',
    likes: 2341,
    collects: 1234,
    comments: 234,
    published_at: Date.now() - 10800000,
    tags: ['理财', '投资', '入门'],
  },
];

export async function fetchRednoteRawMock(opts: {
  keyword: string;
  timeRange: RednoteTimeRangePreset;
}): Promise<{ items: RednoteRawItem[] }> {
  const { keyword } = opts;

  // Lightweight keyword match to simulate search.
  const kw = String(keyword || '').trim();
  if (!kw) return { items: MOCK_ITEMS };

  const lowerKw = kw.toLowerCase();
  const filtered = MOCK_ITEMS.filter((it) => {
    const title = String(it.title ?? '');
    const content = String(it.content ?? '');
    const tags = Array.isArray(it.tags) ? it.tags.join(' ') : String(it.tags ?? '');
    const blob = `${title} ${content} ${tags}`.toLowerCase();
    return blob.includes(lowerKw);
  });

  // If keyword finds nothing, return the full dataset to avoid "empty UI" during dev.
  return { items: filtered.length ? filtered : MOCK_ITEMS };
}


