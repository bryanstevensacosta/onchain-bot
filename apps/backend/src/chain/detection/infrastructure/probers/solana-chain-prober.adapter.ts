import bs58 from 'bs58';
import { Injectable, Logger } from '@nestjs/common';
import {
  ChainProberPort,
  ProbeResult,
} from 'chain/detection/domain/ports/chain-prober.port';
import { SolanaRpcService } from 'data-provider/solana-rpc/solana-rpc.service';

@Injectable()
export class SolanaChainProberAdapter extends ChainProberPort {
  public readonly chainName = 'solana';
  private readonly logger = new Logger(SolanaChainProberAdapter.name);

  public constructor(private readonly rpc: SolanaRpcService) {
    super();
  }

  public async probe(address: string): Promise<ProbeResult> {
    try {
      const decoded = bs58.decode(address);
      if (decoded.length !== 32) {
        return {
          responded: false,
          isContract: null,
          notes: ['solana:format_not_32_bytes'],
        };
      }
    } catch {
      return {
        responded: false,
        isContract: null,
        notes: ['solana:format_invalid_base58'],
      };
    }
    if (!this.rpc.primaryRpcUrl) {
      return {
        responded: false,
        isContract: null,
        notes: ['solana:no_rpc_url'],
      };
    }
    try {
      const accountInfo = await this.rpc.getAccountInfo(address);
      return {
        responded: true,
        isContract: accountInfo !== null,
        notes: [],
      };
    } catch (err) {
      this.logger.debug(`getAccountInfo failed: ${(err as Error).message}`);
      return {
        responded: false,
        isContract: null,
        notes: ['solana:rpc_error'],
      };
    }
  }
}
