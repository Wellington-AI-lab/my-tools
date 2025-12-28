import type { TrendCard, TrendTheme } from '@/modules/trends/types';
import { ALL_THEMES } from '@/modules/trends/themes';
import { openAICompatibleChatCompletion } from '@/modules/in-depth-analysis/llm/openai-compatible-client';

function safeJsonParse<T>(s: string): T | null {
  try {
    return JSON.parse(s) as T;
  } catch {
    const m = s.match(/\{[\s\S]*\}/);
    if (!m) return null;
    try {
      return JSON.parse(m[0]) as T;
    } catch {
      return null;
    }
  }
}

function mockKeywords(cards: TrendCard[]): string[] {
  const freq = new Map<string, number>();
  for (const c of cards) {
    const title = String(c.title || '');
    // 2-char slices for zh + simple words for en
    const zh = title.match(/[\u4e00-\u9fff]{2,4}/g) || [];
    for (const k of zh) freq.set(k, (freq.get(k) ?? 0) + 2);
    const en = title.toLowerCase().match(/[a-z]{3,}/g) || [];
    for (const k of en) freq.set(k, (freq.get(k) ?? 0) + 1);
  }
  return Array.from(freq.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([k]) => k)
    .filter((k) => k.length >= 2)
    .slice(0, 6);
}

function mockInsight(themeCards: Array<{ theme: TrendTheme; cards: TrendCard[]; keywords: string[] }>): string {
  const lines: string[] = [];
  lines.push('## Daily Trend Radar（MVP）');
  lines.push('');
  lines.push('### 摘要（模拟推理）');
  lines.push(
    '今日趋势主要由“宏观事件 + AI/机器人产品动态 + 大众娱乐热点”共同驱动。' +
      '建议你先把每个主题里排名靠前的 3-5 个关键词做二次检索，并关注是否出现跨平台共振（Google ↔ 微博）。'
  );
  lines.push('');
  for (const g of themeCards) {
    if (!g.cards.length) continue;
    lines.push(`### ${g.theme}`);
    if (g.keywords.length) lines.push(`- **关键词**：${g.keywords.slice(0, 3).join('、')}`);
    for (const c of g.cards.slice(0, 5)) {
      lines.push(`- ${c.title}（score ${Math.round(c.signals.score)} · ${c.source}）`);
    }
    lines.push('');
  }
  return lines.join('\n');
}

type LlmOut = {
  by_theme: Array<{ theme: TrendTheme; keywords: string[] }>;
  insight_markdown: string;
};

export async function reasonTrends(opts: {
  env: { LLM_BASE_URL?: string; LLM_API_KEY?: string; LLM_MODEL?: string };
  byTheme: Map<TrendTheme, TrendCard[]>;
  sourcesUsed: string[];
  dayKey: string;
}): Promise<{ used: 'llm' | 'mock'; byThemeKeywords: Map<TrendTheme, string[]>; insight: string }> {
  const baseUrl = String(opts.env.LLM_BASE_URL || '').trim();
  const apiKey = String(opts.env.LLM_API_KEY || '').trim();
  const model = String(opts.env.LLM_MODEL || '').trim();

  const groups = ALL_THEMES.map((t) => ({ theme: t, cards: opts.byTheme.get(t) ?? [] }))
    .filter((g) => g.cards.length > 0)
    .map((g) => ({
      theme: g.theme,
      cards: g.cards.slice(0, 10).map((c) => ({ title: c.title, source: c.source, score: c.signals.score, url: c.url })),
    }));

  const byThemeKeywords = new Map<TrendTheme, string[]>();
  for (const t of ALL_THEMES) byThemeKeywords.set(t, []);

  // fallback: mock
  if (!baseUrl || !apiKey || !model) {
    const themeCards = groups.map((g) => {
      const cards = (opts.byTheme.get(g.theme) ?? []).slice(0, 10);
      const keywords = mockKeywords(cards).slice(0, 3);
      byThemeKeywords.set(g.theme, keywords);
      return { theme: g.theme, cards, keywords };
    });
    return { used: 'mock', byThemeKeywords, insight: mockInsight(themeCards) };
  }

  const system = [
    'You are a bilingual trend analyst.',
    'Your job is to turn noisy multi-source "trending topics" into high-signal decision support.',
    'Output MUST be valid JSON only. No markdown fences.',
  ].join('\n');

  const user = [
    `DateKey(Asia/Shanghai): ${opts.dayKey}`,
    `Sources: ${opts.sourcesUsed.join(', ')}`,
    '',
    'We have themes: finance, economy, ai, robotics, travel, music, movies, fashion, entertainment.',
    'For each theme present, output 3 short keywords (mixed zh/en allowed) that best represent what is spiking TODAY.',
    'Then write ~220 Chinese words executive summary with actionable next steps; mention cross-platform consensus if any.',
    '',
    'Return JSON schema:',
    '{ "by_theme": [{"theme":"ai","keywords":["...","...","..."]}], "insight_markdown":"..." }',
    '',
    'Data:',
    JSON.stringify({ themes: groups }),
  ].join('\n');

  let content: string;
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
      maxTokens: 900,
      timeoutMs: 20000,
    });
  } catch (llmError) {
    // LLM call failed (network error, timeout, etc.) - fall back to mock mode
    const themeCards = groups.map((g) => {
      const cards = (opts.byTheme.get(g.theme) ?? []).slice(0, 10);
      const keywords = mockKeywords(cards).slice(0, 3);
      byThemeKeywords.set(g.theme, keywords);
      return { theme: g.theme, cards, keywords };
    });
    return { used: 'mock', byThemeKeywords, insight: mockInsight(themeCards) };
  }

  const parsed = safeJsonParse<LlmOut>(content);
  if (!parsed || !Array.isArray(parsed.by_theme) || typeof parsed.insight_markdown !== 'string') {
    // degrade
    const themeCards = groups.map((g) => {
      const cards = (opts.byTheme.get(g.theme) ?? []).slice(0, 10);
      const keywords = mockKeywords(cards).slice(0, 3);
      byThemeKeywords.set(g.theme, keywords);
      return { theme: g.theme, cards, keywords };
    });
    return { used: 'mock', byThemeKeywords, insight: mockInsight(themeCards) };
  }

  for (const row of parsed.by_theme) {
    if (!row || !row.theme || !Array.isArray(row.keywords)) continue;
    if (!ALL_THEMES.includes(row.theme)) continue;
    const kws = row.keywords.map((k) => String(k || '').trim()).filter(Boolean).slice(0, 3);
    byThemeKeywords.set(row.theme, kws);
  }

  return { used: 'llm', byThemeKeywords, insight: parsed.insight_markdown };
}


