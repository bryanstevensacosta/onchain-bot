import { GatewayBotMappingService } from './gateway-bot-mapping.service';

describe('GatewayBotMappingService', () => {
  it('resolves registered pairs and falls back to the local id', () => {
    const mapping = new GatewayBotMappingService();
    expect(mapping.resolveGatewayId('bot_X')).toBe('bot_X');
    mapping.register('bot_X', 'vault-1');
    expect(mapping.resolveGatewayId('bot_X')).toBe('vault-1');
    expect(mapping.count()).toBe(1);
  });
});
