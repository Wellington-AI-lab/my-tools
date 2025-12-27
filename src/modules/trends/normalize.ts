import { normalizeText } from '@/modules/trends/utils';

export type AliasRule = {
  canonical: string; // normalized key (lowercase)
  variants: string[]; // raw variants (zh/en), will be normalized for matching
};

// A minimal bilingual alias map for MVP.
// Keep it small and high-signal; you can extend anytime.
export const DEFAULT_ALIASES: AliasRule[] = [
  { canonical: 'nvidia', variants: ['nvidia', 'nvda', '英伟达'] },
  { canonical: 'openai', variants: ['openai'] },
  { canonical: 'claude', variants: ['claude'] },
  { canonical: 'deepseek', variants: ['deepseek', '深度求索', 'deep seek'] },
  { canonical: 'llm', variants: ['llm', '大模型', '语言模型'] },
  { canonical: 'aiagent', variants: ['agent', 'ai agent', '智能体', '代理'] },
  { canonical: 'bitcoin', variants: ['bitcoin', 'btc', '比特币'] },
  { canonical: 'ethereum', variants: ['ethereum', 'eth', '以太坊'] },
  { canonical: 'fed', variants: ['fed', 'fomc', 'federalreserve', '美联储', '联储'] },
  { canonical: 'cpi', variants: ['cpi', '通胀', 'inflation'] },
  { canonical: 'gdp', variants: ['gdp'] },
  { canonical: 'pmi', variants: ['pmi'] },
  { canonical: 'interest_rate', variants: ['rate', 'rates', 'interest', '利率'] },
  { canonical: 'forex', variants: ['forex', 'fx', '汇率'] },
  { canonical: 'gold', variants: ['gold', '黄金'] },
  { canonical: 'oil', variants: ['oil', '原油'] },
  { canonical: 'tesla', variants: ['tesla', 'tsla', '特斯拉'] },
  { canonical: 'apple', variants: ['apple', '苹果'] },
  { canonical: 'robot_humanoid', variants: ['humanoid', '人形机器人', '人形'] },
  { canonical: 'drone', variants: ['drone', 'drones', '无人机'] },
  { canonical: 'box_office', variants: ['boxoffice', 'box office', '票房'] },
  { canonical: 'visa', variants: ['visa', '签证', '免签'] },
];

export type AliasMatcher = {
  canonicalizeKeyword: (input: string) => string;
  variantsForKeyword: (input: string) => string[];
  pickDisplayKeyword: typeof pickDisplayKeyword;
};

function compileRules(rules: AliasRule[]): Array<{ canonical: string; variants: string[] }> {
  const byCanonical = new Map<string, Set<string>>();

  const addRule = (r: AliasRule) => {
    const canonical = normalizeText(r.canonical);
    if (!canonical) return;
    const set = byCanonical.get(canonical) ?? new Set<string>();
    set.add(canonical);
    for (const v of r.variants || []) {
      const nv = normalizeText(v);
      if (nv) set.add(nv);
    }
    byCanonical.set(canonical, set);
  };

  for (const r of rules) addRule(r);
  return Array.from(byCanonical.entries()).map(([canonical, set]) => ({
    canonical,
    variants: Array.from(set.values()),
  }));
}

export function createAliasMatcher(extraRules?: AliasRule[]): AliasMatcher {
  const mergedRules = [
    ...DEFAULT_ALIASES,
    ...(Array.isArray(extraRules) ? extraRules : []),
  ];
  const normalizedRules = compileRules(mergedRules);

  const canonicalize = (input: string): string => {
    const n = normalizeText(input);
    if (!n) return '';
    for (const r of normalizedRules) {
      if (r.variants.includes(n)) return r.canonical;
    }
    return n;
  };

  const variantsFor = (input: string): string[] => {
    const c = canonicalize(input);
    const found = normalizedRules.find((r) => r.canonical === c);
    if (found) return Array.from(new Set([c, ...found.variants]));
    return [c];
  };

  return {
    canonicalizeKeyword: canonicalize,
    variantsForKeyword: variantsFor,
    pickDisplayKeyword,
  };
}

const DEFAULT_MATCHER = createAliasMatcher();

// Backwards-compatible helpers (use default matcher)
export function canonicalizeKeyword(input: string): string {
  return DEFAULT_MATCHER.canonicalizeKeyword(input);
}

export function variantsForKeyword(input: string): string[] {
  return DEFAULT_MATCHER.variantsForKeyword(input);
}

export function pickDisplayKeyword(opts: { canonical: string; candidates: string[] }): string {
  // Prefer a human-friendly label: keep original if it contains CJK; else uppercase tickers; else canonical.
  const cands = Array.isArray(opts.candidates) ? opts.candidates : [];
  const zh = cands.find((x) => /[\u4e00-\u9fff]/.test(String(x || '')));
  if (zh) return String(zh).trim();
  const ticker = cands.find((x) => /^[A-Z]{2,6}$/.test(String(x || '').trim()));
  if (ticker) return ticker.trim();
  const raw = cands.find((x) => String(x || '').trim().length >= 2);
  return (raw || opts.canonical || '').trim();
}


