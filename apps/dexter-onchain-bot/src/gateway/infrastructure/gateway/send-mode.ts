/**
 * Lookup send-path selector (exclusive-gateway task: gateway-only).
 *
 * `gateway` = gateway only, fail-closed (the ONLY supported mode —
 * dexter sends exclusively via the gateway inventory-bound bot).
 * `direct` / `dual` are rejected legacy values kept for env-compat:
 * they resolve to `gateway` so a stale `DEXTER_SEND_MODE=dual`
 * keeps sending through the gateway instead of the direct leg.
 */
export type DexterSendMode = 'direct' | 'dual' | 'gateway';

export function resolveDexterSendMode(
  _raw: string | undefined,
): DexterSendMode {
  return 'gateway';
}
