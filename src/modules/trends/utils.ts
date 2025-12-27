import type { TrendCard, TrendRawItem, TrendTheme } from '@/modules/trends/types';
import { THEME_KEYWORDS } from '@/modules/trends/themes';

export function nowIso(): string {
  return new Date().toISOString();
}

export function normalizeText(s: string): string {
  return String(s || '')
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/[^\p{Script=Han}\p{L}\p{N}]+/gu, '');
}

export function bigrams(s: string): Set<string> {
  const t = normalizeText(s);
  const grams = new Set<string>();
  if (!t) return grams;
  if (t.length === 1) {
    grams.add(t);
    return grams;
  }
  for (let i = 0; i < t.length - 1; i++) grams.add(t.slice(i, i + 2));
  return grams;
}

export function jaccard(a: Set<string>, b: Set<string>): number {
  if (!a.size && !b.size) return 1;
  if (!a.size || !b.size) return 0;
  let inter = 0;
  const [small, large] = a.size <= b.size ? [a, b] : [b, a];
  for (const x of small) if (large.has(x)) inter++;
  const union = a.size + b.size - inter;
  return union > 0 ? inter / union : 0;
}

export function stableId(input: string): string {
  const base = String(input || '').slice(0, 256);
  let h = 2166136261;
  for (let i = 0; i < base.length; i++) {
    h ^= base.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16);
}

export function detectLanguage(title: string): 'zh' | 'en' | 'unknown' {
  const s = String(title || '');
  if (/[\u4e00-\u9fff]/.test(s)) return 'zh';
  if (/[a-zA-Z]/.test(s)) return 'en';
  return 'unknown';
}

export function tagThemes(title: string): TrendTheme[] {
  const s = String(title || '');
  const lower = s.toLowerCase();
  const out: TrendTheme[] = [];

  for (const theme of Object.keys(THEME_KEYWORDS) as TrendTheme[]) {
    const { zh, en } = THEME_KEYWORDS[theme];
    const hitZh = zh.some((k) => k && s.includes(k));
    const hitEn = en.some((k) => k && lower.includes(k.toLowerCase()));
    if (hitZh || hitEn) out.push(theme);
  }
  return out;
}

export function mapRawToCard(it: TrendRawItem): TrendCard {
  const title = String(it.title || '').trim();
  const language = it.language && (it.language === 'zh' || it.language === 'en' || it.language === 'unknown')
    ? it.language
    : detectLanguage(title);

  const themes = tagThemes(title);
  const score = Number.isFinite(it.score) ? Math.max(0, Number(it.score)) : 0;
  const rank = Number.isFinite(it.rank) ? Math.max(1, Math.floor(Number(it.rank))) : 999;
  // unified scoring: prefer platform score, otherwise invert rank (higher is better)
  const unified = score > 0 ? score : Math.max(0, 300 - rank * 10);

  return {
    id: `${it.source}_${stableId(`${it.source}|${title}|${it.url || ''}`)}`,
    source: it.source,
    title,
    url: it.url,
    language,
    themes,
    signals: { score: unified },
  };
}


