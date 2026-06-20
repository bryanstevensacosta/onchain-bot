import bs58 from 'bs58';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ChainProberPort,
  ProbeResult,
} from 'discovery/chain-detection/domain/ports/chain-prober.port';
import { JsonRpcClient } from 'discovery/chain-detection/infrastructure/http/json-rpc.client';

interface AppConfigShape {
  readonly helius: {
    readonly apiKey: string;
    readonly mainnet: { readonly rpcUrl: string };
  };
}

/**
 * Solana chain prober (Helius mainnet).
 *
 * Uses `getAccountInfo` to check if the address exists on-chain.
 *
 * Format validation happens BEFORE the RPC call (Base58 decode to 32
 * bytes) — invalid Base58 strings short-circuit with responded=false
 * and a format_invalid note, saving an RPC call.
 */
@Injectable()
export class SolanaChainProberAdapter extends ChainProberPort {
  public readonly chainName = 'solana';
  private readonly logger = new Logger(SolanaChainProberAdapter.name);
  private readonly client: JsonRpcClient | null;

  public constructor(configService: ConfigService) {
    super();
    const cfg = configService.get<AppConfigShape>('app');
    const rpcUrl = cfg?.helius?.mainnet?.rpcUrl;
    this.client = rpcUrl ? new JsonRpcClient(rpcUrl) : null;
    if (!this.client) {
      this.logger.warn(
        'HELIUS_RPC_URL_MAINNET missing — Solana probing will report responded=false',
      );
    }
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

    if (!this.client) {
      return {
        responded: false,
        isContract: null,
        notes: ['solana:no_rpc_url'],
      };
    }

    try {
      const result = await this.client.call<{ value: unknown } | null>(
        'getAccountInfo',
        [address, { encoding: 'base58', commitment: 'confirmed' }],
      );
      return {
        responded: true,
        isContract: result !== null && result.value !== null,
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
