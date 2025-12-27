import type { RednoteRawItem, RednoteTimeRangePreset } from '@/modules/rednote/types';

/**
 * Placeholder for future: Apify `xiaohongshu-search` datasource.
 *
 * We keep the implementation minimal and safe:
 * - Only runs if `APIFY_TOKEN` exists
 * - Otherwise callers should fall back to mock
 *
 * When you get the token + actor details, we can wire:
 * - run actor with input
 * - poll run to succeeded
 * - read dataset items
 */
export async function fetchRednoteRawFromApify(_opts: {
  env: { APIFY_TOKEN?: string };
  keyword: string;
  timeRange: RednoteTimeRangePreset;
}): Promise<{ items: RednoteRawItem[] }> {
  throw new Error('Apify datasource is not configured yet (missing actor integration).');
}


