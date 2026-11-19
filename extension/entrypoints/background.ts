import { browser } from 'wxt/browser';
import { defineBackground } from '#imports';
import { isRateRequest, type RateReply } from '../src/shared/messages';

const RATES_KEY = 'hoverfx:rate-cache:v1';
const FRESH_FOR_MS = 6 * 60 * 60 * 1000;
const MAX_STALE_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_ENTRIES = 120;

interface CachedRate {
  rate: number;
  date: string;
  fetchedAt: number;
}
type RateCache = Record<string, CachedRate>;

export default defineBackground(() => {
  const inflight = new Map<string, Promise<RateReply>>();
  const memoryCache = new Map<string, CachedRate>();
  let writes: Promise<unknown> = Promise.resolve();

  async function readCache(): Promise<RateCache> {
    const response = await browser.storage.local.get(RATES_KEY);
    const value: unknown = response[RATES_KEY];
    return value && typeof value === 'object' && !Array.isArray(value) ? value as RateCache : {};
  }

  function storeEntry(pair: string, entry: CachedRate): void {
    // Serialize updates: concurrent requests must not overwrite one another.
    writes = writes.then(async () => {
      const cache = await readCache();
      cache[pair] = entry;
      const ordered = Object.entries(cache)
        .filter(([, v]) => v && typeof v.fetchedAt === 'number')
        .sort(([, a], [, b]) => b.fetchedAt - a.fetchedAt)
        .slice(0, MAX_ENTRIES);
      await browser.storage.local.set({ [RATES_KEY]: Object.fromEntries(ordered) });
    }).catch((error: unknown) => console.warn('[HoverFX] Could not persist rate cache', error));
  }

  async function fetchRate(from: string, to: string): Promise<CachedRate> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8500);
    try {
      const url = `https://api.frankfurter.dev/v2/rate/${encodeURIComponent(from.toLowerCase())}/${encodeURIComponent(to.toLowerCase())}`;
      const response = await fetch(url, { signal: controller.signal, cache: 'no-store' });
      if (!response.ok) throw new Error(`Rate service returned HTTP ${response.status}`);
      const data: unknown = await response.json();
      if (!data || typeof data !== 'object') throw new Error('Unexpected rate response');
      const { rate, date, base, quote } = data as Record<string, unknown>;
      if (typeof rate !== 'number' || !Number.isFinite(rate) || rate <= 0 ||
          typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
          base !== from || quote !== to) {
        throw new Error('Rate response failed validation');
      }
      return { rate, date, fetchedAt: Date.now() };
    } finally {
      clearTimeout(timeout);
    }
  }

  async function getRate(from: string, to: string): Promise<RateReply> {
    if (from === to) return {
      ok: true, rate: 1, date: new Date().toISOString().slice(0, 10), fetchedAt: Date.now(), stale: false,
    };
    const pair = `${from}:${to}`;
    const cache = await readCache();
    const saved = memoryCache.get(pair) ?? cache[pair];
    if (saved) memoryCache.set(pair, saved);
    const age = saved ? Date.now() - saved.fetchedAt : Infinity;
    if (saved && Number.isFinite(saved.rate) && saved.rate > 0 && age >= 0 && age < FRESH_FOR_MS) {
      return { ok: true, ...saved, stale: false };
    }
    try {
      const fetched = await fetchRate(from, to);
      memoryCache.set(pair, fetched);
      storeEntry(pair, fetched);
      return { ok: true, ...fetched, stale: false };
    } catch (error) {
      if (saved && Number.isFinite(saved.rate) && saved.rate > 0 && age >= 0 && age < MAX_STALE_MS) {
        return { ok: true, ...saved, stale: true };
      }
      return { ok: false, error: error instanceof Error ? error.message : 'Exchange rate unavailable' };
    }
  }

  browser.runtime.onMessage.addListener((message: unknown, _sender, sendResponse) => {
    if (!isRateRequest(message)) return false;
    const pair = `${message.from}:${message.to}`;
    let task = inflight.get(pair);
    if (!task) {
      task = getRate(message.from, message.to).finally(() => inflight.delete(pair));
      inflight.set(pair, task);
    }
    void task.then(sendResponse).catch((error: unknown) => {
      sendResponse({ ok: false, error: String(error) } satisfies RateReply);
    });
    // Keep the callback alive across asynchronous fetches in Chromium MV3.
    return true;
  });
});
