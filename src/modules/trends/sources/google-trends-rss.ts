import type { TrendRawItem } from '@/modules/trends/types';

function stripCdata(s: string): string {
  return s.replace(/^<!\[CDATA\[/, '').replace(/\]\]>$/, '');
}

function decodeXmlEntities(s: string): string {
  return s
    .replaceAll('&amp;', '&')
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&quot;', '"')
    .replaceAll('&#39;', "'");
}

function extractTag(block: string, tag: string): string | null {
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i');
  const m = block.match(re);
  if (!m) return null;
  return decodeXmlEntities(stripCdata(m[1].trim()));
}

export function parseRss(xml: string): Array<{ title: string; url?: string; publishedAt?: string }> {
  const items: Array<{ title: string; url?: string; publishedAt?: string }> = [];
  const re = /<item\b[^>]*>([\s\S]*?)<\/item>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml))) {
    const block = m[1];
    const title = extractTag(block, 'title') || '';
    const link = extractTag(block, 'link') || undefined;
    const pubDate = extractTag(block, 'pubDate') || undefined;
    if (title.trim()) items.push({ title: title.trim(), url: link, publishedAt: pubDate });
  }
  return items;
}

export async function fetchGoogleTrendsDailyRss(opts: {
  geo: 'CN' | 'US';
  hl?: string; // e.g. 'zh-CN' or 'en-US'
  timeoutMs?: number;
}): Promise<{ items: TrendRawItem[]; error?: string }> {
  const geo = opts.geo;
  const hl = opts.hl ?? (geo === 'CN' ? 'zh-CN' : 'en-US');
  const url = `https://trends.google.com/trends/trendingsearches/daily/rss?geo=${encodeURIComponent(geo)}&hl=${encodeURIComponent(hl)}`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Math.max(1000, opts.timeoutMs ?? 12000));
  try {
    const resp = await fetch(url, {
      method: 'GET',
      headers: {
        // mimic a browser a bit; some edges block empty UA
        'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        accept: 'application/rss+xml, application/xml;q=0.9, text/xml;q=0.8, */*;q=0.5',
      },
      signal: controller.signal,
    });

    if (!resp.ok) {
      // Google Trends RSS 可能因地理限制返回 404
      console.warn(`Google Trends RSS HTTP ${resp.status} for geo=${geo}`);
      return { items: [], error: `HTTP ${resp.status}` };
    }

    // OOM protection: check Content-Length before reading body
    const contentLength = resp.headers.get('content-length');
    if (contentLength && parseInt(contentLength, 10) > 1024 * 1024 * 2) { // 2MB limit
      throw new Error('RSS feed too large (max 2MB)');
    }

    const text = await resp.text();

    const parsed = parseRss(text);
    const lang: TrendRawItem['language'] = geo === 'CN' ? 'zh' : 'en';
    const items: TrendRawItem[] = parsed.slice(0, 50).map((it, idx) => ({
      source: 'google_trends_rss',
      title: it.title,
      url: it.url,
      rank: idx + 1,
      language: lang,
      publishedAt: it.publishedAt,
      score: Math.max(0, 300 - idx * 5),
      extra: { geo, hl },
    }));

    return { items };
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    console.warn(`Google Trends RSS fetch failed for geo=${geo}:`, msg);
    return { items: [], error: msg };
  } finally {
    clearTimeout(timeout);
  }
}


