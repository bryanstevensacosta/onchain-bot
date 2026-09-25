/**
 * Result of probing a single chain family for an address.
 *
 * `isContract` is null when the prober has no RPC evidence (v1
 * format-only probers never claim contract state).
 */
export interface ProbeResult {
  readonly responded: boolean;
  readonly isContract: boolean | null;
  readonly notes: string[];
}

/**
 * Outbound port: probes a single chain family for an address.
 *
 * Pure check, no caching, no retry. DetectChainService coordinates.
 */
export abstract class ChainProberPort {
  public abstract readonly chainName: string;
  public abstract probe(address: string): Promise<ProbeResult>;
}

export const CHAIN_PROBERS = Symbol('CHAIN_PROBERS');
