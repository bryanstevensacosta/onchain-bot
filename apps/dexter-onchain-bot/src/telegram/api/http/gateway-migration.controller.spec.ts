import { GatewayMigrationController } from './gateway-migration.controller';

describe('GatewayMigrationController (dexter gateway todo 6)', () => {
  it('returns migrated/failed labels and ids only', async () => {
    const migrate = {
      execute: async () => ({
        migrated: [
          { localId: 'dexter', gatewayId: 'vault-9', label: 'dexter' },
        ],
        failed: [],
      }),
    };
    const controller = new GatewayMigrationController(migrate as never);
    const out = (await controller.migrateToGateway()) as Record<
      string,
      unknown
    >;
    expect(out).toEqual({
      migrated: [{ localId: 'dexter', gatewayId: 'vault-9', label: 'dexter' }],
      failed: [],
    });
    expect(JSON.stringify(out)).not.toContain('999:');
  });
});
