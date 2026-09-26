import { Injectable } from '@nestjs/common';

/**
 * Local bot label → gateway vault id mapping (telegram-bots-gateway
 * todo 6).
 *
 * The gateway mints its own vault ids on register, so dexter keeps the
 * pair from the migration run (`MigrateBotsToGatewayUseCase`, local
 * label `dexter`). Unmapped labels fall back to the local label (lets
 * operators pre-register the same id on both sides). In-memory today —
 * a persisted mapping lands with the global cutover (gateway todo 7).
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
