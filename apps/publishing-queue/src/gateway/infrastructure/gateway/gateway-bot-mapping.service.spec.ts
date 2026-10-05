import { GatewayBotMappingService } from './gateway-bot-mapping.service';

describe('GatewayBotMappingService', () => {
  it('falls back to the local id when unmapped (pre-registered same id)', () => {
    const mapping = new GatewayBotMappingService();
    expect(mapping.resolveGatewayId('bot-local-1')).toBe('bot-local-1');
    expect(mapping.count()).toBe(0);
  });

  it('remembers the vault id minted by the migration run', () => {
    const mapping = new GatewayBotMappingService();
    mapping.register('bot-local-1', 'vault-aaa');
    expect(mapping.resolveGatewayId('bot-local-1')).toBe('vault-aaa');
    expect(mapping.resolveGatewayId('other')).toBe('other');
    expect(mapping.count()).toBe(1);
  });
});
