import { Injectable } from '@nestjs/common';

/**
 * Local catalog botId → gateway vault id mapping (telegram-bots-gateway
 * todo 4).
 *
 * The gateway mints its own vault ids on register, so kol-system keeps
 * the pair from the migration run (`MigrateBotsToGatewayUseCase`).
 * Unmapped ids fall back to the local id (lets operators pre-register
 * the same id on both sides). In-memory today — a persisted mapping
 * lands with the global cutover (gateway todo 7).
 */
@Injectable()
export class GatewayBotMappingService {
  private readonly rows = new Map<string, string>();

  public register(localId: string, gatewayId: string): void {
    this.rows.set(localId, gatewayId);
  }

  public resolveGatewayId(localId: string): string {
    return this.rows.get(localId) ?? localId;
  }

  public count(): number {
    return this.rows.size;
  }
}
