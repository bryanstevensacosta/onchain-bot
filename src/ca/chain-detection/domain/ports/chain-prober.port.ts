/**
 * Result of probing a single chain's RPC for an address.
 *
 * `isContract` is null when the RPC didn't respond or returned an error.
 * `responded` distinguishes "RPC works but address has no code" (valid empty)
 * from "RPC is down" (treat as no information).
 */
export interface ProbeResult {
  readonly responded: boolean;
  readonly isContract: boolean | null;
  readonly notes: string[];
}

/**
 * Outbound port: probes a single chain family (EVM or Solana) for an address.
 *
 * Implemented by infrastructure adapters that hit the actual RPC.
 * `probe()` is pure HTTP — no caching, no retry. The use case handles
 * caching and parallel coordination.
 */
export abstract class ChainProberPort {
  public abstract readonly chainName: string;
  public abstract probe(address: string): Promise<ProbeResult>;
}
