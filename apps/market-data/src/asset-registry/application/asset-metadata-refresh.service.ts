import { Injectable, Logger, Optional } from '@nestjs/common';
import type { AssetRecord } from '../domain/asset-record';
import { AssetRegistryPort } from '../domain/asset-registry.port';
import { InMemoryAssetRegistryRepository } from '../infrastructure/in-memory-asset-registry.repository';

export interface AssetRefreshOptions {
  readonly intervalMs?: number;
  readonly batchSize?: number;
  readonly delayBetweenItemsMs?: number;
  readonly fetchMetadata?: (
    row: AssetRecord,
  ) => Promise<Partial<Pick<AssetRecord, 'name' | 'symbol' | 'logoUrl' | 'categories'>>>;
}

export const ASSET_REGISTRY_REFRESH_INTERVAL_MS_DEFAULT = 6 * 60 * 60 * 1000;
export const ASSET_REGISTRY_REFRESH_BATCH_DEFAULT = 25;
export const ASSET_REGISTRY_REFRESH_ITEM_DELAY_MS_DEFAULT = 250;

export function resolveRefreshIntervalMs(
  env: NodeJS.ProcessEnv = process.env,
  override?: number,
): number {
  if (override !== undefined && Number.isFinite(override) && override > 0) {
    return override;
  }
  const fromEnv = Number(env.ASSET_REGISTRY_REFRESH_INTERVAL_MS ?? NaN);
  if (Number.isFinite(fromEnv) && fromEnv > 0) {
    return fromEnv;
  }
  return ASSET_REGISTRY_REFRESH_INTERVAL_MS_DEFAULT;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

/**
 * AssetMetadataRefreshService (Tramo 3, asset-registry).
 *
 * Slow-metadata cron: every `intervalMs` (env
 * `ASSET_REGISTRY_REFRESH_INTERVAL_MS`, default 6h) it takes the
 * stalest `batchSize` rows and refreshes them SEQUENTIALLY with a
 * `delayBetweenItemsMs` pause between upstreams (rate-limit aware —
 * one in-flight request at a time, never a burst). Failures are
 * logged and skipped, never thrown (the next tick retries).
 */
@Injectable()
export class AssetMetadataRefreshService {
  private readonly logger = new Logger(AssetMetadataRefreshService.name);
  private timer: ReturnType<typeof setInterval> | null = null;
  private readonly intervalMs: number;
  private readonly batchSize: number;
  private readonly delayBetweenItemsMs: number;
  private readonly fetchMetadata: AssetRefreshOptions['fetchMetadata'];
  private running = false;

  public constructor(
    @Optional() private readonly store: AssetRegistryPort | null = null,
    options?: AssetRefreshOptions,
  ) {
    this.intervalMs = resolveRefreshIntervalMs(process.env, options?.intervalMs);
    this.batchSize = options?.batchSize ?? ASSET_REGISTRY_REFRESH_BATCH_DEFAULT;
    this.delayBetweenItemsMs =
      options?.delayBetweenItemsMs ?? ASSET_REGISTRY_REFRESH_ITEM_DELAY_MS_DEFAULT;
    this.fetchMetadata = options?.fetchMetadata;
  }

  public getIntervalMs(): number {
    return this.intervalMs;
  }

  public start(): void {
    if (this.timer !== null) {
      return;
    }
    this.timer = setInterval(() => {
      void this.refreshOnce().catch((error: unknown) => {
        this.logger.warn('asset refresh tick failed: ' + String(error));
      });
    }, this.intervalMs);
  }

  public stop(): void {
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  public async refreshOnce(store?: AssetRegistryPort | null): Promise<number> {
    if (this.running) {
      return 0;
    }
    const active = store ?? this.store ?? new InMemoryAssetRegistryRepository();
    this.running = true;
    try {
      const stale = await active.listStale(this.batchSize);
      let refreshed = 0;
      for (const row of stale) {
        try {
          if (this.fetchMetadata) {
            const patch = await this.fetchMetadata(row);
            await active.upsert({
              chain: row.chain,
              contract: row.contract,
              symbol: patch.symbol ?? row.symbol,
              name: patch.name ?? row.name,
              logoUrl: patch.logoUrl ?? row.logoUrl,
              categories: patch.categories ?? [...row.categories],
            });
          } else {
            await active.upsert({ chain: row.chain, contract: row.contract });
          }
          refreshed += 1;
        } catch (error: unknown) {
          this.logger.warn('asset refresh skipped ' + row.chain + ':' + row.contract + ': ' + String(error));
        }
        if (this.delayBetweenItemsMs > 0) {
          await sleep(this.delayBetweenItemsMs);
        }
      }
      return refreshed;
    } finally {
      this.running = false;
    }
  }
}
