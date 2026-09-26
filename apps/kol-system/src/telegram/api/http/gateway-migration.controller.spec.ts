import { GatewayMigrationController } from './gateway-migration.controller';
import type { MigrateBotsToGatewayUseCase } from '../../application/use-cases/migrate-bots-to-gateway.use-case';

describe('GatewayMigrationController (gateway todo 4, failing-first)', () => {
  it('returns migrated/failed pairs with labels and ids only (no tokens)', async () => {
    const useCase: MigrateBotsToGatewayUseCase = {
      execute: async () => ({
        migrated: [{ localId: 'local-1', gatewayId: 'vault-1', label: 'vip' }],
        failed: [{ localId: 'local-2', label: 'old', reason: 'denied' }],
      }),
    } as MigrateBotsToGatewayUseCase;
    const controller = new GatewayMigrationController(useCase);
    const out = (await controller.migrateToGateway()) as {
      migrated: unknown[];
      failed: unknown[];
    };
    expect(out.migrated).toHaveLength(1);
    expect(out.failed).toHaveLength(1);
    expect(JSON.stringify(out).toLowerCase()).not.toContain('bottoken');
  });
});
