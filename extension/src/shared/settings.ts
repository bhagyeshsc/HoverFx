import { browser } from 'wxt/browser';

export interface Settings {
  enabled: boolean;
  targetCurrency: string;
  excludedSites: string[];
  sourceOverrides: Record<string, string>;
}

export const SETTINGS_KEY = 'hoverfx:settings';

export const DEFAULT_SETTINGS: Settings = {
  enabled: true,
  targetCurrency: 'INR',
  excludedSites: [],
  sourceOverrides: {},
};

export const POPULAR_CURRENCIES = [
  'INR', 'USD', 'EUR', 'GBP', 'JPY', 'CAD', 'AUD', 'NZD', 'SGD', 'CHF',
  'AED', 'SAR', 'CNY', 'HKD', 'KRW', 'THB', 'MYR', 'IDR', 'PHP', 'VND',
  'ZAR', 'BRL', 'MXN', 'SEK', 'NOK', 'DKK', 'PLN', 'CZK', 'HUF', 'TRY',
  'RUB', 'ILS', 'NGN', 'PKR', 'BDT', 'LKR', 'NPR', 'EGP', 'TWD', 'KWD',
  'QAR', 'BHD', 'OMR', 'CLP', 'COP', 'ARS', 'UAH', 'RON',
] as const;

const currencyCodes = new Set<string>(POPULAR_CURRENCIES);
export function isSupportedCurrency(code: unknown): code is string {
  return typeof code === 'string' && currencyCodes.has(code.toUpperCase());
}

export function normalizeDomain(input: string): string | null {
  const raw = input.trim().toLowerCase();
  if (!raw) return null;
  try {
    const url = new URL(raw.includes('://') ? raw : `https://${raw}`);
    const host = url.hostname.replace(/^www\./, '').replace(/\.$/, '');
    if (!host.includes('.') || !/^[a-z0-9.-]+$/.test(host) || host.includes('..')) return null;
    return host;
  } catch {
    return null;
  }
}

export function domainMatches(hostname: string, excluded: string): boolean {
  const host = hostname.toLowerCase().replace(/^www\./, '');
  return host === excluded || host.endsWith(`.${excluded}`);
}

export function siteIsExcluded(hostname: string, excludedSites: string[]): boolean {
  return excludedSites.some((domain) => domainMatches(hostname, domain));
}

export function siteOverride(hostname: string, overrides: Record<string, string>): string | null {
  const matches = Object.entries(overrides)
    .filter(([domain, currency]) => domainMatches(hostname, domain) && isSupportedCurrency(currency))
    .sort(([a], [b]) => b.length - a.length);
  return matches[0]?.[1] ?? null;
}

export function sanitizeSettings(input: unknown): Settings {
  if (!input || typeof input !== 'object') return { ...DEFAULT_SETTINGS };
  const v = input as Partial<Settings>;
  const excludedSites = Array.isArray(v.excludedSites)
    ? Array.from(new Set(v.excludedSites.filter((x): x is string => typeof x === 'string')
        .map((x) => normalizeDomain(x)).filter((x): x is string => Boolean(x)))).slice(0, 200)
    : [];
  const sourceOverrides: Record<string, string> = {};
  if (v.sourceOverrides && typeof v.sourceOverrides === 'object' && !Array.isArray(v.sourceOverrides)) {
    for (const [domain, currency] of Object.entries(v.sourceOverrides)) {
      const normalized = normalizeDomain(domain);
      if (normalized && isSupportedCurrency(currency)) sourceOverrides[normalized] = currency.toUpperCase();
    }
  }
  return {
    enabled: typeof v.enabled === 'boolean' ? v.enabled : true,
    targetCurrency: isSupportedCurrency(v.targetCurrency) ? v.targetCurrency.toUpperCase() : 'INR',
    excludedSites,
    sourceOverrides,
  };
}

export async function loadSettings(): Promise<Settings> {
  const value = await browser.storage.local.get(SETTINGS_KEY);
  return sanitizeSettings(value[SETTINGS_KEY]);
}

export async function saveSettings(settings: Settings): Promise<void> {
  await browser.storage.local.set({ [SETTINGS_KEY]: sanitizeSettings(settings) });
}
