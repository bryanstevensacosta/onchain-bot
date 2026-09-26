/**
 * Bare-address detection (Tramo 3, todo 9, P13 — NEW).
 *
 * Detects raw contract addresses pasted WITHOUT any slash command:
 * - EVM: `0x` + 40 hex chars.
 * - Solana: base58, 32-44 chars.
 *
 * Lookup-only: detection never publishes, it only feeds the scan path.
 */

const EVM_RE = /\b0x[a-fA-F0-9]{40}\b/g;
const SOL_RE = /\b[1-9A-HJ-NP-Za-km-z]{32,44}\b/g;

export function isEvmAddress(value: string): boolean {
  return /^0x[a-fA-F0-9]{40}$/.test(value.trim());
}

export function isSolanaAddress(value: string): boolean {
  return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(value.trim());
}

export function isBareAddress(value: string): boolean {
  const trimmed = value.trim();
  if (trimmed === '' || trimmed.startsWith('/')) return false;
  if (/\s/.test(trimmed)) return false;
  return isEvmAddress(trimmed) || isSolanaAddress(trimmed);
}

/**
 * Extracts every contract-looking token from free text (forwards,
 * pasted messages, any text). Order-preserved, deduped.
 */
export function extractAddresses(text: string): string[] {
  if (!text) return [];
  const hits: Array<{ index: number; value: string }> = [];
  for (const re of [EVM_RE, SOL_RE]) {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      hits.push({ index: m.index, value: m[0] });
    }
  }
  hits.sort((a, b) => a.index - b.index);
  const found: string[] = [];
  const seen = new Set<string>();
  for (const hit of hits) {
    if (!seen.has(hit.value)) {
      seen.add(hit.value);
      found.push(hit.value);
    }
  }
  return found;
}
