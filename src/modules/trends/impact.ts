import type { TrendEventCluster } from '@/modules/trends/cluster';
import { openAICompatibleChatCompletion } from '@/modules/in-depth-analysis/llm/openai-compatible-client';

type Impact = NonNullable<TrendEventCluster['impact']>;

function clamp(n: number, min: number, max: number): number {
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, n));
}

function heuristicImpact(c: TrendEventCluster): Impact {
  const text = `${c.label}\n${(c.top_items || []).map((x) => x.title).join('\n')}`.toLowerCase();

  const bearish = [
    'crash', 'sell-off', 'selloff', 'recession', 'bankruptcy', 'default', 'lawsuit', 'ban', 'hack',
    '跌', '暴跌', '崩盘', '衰退', '破产', '违约', '诉讼', '禁令', '黑客', '裁员',
    'rate hike', 'hike', 'higher rates', '加息',
  ];
  const bullish = [
    'record high', 'surge', 'rally', 'beat', 'approval', 'partnership', 'funding', 'launch', 'release', 'breakthrough',
    '新高', '大涨', '反弹', '超预期', '获批', '合作', '融资', '发布', '上线', '突破',
    'rate cut', 'cut', '降息',
  ];
  const neutral = ['rumor', 'leak', 'trailer', '预告', '路透', '曝', '传闻'];

  const hit = (arr: string[]) => arr.reduce((n, k) => n + (text.includes(k) ? 1 : 0), 0);
  const b = hit(bearish);
  const u = hit(bullish);
  const n = hit(neutral);

  if (b === 0 && u === 0) {
    return { direction: n > 0 ? 'neutral' : 'unknown', confidence: n > 0 ? 0.45 : 0.35, rationale: '缺少明确的正/负向信号，暂不判定。' };
  }
  if (b > u) return { direction: 'bearish', confidence: clamp(0.55 + 0.08 * (b - u), 0.55, 0.85), rationale: '标题/样本出现偏负向风险词（例如下跌、加息、诉讼等）。' };
  if (u > b) return { direction: 'bullish', confidence: clamp(0.55 + 0.08 * (u - b), 0.55, 0.85), rationale: '标题/样本出现偏正向催化词（例如发布、获批、融资等）。' };
  return { direction: 'neutral', confidence: 0.5, rationale: '正负信号接近，按中性处理。' };
}

function safeJsonParse<T>(s: string): T | null {
  try {
    return JSON.parse(s) as T;
  } catch {
    const m = s.match(/\[[\s\S]*\]/);
    if (!m) return null;
    try {
      return JSON.parse(m[0]) as T;
    } catch {
      return null;
    }
  }
}

export async function assessTrendEventImpact(opts: {
  env: { LLM_BASE_URL?: string; LLM_API_KEY?: string; LLM_MODEL?: string };
  clusters: TrendEventCluster[];
}): Promise<TrendEventCluster[]> {
  const clusters = Array.isArray(opts.clusters) ? opts.clusters : [];
  if (clusters.length === 0) return clusters;

  const baseUrl = String(opts.env.LLM_BASE_URL || '').trim();
  const apiKey = String(opts.env.LLM_API_KEY || '').trim();
  const model = String(opts.env.LLM_MODEL || '').trim();

  // Heuristic fallback
  if (!baseUrl || !apiKey || !model) {
    return clusters.map((c) => ({ ...c, impact: heuristicImpact(c) }));
  }

  const payload = clusters.slice(0, 12).map((c, idx) => ({
    idx,
    theme: c.theme,
    label: c.label,
    sources: c.sources,
    top_items: (c.top_items || []).slice(0, 3).map((x) => ({ title: x.title, source: x.source })),
  }));

  const system = [
    'You are a conservative market/news impact analyst.',
    'Given short trend clusters, classify their likely impact direction.',
    'Output MUST be valid JSON array only (no markdown).',
  ].join('\n');

  const user = [
    'For each cluster, return an object:',
    '{ "idx": 0, "direction": "bullish|bearish|neutral|unknown", "confidence": 0..1, "rationale": "Chinese <= 25 words" }',
    'Be conservative: if unclear, use unknown with low confidence.',
    '',
    'Data:',
    JSON.stringify(payload),
  ].join('\n');

  let content = '';
  try {
    content = await openAICompatibleChatCompletion({
      baseUrl,
      apiKey,
      model,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      temperature: 0.2,
      maxTokens: 600,
      timeoutMs: 20000,
    });
  } catch {
    return clusters.map((c) => ({ ...c, impact: heuristicImpact(c) }));
  }

  const parsed = safeJsonParse<Array<{ idx: number; direction: Impact['direction']; confidence: number; rationale: string }>>(content);
  if (!parsed) return clusters.map((c) => ({ ...c, impact: heuristicImpact(c) }));

  const byIdx = new Map<number, Impact>();
  for (const row of parsed) {
    if (!row || typeof row.idx !== 'number') continue;
    const dir =
      row.direction === 'bullish' || row.direction === 'bearish' || row.direction === 'neutral' || row.direction === 'unknown'
        ? row.direction
        : 'unknown';
    byIdx.set(row.idx, {
      direction: dir,
      confidence: clamp(Number(row.confidence), 0, 1),
      rationale: String(row.rationale || '').slice(0, 80),
    });
  }

  return clusters.map((c, i) => ({ ...c, impact: byIdx.get(i) ?? heuristicImpact(c) }));
}


