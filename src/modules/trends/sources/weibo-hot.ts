import type { TrendRawItem } from '@/modules/trends/types';

function decodeHtmlEntities(s: string): string {
  return s
    .replaceAll('&amp;', '&')
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&quot;', '"')
    .replaceAll('&#39;', "'")
    .replaceAll('&nbsp;', ' ');
}

/**
 * MVP parser:
 * Fetch https://s.weibo.com/top/summary and parse the hot list table.
 *
 * This endpoint can be rate-limited / blocked; caller should fallback to mock or Apify.
 */
export async function fetchWeiboHotSummary(opts?: { timeoutMs?: number }): Promise<{ items: TrendRawItem[]; error?: string }> {
  // If Apify is available, return empty items to let the agent use Apify instead
  if (process.env.APIFY_TOKEN) {
    console.log('[weibo-hot] Apify token detected, skipping regex parser (letting agent use Apify)');
    return { items: [] };
  }

  const url = 'https://s.weibo.com/top/summary';
  const controller = new AbortController();
  const timeoutMs = Math.max(1000, opts?.timeoutMs ?? 12000);
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const resp = await fetch(url, {
      method: 'GET',
      headers: {
        'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'accept-language': 'zh-CN,zh;q=0.9,en;q=0.8',
      },
      signal: controller.signal,
    });
    const html = await resp.text();

    if (!resp.ok) {
      console.warn(`Weibo summary HTTP ${resp.status}`);
      return { items: [], error: `HTTP ${resp.status}` };
    }

    // Basic extraction: find table rows containing td-02 title and optional "td-03" score.
    const rowRe = /<tr[^>]*>[\s\S]*?<\/tr>/gi;
    const items: TrendRawItem[] = [];
    let m: RegExpExecArray | null;
    let rank = 0;

    while ((m = rowRe.exec(html))) {
      const row = m[0];
      // skip ads / pinned
      if (row.includes('top_ad') || row.includes('icon-top')) continue;

      const titleMatch = row.match(/<td[^>]*class="td-02"[^>]*>[\s\S]*?<a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i);
      if (!titleMatch) continue;
      const href = titleMatch[1];
      const rawTitle = titleMatch[2]
        .replace(/<span[^>]*>[\s\S]*?<\/span>/gi, '')
        .replace(/<em[^>]*>[\s\S]*?<\/em>/gi, '')
        .replace(/<[^>]+>/g, '')
        .trim();
      const title = decodeHtmlEntities(rawTitle).trim();
      if (!title) continue;

      const scoreMatch = row.match(/<td[^>]*class="td-03"[^>]*>([\s\S]*?)<\/td>/i);
      const scoreText = scoreMatch ? scoreMatch[1].replace(/<[^>]+>/g, '').trim() : '';
      const scoreNum = scoreText ? Number(scoreText.replace(/[^\d]/g, '')) : NaN;

      rank++;
      items.push({
        source: 'weibo_hot',
        title,
        url: href.startsWith('http') ? href : `https://s.weibo.com${href}`,
        rank,
        language: 'zh',
        score: Number.isFinite(scoreNum) ? scoreNum : Math.max(0, 400 - rank * 8),
        extra: { score_text: scoreText || undefined },
      });
      if (items.length >= 50) break;
    }

    if (items.length === 0) {
      // 微博可能被限流或 HTML 结构变化，返回空数组和错误信息
      console.warn('Weibo parser produced 0 items (blocked or markup changed)');
      return { items: [], error: 'Parser produced 0 items' };
    }
    return { items };
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    console.warn('Weibo hot fetch failed:', msg);
    return { items: [], error: msg };
  } finally {
    clearTimeout(timeout);
  }
}


