import { GatewayBotMappingService } from './gateway-bot-mapping.service';

describe('GatewayBotMappingService (dexter gateway todo 6)', () => {
  it('maps the local dexter label to the gateway vault id', () => {
    const mapping = new GatewayBotMappingService();
    mapping.register('dexter', 'vault-1');
    expect(mapping.resolveGatewayId('dexter')).toBe('vault-1');
    expect(mapping.count()).toBe(1);
  });

  it('falls back to the local id when unmapped', () => {
    const mapping = new GatewayBotMappingService();
    expect(mapping.resolveGatewayId('dexter')).toBe('dexter');
    expect(mapping.count()).toBe(0);
  });
});
