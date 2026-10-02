import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { GatewaySendClient } from './infrastructure/gateway/gateway-send-client.service';

const GATEWAY_DIR = __dirname;

/**
 * Zero-secret gate (dexter gateway todo 6, P50 mirror).
 *
 * The gateway path carries vault ids only: the plaintext token never
 * appears in gateway request bodies, and no gateway file logs secrets
 * (no console.*). Fails the suite if a token-shaped literal sneaks in.
 */
describe('dual-send secret scan', () => {
  const OLD_FETCH = global.fetch;

  afterAll(() => {
    global.fetch = OLD_FETCH;
  });

  it('sends vault ids only (no token in gateway bodies or URLs)', async () => {
    const seen: Array<{ url: string; body: string }> = [];
    global.fetch = (async (
      url: unknown,
      init?: {
        body?: unknown;
      },
    ) => {
      seen.push({ url: String(url), body: String(init?.body ?? '') });
      return {
        ok: true,
        status: 200,
        json: async () => ({ ok: true, message_id: 1 }),
      };
    }) as unknown as typeof fetch;
    const botConfig = { get: () => ({ botsGatewayBaseUrl: 'http://gw:4070' }) };
    const client = new GatewaySendClient(botConfig as never, undefined);
    await client.sendViaGateway({
      botId: 'vault-1',
      chatId: '42',
      text: 'SCAN',
      clientMsgId: 'scan-1',
    });
    expect(seen).toHaveLength(1);
    expect(seen[0].url).toBe('http://gw:4070/api/bots/vault-1/send');
    expect(seen[0].body).not.toMatch(/999:|BOT_TOKEN/);
  });

  it('has no console.* logging in gateway + parity + migration sources', () => {
    const files = [
      'infrastructure/gateway/gateway-hmac-signer.service.ts',
      'infrastructure/gateway/gateway-bot-mapping.service.ts',
      'infrastructure/gateway/gateway-send-client.service.ts',
      'infrastructure/gateway/send-mode.ts',
      'application/services/dual-send-parity.service.ts',
      'application/use-cases/migrate-bots-to-gateway.use-case.ts',
      'api/http/gateway-migration.controller.ts',
      'api/http/ingress.controller.ts',
      'domain/ports/bots-gateway-sender.port.ts',
    ];
    for (const file of files) {
      const raw = readFileSync(join(GATEWAY_DIR, file), 'utf8');
      expect(`${file}: ${raw}`).not.toMatch(/console\.(log|error|warn|debug)/);
      // Strip comments: env-var NAMES in docs are fine; direct env reads
      // (bypassing DexterBotConfigService) and token literals are not.
      const code = raw
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/(^|\s)\/\/.*$/gm, '$1');
      expect(`${file}: ${code}`).not.toMatch(
        /process\.env\.(DEXTER_BOT_TOKEN|CHAIN_DEXTER_BOT_TOKEN)/,
      );
      expect(`${file}: ${code}`).not.toMatch(/\d{6,}:[A-Za-z0-9_-]{10,}/);
    }
  });
});
