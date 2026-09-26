import {
  Controller,
  HttpCode,
  Post,
  UseFilters,
  UseGuards,
} from '@nestjs/common';
import { DomainExceptionFilter } from '../../../shared/filters/domain-exception.filter';
import { ApiKeyGuard } from '../../../shared/guards/api-key.guard';
import { MigrateBotsToGatewayUseCase } from '../../application/use-cases/migrate-bots-to-gateway.use-case';

/**
 * Vault migration trigger (telegram-bots-gateway todo 4).
 *
 * `POST /api/telegram-bots/migrate-to-gateway` (201, key-guarded)
 * re-encrypts every local `telegram_bots` entry into the gateway vault
 * and records the local→vault id mapping. Responses carry labels/ids
 * only — tokens are never logged or returned.
 */
@Controller('api/telegram-bots')
@UseGuards(ApiKeyGuard)
@UseFilters(DomainExceptionFilter)
export class GatewayMigrationController {
  public constructor(private readonly migrate: MigrateBotsToGatewayUseCase) {}

  @Post('migrate-to-gateway')
  @HttpCode(201)
  public async migrateToGateway(): Promise<Record<string, unknown>> {
    const out = await this.migrate.execute();
    return { migrated: out.migrated, failed: out.failed };
  }
}
