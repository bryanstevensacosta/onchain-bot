import { GatewayMigrationController } from './gateway-migration.controller';

describe('GatewayMigrationController', () => {
  it('returns migrated + failed without leaking tokens', async () => {
    const migrate = {
      execute: jest.fn().mockResolvedValue({
        migrated: [
          { localId: 'local-1', gatewayId: 'vault-aaa', label: 'feed-bot' },
        ],
        failed: [],
      }),
    };
    const controller = new GatewayMigrationController(
      migrate as unknown as import('./migrate-bots-to-gateway.use-case').MigrateBotsToGatewayUseCase,
    );
    const out = (await controller.migrateToGateway()) as Record<
      string,
      unknown
    >;
    expect(out).toEqual({
      migrated: [
        { localId: 'local-1', gatewayId: 'vault-aaa', label: 'feed-bot' },
      ],
      failed: [],
    });
    expect(JSON.stringify(out)).not.toContain('PLAINTEXT');
  });
});
