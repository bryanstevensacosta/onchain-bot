import { Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { MigrateBotsToGatewayUseCase } from '../../application/use-cases/migrate-bots-to-gateway.use-case';

/**
 * Vault migration trigger (telegram-bots-gateway todo 6).
 *
 * `POST /api/dexter-bots/migrate-to-gateway` (201) registers the
 * `DEXTER_BOT_TOKEN` env token into the gateway vault and records the
 * local `dexter` → vault id mapping. Responses carry labels/ids only —
 * tokens are never logged or returned.
 */
@Controller('api/dexter-bots')
export class GatewayMigrationController {
  public constructor(private readonly migrate: MigrateBotsToGatewayUseCase) {}

  @Post('migrate-to-gateway')
  @HttpCode(HttpStatus.CREATED)
  public async migrateToGateway(): Promise<Record<string, unknown>> {
    const out = await this.migrate.execute();
    return { migrated: out.migrated, failed: out.failed };
  }
}
