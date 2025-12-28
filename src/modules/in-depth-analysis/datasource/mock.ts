import type { RednoteRawItem, RednoteTimeRangePreset } from '@/modules/in-depth-analysis/types';

// Load mock JSON as a raw string so we don't depend on TS `resolveJsonModule`.
// Vite/Astro will bundle this for both dev and Cloudflare runtime.
// eslint-disable-next-line import/no-unresolved
import rawJson from '@/modules/in-depth-analysis/mock/in-depth-analysis-raw.mock.json?raw';

type MockFile = {
  generated_at?: string;
  source?: string;
  items: RednoteRawItem[];
};

function safeParseMock(): MockFile {
  try {
    const parsed = JSON.parse(String(rawJson || '')) as unknown;
    if (parsed && typeof parsed === 'object' && Array.isArray((parsed as any).items)) {
      return parsed as MockFile;
    }
  } catch {
    // fall through
  }
  return { items: [] };
}

export async function fetchRednoteRawMock(opts: {
  keyword: string;
  timeRange: RednoteTimeRangePreset;
}): Promise<{ items: RednoteRawItem[] }> {
  const { keyword } = opts;
  const file = safeParseMock();
  const items = Array.isArray(file.items) ? file.items : [];

  // Lightweight keyword match to simulate search.
  const kw = String(keyword || '').trim();
  if (!kw) return { items };

  const lowerKw = kw.toLowerCase();
  const filtered = items.filter((it) => {
    const title = String(it.title ?? '');
    const content = String(it.content ?? it.desc ?? '');
    const tags = Array.isArray(it.tags) ? (it.tags as any[]).join(' ') : String(it.tags ?? '');
    const blob = `${title} ${content} ${tags}`.toLowerCase();
    return blob.includes(lowerKw);
  });

  // If keyword finds nothing, return the full dataset to avoid “empty UI” during dev.
  return { items: filtered.length ? filtered : items };
}


