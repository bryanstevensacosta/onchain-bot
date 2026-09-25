import { Injectable } from '@nestjs/common';
import { ChainProberPort, ProbeResult } from '../../application/ports/chain-prober.port';

/**
 * SolanaChainProber (Tramo 3, todo 2, v1 format-only).
 *
 * Accepts base58 32-44 chars. RPC-backed account evidence lands with
 * the todo-4 provider extraction — v1 never claims account state.
 */
@Injectable()
export class SolanaChainProber extends ChainProberPort {
  public readonly chainName = 'solana';

  public async probe(address: string): Promise<ProbeResult> {
    if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test((address ?? '').trim())) {
      return { responded: false, isContract: null, notes: ['solana:format_invalid'] };
    }
    return { responded: true, isContract: null, notes: ['solana:format_valid'] };
  }
}
