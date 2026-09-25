import { Body, Controller, HttpCode, Post, UseGuards } from '@nestjs/common';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { CacheService } from 'cache/cache.service';
import { AddressSnapshotService } from 'address/address-snapshot.service';
import { GatewayRateLimitGuard } from '../../gateway-rate-limit.guard';

const BATCH_TTL_SECONDS = 30;
const BATCH_MAX_ITEMS = 50;

export class BatchItemDto {
  @IsString()
  public chain!: string;

  @IsString()
  public address!: string;

  @IsOptional()
  @IsString()
  public kind?: string;
}

export class BatchRequestDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(BATCH_MAX_ITEMS)
  @ValidateNested({ each: true })
  @Type(() => BatchItemDto)
  public items!: BatchItemDto[];
}

/**
 * Addresses batch edge (Tramo 3, todo 5, G-17).
 *
 * `POST /api/v1/addresses/batch` — `{ items: [{ chain, address,
 * kind? }] }` (1..50) → `{ snapshots: [...] }`. One bad item never
 * fails the batch: it resolves to `{ chain, address, error }` while
 * the rest succeed (adversarial: no silent nulls, explicit errors).
 *
 * Cache: per-item `CacheService.getOrSet` under the SAME key the
 * `CacheInterceptor` uses for the GET edge
 * (`GET:/api/v1/addresses/<chain>/<address>?kind=<kind>`), so batch
 * traffic warms the single-snapshot cache and vice versa (SLO layer
 * for p95<500ms + cache warming).
 */
@UseGuards(GatewayRateLimitGuard)
@Controller('api/v1/addresses')
export class AddressesBatchController {
  public constructor(
    private readonly snapshots: AddressSnapshotService,
    private readonly cache: CacheService,
  ) {}

  @Post('batch')
  @HttpCode(200)
  public async getBatch(
    @Body() body: BatchRequestDto,
  ): Promise<{ snapshots: ReadonlyArray<Record<string, unknown>> }> {
    const snapshots = await Promise.all(
      body.items.map((item) => this.resolveItem(item)),
    );
    return { snapshots };
  }

  private async resolveItem(
    item: BatchItemDto,
  ): Promise<Record<string, unknown>> {
    const kind = item.kind ?? 'token';
    const key = `GET:/api/v1/addresses/${item.chain}/${item.address}?kind=${kind}`;
    try {
      return await this.cache.getOrSet(key, BATCH_TTL_SECONDS, async () => {
        const snap = await this.snapshots.getSnapshot({
          chain: item.chain,
          value: item.address,
          kindHint: item.kind,
        });
        return {
          chain: snap.chain,
          address: snap.address,
          kind: snap.kind,
          key: snap.key,
          status: snap.status,
          providers: snap.providers,
        } as Record<string, unknown>;
      });
    } catch (err) {
      return {
        chain: item.chain,
        address: item.address,
        error: err instanceof Error ? err.message : 'unknown error',
      };
    }
  }
}
