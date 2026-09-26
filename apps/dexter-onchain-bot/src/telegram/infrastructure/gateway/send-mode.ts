/**
 * Lookup send-path selector (telegram-bots-gateway todo 6).
 *
 * `direct` = legacy direct Bot API only (deprecated);
 * `dual` = gateway + direct, compare, return the direct leg (parity runs);
 * `gateway` = gateway only, fail-closed (cutover).
 *
 * Defaults to `dual` when unset or invalid, so parity runs unless an
 * operator pins `direct` (kol-system / feed-publisher mirror).
 */
export type DexterSendMode = 'direct' | 'dual' | 'gateway';

export function resolveDexterSendMode(raw: string | undefined): DexterSendMode {
  const mode = (raw ?? '').trim().toLowerCase();
  if (mode === 'direct' || mode === 'dual' || mode === 'gateway') return mode;
  return 'dual';
}
