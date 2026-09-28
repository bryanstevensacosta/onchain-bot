import { Injectable } from '@nestjs/common';
import { ChainProberPort, ProbeResult } from '../../application/ports/chain-prober.port';

/**
 * EvmChainProber (Tramo 3, todo 2, v1 format-only).
 *
 * Accepts 0x + 40 hex. RPC-backed `eth_getCode` evidence (backend
 * EvmChainProberAdapter, read-only reference) lands with the todo-4
 * provider extraction — v1 never claims contract state.
 */
@Injectable()
export class EvmChainProber extends ChainProberPort {
  public readonly chainName = 'ethereum';

  public async probe(address: string): Promise<ProbeResult> {
    if (!/^0x[a-fA-F0-9]{40}$/.test((address ?? '').trim())) {
      return { responded: false, isContract: null, notes: ['evm:format_invalid'] };
    }
    return { responded: true, isContract: null, notes: ['evm:format_valid'] };
  }
}
