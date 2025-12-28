import type { RednoteFeedCard } from '@/modules/in-depth-analysis/types';
import { openAICompatibleChatCompletion } from '@/modules/in-depth-analysis/llm/openai-compatible-client';

type Stage2Output = {
  authenticity: Array<{
    id: string;
    label: 'real_experience' | 'generic_marketing_copy' | 'unclear';
    rationale: string;
  }>;
  trends: string[];
  insight_markdown: string;
};

function safeJsonParse<T>(s: string): T | null {
  try {
    return JSON.parse(s) as T;
  } catch {
    // Some models wrap JSON in code fences; attempt to extract the first JSON object.
    const m = s.match(/\{[\s\S]*\}/);
    if (!m) return null;
    try {
      return JSON.parse(m[0]) as T;
    } catch {
      return null;
    }
  }
}

function extractKeywords(items: RednoteFeedCard[]): string[] {
  const stop = new Set([
    '我', '你', '他', '她', '它', '我们', '你们', '他们',
    '真的', '就是', '一个', '一下', '这样', '那个', '这个', '可以', '不是', '因为',
    '推荐', '分享', '复盘', '实测', '真实', '有效', '教程',
    '通勤', '冬季', '年末', '预算',
  ]);

  const freq = new Map<string, number>();
  for (const it of items) {
    const text = `${it.title} ${it.content}`.replace(/\s+/g, ' ');
    // Heuristic tokenization for Chinese: prefer tags if present, else use 2-char chunks.
    const fromTags = Array.isArray(it.tags) ? it.tags : [];
    for (const t of fromTags) {
      const k = String(t || '').trim();
      if (k.length >= 2 && !stop.has(k)) freq.set(k, (freq.get(k) ?? 0) + 3);
    }

    const normalized = text.replace(/[^\p{Script=Han}\p{L}\p{N}]+/gu, '');
    for (let i = 0; i < normalized.length - 1; i++) {
      const k = normalized.slice(i, i + 2);
      if (k.length === 2 && !stop.has(k)) freq.set(k, (freq.get(k) ?? 0) + 1);
    }
  }

  return Array.from(freq.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([k]) => k)
    .filter((k) => k.length >= 2)
    .slice(0, 12);
}

function mockAuthenticityLabel(it: RednoteFeedCard): { label: Stage2Output['authenticity'][number]['label']; rationale: string } {
  const blob = `${it.title}\n${it.content}`;
  const marketingSignals = [
    '闭眼入', '全网爆款', '官方同款', '限时', '链接', '评论区', '下单', '私聊', '加V', '领取', '返现',
  ];
  const realSignals = [
    '实测', '对比', '复盘', '记录', '第', '天', '小时', '%', '参数', '坑', '踩过', '摆放', '清洁',
  ];

  const m = marketingSignals.filter((k) => blob.includes(k)).length;
  const r = realSignals.filter((k) => blob.includes(k)).length;
  const exclam = (it.title.match(/!/g) || []).length;

  if (m >= 2 || exclam >= 3) return { label: 'generic_marketing_copy', rationale: '出现明显营销话术/导流信号，真实性存疑。' };
  if (r >= 2) return { label: 'real_experience', rationale: '包含可验证细节（对比/参数/时间/踩坑），更像真实体验。' };
  return { label: 'unclear', rationale: '信息密度一般，缺少强体验证据或强营销信号。' };
}

function mockInsightMarkdown(items: RednoteFeedCard[], trends: string[], keyword: string): string {
  const top = items.slice(0, 5);
  const labels = items.reduce(
    (acc, it) => {
      const l = it.authenticity?.label ?? 'unclear';
      acc[l] = (acc[l] ?? 0) + 1;
      return acc;
    },
    {} as Record<string, number>
  );

  const real = labels.real_experience ?? 0;
  const marketing = labels.generic_marketing_copy ?? 0;
  const unclear = labels.unclear ?? 0;

  const lines: string[] = [];
  lines.push(`## RedNote DeepAgent Insight`);
  lines.push('');
  lines.push(`- **关键词**：${keyword || '（未指定）'} · **样本**：${items.length} 条（已过滤低热/黑名单/重复）`);
  lines.push(`- **真实性画像**：真实体验 ${real} · 营销话术 ${marketing} · 不明确 ${unclear}`);
  lines.push(`- **趋势词（候选）**：${trends.slice(0, 3).join('、') || '（暂无）'}`);
  lines.push('');
  lines.push('### 执行摘要（模拟推理）');
  lines.push(
    `当前信息流的高热内容更偏向“可执行的经验复盘/对比记录”，用户更愿意收藏与转发带有步骤、参数或踩坑总结的帖子。` +
      `需要重点警惕“爆款/闭眼入/评论区链接”等导流式表达，它们往往互动不低但信噪比偏差。` +
      `建议你把趋势词映射到可验证问题（例如：成本、时间、效果区间、对比对象），再用下一轮检索验证稳定性。`
  );
  lines.push('');
  lines.push('### Top Cards（按 HeatScore）');
  for (const c of top) {
    lines.push(`- **${c.title}**（HeatScore ${c.metrics.heatScore}）`);
  }
  return lines.join('\n');
}

export async function stage2Reasoning(opts: {
  env: { LLM_BASE_URL?: string; LLM_API_KEY?: string; LLM_MODEL?: string };
  keyword: string;
  items: RednoteFeedCard[];
}): Promise<{ used: 'llm' | 'mock'; trends: string[]; insight: string; authenticityById: Map<string, Stage2Output['authenticity'][number]> }> {
  const { env, keyword } = opts;
  const items = Array.isArray(opts.items) ? opts.items : [];

  const baseUrl = String(env.LLM_BASE_URL || '').trim();
  const apiKey = String(env.LLM_API_KEY || '').trim();
  const model = String(env.LLM_MODEL || '').trim();

  const candidates = items.slice(0, Math.min(15, items.length));
  const topKeywords = extractKeywords(candidates);

  // Fallback path: deterministic mock reasoning
  if (!baseUrl || !apiKey || !model) {
    const authenticityById = new Map<string, Stage2Output['authenticity'][number]>();
    for (const it of candidates) {
      const a = mockAuthenticityLabel(it);
      authenticityById.set(it.id, { id: it.id, ...a });
    }
    const trends = topKeywords.slice(0, 3);
    // attach authenticity to items for better markdown
    for (const it of items) {
      const a = authenticityById.get(it.id);
      if (a) it.authenticity = { label: a.label, rationale: a.rationale };
    }
    return { used: 'mock', trends, insight: mockInsightMarkdown(items, trends, keyword), authenticityById };
  }

  const payload = candidates.map((it) => ({
    id: it.id,
    title: it.title,
    content: it.content.slice(0, 500),
    metrics: it.metrics,
  }));

  const system = [
    'You are a strict “signal-to-noise” analyst for messy social media feeds.',
    'You must be conservative: prefer "unclear" over guessing.',
    'Output MUST be valid JSON only (no markdown, no code fences).',
  ].join('\n');

  const user = [
    `Context: We searched RedNote/Xiaohongshu for keyword: "${keyword}".`,
    `You will receive up to ${payload.length} items (already hard-filtered for spam and low engagement).`,
    '',
    'Tasks:',
    '1) Verify authenticity: for each item, label as one of:',
    '   - real_experience (sounds like lived experience, concrete details, tradeoffs)',
    '   - generic_marketing_copy (sounds like ad copy / overly generic / CTA / "爆款")',
    '   - unclear',
    '   Provide a short rationale in Chinese (<= 25 words).',
    '2) Trend extraction: produce 3 keywords that look “spiking” within this set, compared to generic/common talk.',
    '   Prefer specific nouns/phrases over generic words.',
    '3) Summary generation: write ~200 Chinese words executive summary of current sentiment and what to do next.',
    '',
    'Output JSON schema:',
    '{',
    '  "authenticity": [{"id": "...", "label": "...", "rationale": "..."}],',
    '  "trends": ["...", "...", "..."],',
    '  "insight_markdown": "..."',
    '}',
    '',
    'Data:',
    JSON.stringify({ items: payload, hint_keywords: topKeywords.slice(0, 10) }),
  ].join('\n');

  const content = await openAICompatibleChatCompletion({
    baseUrl,
    apiKey,
    model,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
    temperature: 0.2,
    maxTokens: 900,
    timeoutMs: 20000,
  });

  const parsed = safeJsonParse<Stage2Output>(content);
  if (!parsed || !Array.isArray(parsed.trends) || !Array.isArray(parsed.authenticity) || typeof parsed.insight_markdown !== 'string') {
    // If model output is malformed, degrade safely.
    const authenticityById = new Map<string, Stage2Output['authenticity'][number]>();
    for (const it of candidates) {
      const a = mockAuthenticityLabel(it);
      authenticityById.set(it.id, { id: it.id, ...a });
    }
    const trends = topKeywords.slice(0, 3);
    for (const it of items) {
      const a = authenticityById.get(it.id);
      if (a) it.authenticity = { label: a.label, rationale: a.rationale };
    }
    return { used: 'mock', trends, insight: mockInsightMarkdown(items, trends, keyword), authenticityById };
  }

  const trends = parsed.trends.map((t) => String(t || '').trim()).filter(Boolean).slice(0, 3);
  const authenticityById = new Map<string, Stage2Output['authenticity'][number]>();
  for (const a of parsed.authenticity) {
    if (!a || typeof a.id !== 'string') continue;
    const label =
      a.label === 'real_experience' || a.label === 'generic_marketing_copy' || a.label === 'unclear'
        ? a.label
        : 'unclear';
    authenticityById.set(a.id, { id: a.id, label, rationale: String(a.rationale || '').slice(0, 80) });
  }

  for (const it of items) {
    const a = authenticityById.get(it.id);
    if (a) it.authenticity = { label: a.label, rationale: a.rationale };
  }

  return { used: 'llm', trends, insight: parsed.insight_markdown, authenticityById };
}


