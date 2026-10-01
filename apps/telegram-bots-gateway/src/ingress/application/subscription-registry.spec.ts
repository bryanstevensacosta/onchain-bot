import { SubscriptionRegistryService } from './subscription-registry.service';
import { IngressModeService } from './ingress-mode.service';

describe('SubscriptionRegistryService + IngressModeService (todo 3, red)', () => {
  let registry: SubscriptionRegistryService;
  let modes: IngressModeService;

  beforeEach(() => {
    registry = new SubscriptionRegistryService();
    modes = new IngressModeService(registry);
  });

  it('registers a bot with a per-route webhook secret (webhook by default)', () => {
    const route = registry.registerBot('bot-1', 'secret-1');
    expect(route.botId).toBe('bot-1');
    expect(route.webhookSecret).toBe('secret-1');
    expect(route.mode).toBe('webhook');
    expect(route.subscribers).toEqual([]);
  });

  it('subscribes kol-system + feed-publisher to the same bot', () => {
    registry.registerBot('bot-1', 'secret-1');
    registry.subscribe('bot-1', {
      appId: 'kol-system',
      url: 'http://kol:3050/ingress',
    });
    registry.subscribe('bot-1', {
      appId: 'feed-publisher',
      url: 'http://feed:3051/ingress',
    });
    const route = registry.get('bot-1');
    expect(route?.subscribers.map((s) => s.appId).sort()).toEqual([
      'feed-publisher',
      'kol-system',
    ]);
  });

  it('enforces webhook-vs-polling exclusivity: never both per bot', () => {
    registry.registerBot('bot-1', 'secret-1');
    expect(modes.getMode('bot-1')).toBe('webhook');
    modes.enablePolling('bot-1');
    expect(modes.getMode('bot-1')).toBe('polling');
    modes.enableWebhook('bot-1');
    expect(modes.getMode('bot-1')).toBe('webhook');
  });

  it('refuses webhook delivery while polling is active', () => {
    registry.registerBot('bot-1', 'secret-1');
    modes.enablePolling('bot-1');
    expect(() => modes.assertWebhookActive('bot-1')).toThrow(
      /mutually exclusive|polling/i,
    );
  });

  it('rejects unknown bots fail-closed', () => {
    expect(() => modes.getMode('ghost')).toThrow(/not found/i);
    expect(() =>
      registry.subscribe('ghost', { appId: 'x', url: 'http://x/' }),
    ).toThrow(/not found/i);
  });
});
