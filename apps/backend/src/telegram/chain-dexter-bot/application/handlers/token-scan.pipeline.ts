import { Injectable } from '@nestjs/common';
import { DetectChainUseCase } from 'chain/detection/application/handlers/detect-chain.use-case';
import { EnrichTokenUseCase } from 'token/enrichment/application/handlers/enrich-token.use-case';
import { ChainIdentifier, ResolvedToken, ScanPipeline } from './resolved-token';

@Injectable()
export class TokenScanPipeline implements ScanPipeline {
  public constructor(
    private readonly detectChainUseCase: DetectChainUseCase,
    private readonly enrichTokenUseCase: EnrichTokenUseCase,
  ) {}

  public async resolve(address: string): Promise<ResolvedToken | null> {
    const chainResult = await this.detectChainUseCase.execute({ address });
    if (
      !chainResult ||
      !chainResult.resolvedChain ||
      chainResult.resolvedChain === 'unknown'
    ) {
      return null;
    }

    const enrichResult = await this.enrichTokenUseCase.execute({
      chain: chainResult.resolvedChain,
      address,
    });
    if (!enrichResult || !enrichResult.snapshot) {
      return null;
    }

    const snapshot = enrichResult.snapshot;
    return {
      address,
      chain: chainResult.resolvedChain as ChainIdentifier,
      symbol: snapshot.primaryPair?.quoteToken ?? '???',
      name: snapshot.name ?? 'Unknown',
      marketCapUsd: snapshot.marketCapUsd ?? null,
      fdvUsd: snapshot.fdvUsd ?? null,
      priceUsd: snapshot.priceUsd ?? null,
      priceChange24h: snapshot.priceChange24h ?? null,
      liquidityUsd: snapshot.liquidityUsd ?? null,
      lockedLiquidityPercent: snapshot.lockedLiquidityPercent ?? null,
      burnedPercent: snapshot.burnedPercent ?? null,
      volume24hUsd: snapshot.volume24hUsd ?? null,
      holders: snapshot.holders ?? null,
      top10HolderPercent: snapshot.top10HolderPercent ?? null,
      top20HolderPercent: null,
      poolAddress: snapshot.primaryPair?.address ?? null,
      source: 'token-scan-service',
    };
  }
}
