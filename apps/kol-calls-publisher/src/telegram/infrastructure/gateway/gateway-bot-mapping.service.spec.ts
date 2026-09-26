import { GatewayBotMappingService } from './gateway-bot-mapping.service';

describe('GatewayBotMappingService (gateway todo 4, failing-first)', () => {
  it('maps local catalog ids to gateway vault ids', () => {
    const svc = new GatewayBotMappingService();
    expect(svc.resolveGatewayId('local-1')).toBe('local-1');
    svc.register('local-1', 'vault-abc');
    expect(svc.resolveGatewayId('local-1')).toBe('vault-abc');
    expect(svc.count()).toBe(1);
  });

  it('is idempotent for repeat registrations of the same pair', () => {
    const svc = new GatewayBotMappingService();
    svc.register('local-1', 'vault-abc');
    svc.register('local-1', 'vault-abc');
    expect(svc.count()).toBe(1);
  });
});
