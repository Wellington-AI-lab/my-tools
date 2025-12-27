import type { TrendRawItem } from '@/modules/trends/types';
// eslint-disable-next-line import/no-unresolved
import rawJson from '@/modules/trends/mock/trends-raw.mock.json?raw';

type MockFile = { items: TrendRawItem[] };

function safeParse(): MockFile {
  try {
    const parsed = JSON.parse(String(rawJson || '')) as any;
    if (parsed && typeof parsed === 'object' && Array.isArray(parsed.items)) return parsed as MockFile;
  } catch {}
  return { items: [] };
}

export async function fetchTrendsMock(): Promise<{ items: TrendRawItem[] }> {
  return safeParse();
}


