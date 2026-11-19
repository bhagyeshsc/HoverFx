export interface RateRequest {
  type: 'HOVERFX_GET_RATE';
  from: string;
  to: string;
}

export type RateReply =
  | { ok: true; rate: number; date: string; fetchedAt: number; stale: boolean }
  | { ok: false; error: string };

export function isRateRequest(value: unknown): value is RateRequest {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return v.type === 'HOVERFX_GET_RATE' &&
    typeof v.from === 'string' && /^[A-Z]{3}$/.test(v.from) &&
    typeof v.to === 'string' && /^[A-Z]{3}$/.test(v.to);
}
