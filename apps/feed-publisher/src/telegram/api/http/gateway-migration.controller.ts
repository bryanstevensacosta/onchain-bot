import { Controller, HttpCode, Post } from '@nestjs/common';
import { MigrateBotsToGatewayUseCase } from '../../application/use-cases/migrate-bots-to-gateway.use-case';

/**
 * Vault migration trigger (telegram-bots-gateway todo 5).
 *
 * `POST /api/content-template-bots/migrate-to-gateway` (201,
 * key-guarded globally like every non-health route) re-encrypts every
 * local `TemplateBot` entry plus the crypto/threads env bots into the
 * gateway vault and records the local→vault id mapping. Responses
 * carry labels/ids only — tokens are never logged or returned.
 */
@Controller('api/content-template-bots')
export class GatewayMigrationController {
  public constructor(private readonly migrate: MigrateBotsToGatewayUseCase) {}

  @Post('migrate-to-gateway')
  @HttpCode(201)
  public async migrateToGateway(): Promise<Record<string, unknown>> {
    const out = await this.migrate.execute();
    return { migrated: out.migrated, failed: out.failed };
  }
}
