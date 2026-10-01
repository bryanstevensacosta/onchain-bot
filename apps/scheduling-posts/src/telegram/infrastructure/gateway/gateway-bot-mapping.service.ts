import { Injectable } from '@nestjs/common';

/**
 * Session binding bot id → gateway vault id mapping (P42).
 *
 * The gateway mints its own vault ids on register, so scheduling-posts
 * keeps the pair from the migration run. Every send path resolves
 * through here: unmapped ids fall back to the binding bot id (lets
 * operators pre-register the same id on both sides). In-memory today —
 * persisted at the global cutover.
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
