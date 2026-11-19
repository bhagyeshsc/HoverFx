import type { Settings } from './settings';

export interface CurrencyContext {
  hostname: string;
  pageCurrency?: string | null;
  language?: string | null;
  overrideCurrency?: string | null;
}

export interface PriceMatch {
  start: number;
  end: number;
  text: string;
  amount: number;
  currency: string;
  assumedCurrency: boolean;
}

const ISO = [
  'USD', 'EUR', 'GBP', 'INR', 'JPY', 'CAD', 'AUD', 'NZD', 'SGD', 'CHF',
  'AED', 'SAR', 'CNY', 'HKD', 'KRW', 'THB', 'MYR', 'IDR', 'PHP', 'VND',
  'ZAR', 'BRL', 'MXN', 'SEK', 'NOK', 'DKK', 'PLN', 'CZK', 'HUF', 'TRY',
  'RUB', 'ILS', 'NGN', 'PKR', 'BDT', 'LKR', 'NPR', 'EGP', 'TWD', 'KWD',
  'QAR', 'BHD', 'OMR', 'CLP', 'COP', 'ARS', 'UAH', 'RON',
];

const EXPLICIT_TOKENS: Record<string, string> = {
  'US$': 'USD', 'CA$': 'CAD', 'C$': 'CAD', 'AU$': 'AUD', 'A$': 'AUD',
  'NZ$': 'NZD', 'S$': 'SGD', 'SG$': 'SGD', 'HK$': 'HKD', 'R$': 'BRL',
  'MX$': 'MXN', 'NT$': 'TWD', '₹': 'INR', '€': 'EUR', '£': 'GBP',
  '₩': 'KRW', '₽': 'RUB', '₺': 'TRY', '₪': 'ILS', '₦': 'NGN',
  '₱': 'PHP', '฿': 'THB', '₫': 'VND', '₴': 'UAH', 'zł': 'PLN',
};
const AMBIGUOUS_TOKENS = ['$', '¥', '￥', 'Rs', 'Rs.', 'kr'];
const tokens = [...ISO, ...Object.keys(EXPLICIT_TOKENS), ...AMBIGUOUS_TOKENS]
  .sort((a, b) => b.length - a.length)
  .map((token) => token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
const TOKEN = `(?:${tokens.join('|')})`;
const DIGITS = String.raw`(?:\d{1,3}(?:[\s\u00a0\u202f,.'’]\d{3})+(?:[,.]\d{1,2})?|\d+(?:[,.]\d{1,2})?)`;
const PREFIX = new RegExp(`(^|[^\\p{L}\\p{N}])(${TOKEN})[ \\u00a0\\u202f]*(${DIGITS})(?=$|[^\\p{L}\\p{N}])`, 'gu');
const SUFFIX = new RegExp(`(^|[^\\p{L}\\p{N}])(${DIGITS})[ \\u00a0\\u202f]*(${TOKEN})(?=$|[^\\p{L}\\p{N}])`, 'gu');

const countryCurrencies: Record<string, string> = {
  us: 'USD', ca: 'CAD', au: 'AUD', nz: 'NZD', sg: 'SGD', hk: 'HKD',
  in: 'INR', jp: 'JPY', cn: 'CNY', br: 'BRL', mx: 'MXN', pk: 'PKR',
  lk: 'LKR', se: 'SEK', no: 'NOK', dk: 'DKK', ch: 'CHF', gb: 'GBP',
};

function contextCurrency(ctx: CurrencyContext): string | null {
  if (ctx.overrideCurrency && ISO.includes(ctx.overrideCurrency)) return ctx.overrideCurrency;
  if (ctx.pageCurrency && ISO.includes(ctx.pageCurrency.toUpperCase())) return ctx.pageCurrency.toUpperCase();
  const country = ctx.hostname.toLowerCase().split('.').at(-1) ?? '';
  if (countryCurrencies[country]) return countryCurrencies[country];
  const localeCountry = ctx.language?.replace('_', '-').split('-')[1]?.toLowerCase();
  return (localeCountry && countryCurrencies[localeCountry]) || null;
}

export function resolveCurrency(token: string, ctx: CurrencyContext): { code: string; assumed: boolean } | null {
  if (ISO.includes(token)) return { code: token, assumed: false };
  if (EXPLICIT_TOKENS[token]) return { code: EXPLICIT_TOKENS[token], assumed: false };
  const hint = contextCurrency(ctx);
  if (token === '$') {
    const allowed = ['USD', 'CAD', 'AUD', 'NZD', 'SGD', 'HKD', 'MXN', 'TWD', 'ARS', 'CLP', 'COP'];
    if (hint && allowed.includes(hint)) return { code: hint, assumed: true };
    return { code: 'USD', assumed: true };
  }
  if (token === '¥' || token === '￥') return { code: hint === 'CNY' ? 'CNY' : 'JPY', assumed: true };
  if (token === 'Rs' || token === 'Rs.') {
    return { code: hint && ['INR', 'PKR', 'LKR', 'NPR'].includes(hint) ? hint : 'INR', assumed: true };
  }
  if (token === 'kr') {
    return hint && ['SEK', 'NOK', 'DKK'].includes(hint) ? { code: hint, assumed: true } : null;
  }
  return null;
}

export function parsePriceNumber(raw: string): number | null {
  let n = raw.replace(/[\s\u00a0\u202f'’]/g, '');
  const comma = n.lastIndexOf(',');
  const dot = n.lastIndexOf('.');
  if (comma !== -1 && dot !== -1) {
    const decimal = comma > dot ? ',' : '.';
    const grouping = decimal === ',' ? '.' : ',';
    n = n.split(grouping).join('').replace(decimal, '.');
  } else if (comma !== -1 || dot !== -1) {
    const separator = comma !== -1 ? ',' : '.';
    const parts = n.split(separator);
    if (parts.length > 2 && parts.slice(1).every((part) => part.length === 3)) {
      n = parts.join('');
    } else if (parts.length === 2 && parts[1]?.length === 3 && parts[0]!.length <= 3) {
      n = parts.join('');
    } else if (parts.length === 2 && (parts[1]?.length ?? 0) <= 2) {
      n = parts.join('.');
    } else {
      return null;
    }
  }
  if (!/^\d+(?:\.\d+)?$/.test(n)) return null;
  const value = Number(n);
  return Number.isFinite(value) && value <= 1e12 ? value : null;
}

export function extractPrices(text: string, context: CurrencyContext): PriceMatch[] {
  if (!text || text.length > 800) return [];
  const result: PriceMatch[] = [];
  for (const [regex, prefix] of [[PREFIX, true], [SUFFIX, false]] as const) {
    regex.lastIndex = 0;
    for (const match of text.matchAll(regex)) {
      const offset = match[1]?.length ?? 0;
      const token = prefix ? match[2] : match[3];
      const number = prefix ? match[3] : match[2];
      if (!token || !number) continue;
      const currency = resolveCurrency(token, context);
      const amount = parsePriceNumber(number);
      if (!currency || amount === null) continue;
      const start = (match.index ?? 0) + offset;
      const matchedText = match[0].slice(offset);
      result.push({
        start, end: start + matchedText.length, text: matchedText,
        amount, currency: currency.code, assumedCurrency: currency.assumed,
      });
    }
  }
  return result.sort((a, b) => a.start - b.start)
    .filter((match, index, matches) => !matches.slice(0, index).some((before) => before.start === match.start && before.end === match.end));
}

export function formatConverted(value: number, currency: string): string {
  return new Intl.NumberFormat(undefined, {
    style: 'currency', currency, currencyDisplay: 'symbol',
    maximumFractionDigits: value > 0 && value < 1 ? 4 : undefined,
  }).format(value);
}

// Keep a type-level reference to settings so source codes stay aligned with the settings data shape.
export type CurrencyOverrideMap = Settings['sourceOverrides'];
