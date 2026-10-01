/**
 * Known-address seed (Tramo 3, todo 12, P50 — address infrastructure).
 *
 * Well-known program addresses (chain-qualified `chain:value` keys,
 * lowercase). v1 seed only — the full registry lands with the todo-4
 * provider extraction. System/program addresses change never, so a
 * static seed is safe here. Moved verbatim from the former
 * `address/address-kind-detector.service.ts`.
 */
export const KNOWN_PROGRAM_KEYS: ReadonlyArray<string> = [
  'solana:11111111111111111111111111111111',
  'solana:tokenkegqfezrtzdcfahey3nqobwrqpc4ujb1sk7',
  'ethereum:0x0000000000000000000000000000000000000000',
];
