import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ChainProberPort,
  ProbeResult,
} from 'chain/detection/domain/ports/chain-prober.port';
import { JsonRpcClient } from 'chain/detection/infrastructure/http/json-rpc.client';

interface AppConfigShape {
  readonly alchemy: { readonly apiKey: string };
}

/**
 * EVM chain prober (Ethereum mainnet via Alchemy).
 *
 * Uses `eth_getCode` to check if the address has contract code.
 * Empty bytecode (`0x`) means EOA or uninitialized account — still a
 * valid Ethereum address, just not a contract.
 *
 * v1 supports Ethereum only. BSC/Base/Arbitrum can be added by swapping
 * the Alchemy subdomain and `chainName`.
 */
@Injectable()
export class EvmChainProberAdapter extends ChainProberPort {
  public readonly chainName = 'ethereum';
  private readonly logger = new Logger(EvmChainProberAdapter.name);
  private readonly client: JsonRpcClient | null;

  public constructor(configService: ConfigService) {
    super();
    const cfg = configService.get<AppConfigShape>('app');
    const apiKey = cfg?.alchemy.apiKey;
    this.client = apiKey
      ? new JsonRpcClient(`https://eth-mainnet.g.alchemy.com/v2/${apiKey}`)
      : null;
    if (!this.client) {
      this.logger.warn(
        'ALCHEMY_API_KEY missing — EVM probing will report responded=false',
      );
    }
  }

  public async probe(address: string): Promise<ProbeResult> {
    if (!this.client) {
      return {
        responded: false,
        isContract: null,
        notes: ['alchemy:no_api_key'],
      };
    }
    if (!/^0x[a-fA-F0-9]{40}$/i.test(address)) {
      return {
        responded: false,
        isContract: null,
        notes: ['evm:format_invalid'],
      };
    }
    try {
      const code = await this.client.call<string>('eth_getCode', [
        address,
        'latest',
      ]);
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
