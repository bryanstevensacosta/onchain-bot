import { Injectable, Logger } from '@nestjs/common';
import {
  ChainProberPort,
  ProbeResult,
} from 'chain/detection/domain/ports/chain-prober.port';
import { AlchemyService } from 'data-provider/alchemy/alchemy.service';

/**
 * EVM chain prober (Ethereum mainnet via Alchemy).
 *
 * Uses `eth_getCode` via `AlchemyService` to check if the address has
 * contract code. Empty bytecode (`0x`) means EOA or uninitialized account.
 *
 * v1 supports Ethereum only. BSC/Base/Arbitrum can be added by swapping
 * in a different RPC / prober.
 */
@Injectable()
export class EvmChainProberAdapter extends ChainProberPort {
  public readonly chainName = 'ethereum';
  private readonly logger = new Logger(EvmChainProberAdapter.name);

  public constructor(private readonly alchemy: AlchemyService) {
    super();
  }

  public async probe(address: string): Promise<ProbeResult> {
    if (!/^0x[a-fA-F0-9]{40}$/i.test(address)) {
      return {
        responded: false,
        isContract: null,
        notes: ['evm:format_invalid'],
      };
    }
    if (!this.alchemy.apiKey) {
      return {
        responded: false,
        isContract: null,
        notes: ['alchemy:no_api_key'],
      };
    }
    try {
      const code = await this.alchemy.getCode(address);
      if (code === null) {
        return {
          responded: false,
          isContract: null,
          notes: ['alchemy:no_api_key_or_error'],
        };
      }
      return {
        responded: true,
        isContract: code !== '0x' && code !== '0x0',
        notes: [],
      };
    } catch (err) {
      this.logger.debug(`eth_getCode failed: ${(err as Error).message}`);
      return { responded: false, isContract: null, notes: ['evm:rpc_error'] };
    }
  }
}
