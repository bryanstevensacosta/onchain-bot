import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
/**
 * NOTE (Tramo 3, todo 4, C-DATA-01, gap-7 integrated default): this bot stays
 * INTEGRATED — standalone extraction is todo 9. Its scan path composes the
 * DetectChain + Enrich use cases whose 13 providers are now canonically owned
 * by market-data (`apps/market-data/src/provider/infrastructure/`,
 * re-exported via backend `data-provider/` shims). HTTP cutover lands in
 * todo 5 (G-17, staged `USE_DATA_SERVICE_API` rollout); until then local
 * composition is the default. Covered by
 * `market-data-consumers.spec.ts` (same dir).
 */
import { DetectChainUseCase } from 'chain/detection/application/handlers/detect-chain.use-case';
import {
  EnrichTokenUseCase,
  EnrichResult,
} from 'token/enrichment/application/handlers/enrich-token.use-case';
import { TokenSnapshotRepository } from 'token/enrichment/application/ports/token-snapshot.repository';

interface AppConfigShape {
  readonly telegram: {
    readonly chainDexterBotToken: string;
  };
  readonly publishing: {
    readonly chainDexterBot: {
      readonly botToken: string;
    };
  };
}

export interface TokenScanResult {
  readonly symbol: string;
  readonly name: string;
  readonly chain: string;
  readonly address: string;
  readonly priceUsd: number | null;
  readonly priceChange24h: number | null;
  readonly marketCapUsd: number | null;
  readonly fdvUsd: number | null;
  readonly liquidityUsd: number | null;
  readonly liquidityLockedPercent: number | null;
  readonly liquidityBurnedPercent: number | null;
  readonly volume24hUsd: number | null;
  readonly athUsd: number | null;
  readonly athPercentChange: number | null;
  readonly athDaysAgo: number | null;
  readonly holders: number | null;
  readonly top10HolderPercent: number | null;
  readonly top20HolderPercent: number | null;
}

@Injectable()
/**
 * @deprecated Token holder moves to dexter-onchain-bot
 * (`scan/` pipeline + `TelegramBotClient`) via the telegram-bots-gateway
 * (todo 6): `CHAIN_DEXTER_BOT_TOKEN` registers into the gateway vault
 * (`POST /api/dexter-bots/migrate-to-gateway`), answers send via
 * `POST /api/bots/:id/send`. Backend legacy copy; removed at the global
 * cutover (gateway todo 7). Do not extend.
 */
export class TokenScanService {
  private readonly logger = new Logger(TokenScanService.name);
  private readonly botToken: string;

  public constructor(
    private readonly configService: ConfigService,
    private readonly detectChainUseCase: DetectChainUseCase,
    private readonly enrichTokenUseCase: EnrichTokenUseCase,
    private readonly tokenSnapshotRepository: TokenSnapshotRepository,
  ) {
    this.botToken = this.resolveBotToken();
  }

  private resolveBotToken(): string {
    const cfg = this.configService.get<AppConfigShape>('app');
    const token = cfg?.publishing?.chainDexterBot?.botToken;
    if (!token) {
      this.logger.warn('CHAIN_DEXTER_BOT_TOKEN not configured');
      return '';
    }
    return token;
  }

  public getBotToken(): string {
    return this.botToken;
  }

  public async getTokenInfo(
    contractAddress: string,
  ): Promise<TokenScanResult | null> {
    try {
      const chainResult = await this.detectChainUseCase.execute({
        address: contractAddress,
      });
      if (
        !chainResult ||
        !chainResult.resolvedChain ||
        chainResult.resolvedChain === 'unknown'
      ) {
        this.logger.warn(`Chain detection failed for ${contractAddress}`);
        return null;
      }

      const enrichResult: EnrichResult = await this.enrichTokenUseCase.execute({
        chain: chainResult.resolvedChain,
        address: contractAddress,
      });

      if (!enrichResult || !enrichResult.snapshot) {
        this.logger.warn(`Enrichment failed for ${contractAddress}`);
        return null;
      }

      const snapshot = enrichResult.snapshot;

      return {
        symbol: snapshot.primaryPair?.quoteToken ?? '???',
        name: snapshot.name ?? 'Unknown',
        chain: chainResult.resolvedChain,
        address: contractAddress,
        priceUsd: snapshot.priceUsd,
        priceChange24h: snapshot.priceChange24h,
        marketCapUsd: snapshot.marketCapUsd,
        fdvUsd: snapshot.fdvUsd,
        liquidityUsd: snapshot.liquidityUsd,
        liquidityLockedPercent: snapshot.lockedLiquidityPercent,
        liquidityBurnedPercent: snapshot.burnedPercent,
        volume24hUsd: snapshot.volume24hUsd,
        athUsd: snapshot.marketCapUsd,
        athPercentChange: snapshot.priceChange24h,
        athDaysAgo: null,
        holders: snapshot.holders,
        top10HolderPercent: snapshot.top10HolderPercent,
        top20HolderPercent: null,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'unknown error';
      this.logger.error(
        `getTokenInfo failed for ${contractAddress}: ${message}`,
      );
      return null;
    }
  }
}
