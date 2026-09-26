import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PublishAuditLogService } from './application/services/publish-audit-log.service';

const SRC = join(__dirname, '..');

/**
 * Secret-scan gate (todo 23, P50, failing-first): no bot tokens, API keys or
 * key material may travel through logs, audit entries or HTTP responses.
 */
describe('publish secret-scan gate (todo 23, P50)', () => {
  function srcOf(...parts: string[]): string {
    return readFileSync(join(SRC, ...parts), 'utf8');
  }

  it('audit entries carry no token-shaped fields', () => {
    const audit = new PublishAuditLogService();
    audit.record({
      actor: 'owner-a',
      action: 'publish',
      templateId: 'tpl-1',
      mentionId: 'solana:ABC:k1:1:0',
      channelTarget: '@mirror',
      reason: null,
    });
    const raw = JSON.stringify(audit.findRecent(10)).toLowerCase();
    expect(raw).not.toContain('bottoken');
    expect(raw).not.toContain('x-api-key');
    expect(raw).not.toContain('encryption_key');
  });

  it('publishing HTTP + use-case + audit sources never log secrets', () => {
    const strictFiles = [
      srcOf('telegram', 'api', 'http', 'publishing.controller.ts'),
      srcOf('telegram', 'api', 'http', 'gateway-migration.controller.ts'),
      srcOf(
        'telegram',
        'application',
        'use-cases',
        'publish-from-template.use-case.ts',
      ),
      srcOf(
        'telegram',
        'application',
        'use-cases',
        'manual-publish.use-case.ts',
      ),
      srcOf(
        'telegram',
        'application',
        'use-cases',
        'migrate-bots-to-gateway.use-case.ts',
      ),
      srcOf(
        'telegram',
        'application',
        'services',
        'publish-audit-log.service.ts',
      ),
      srcOf(
        'telegram',
        'application',
        'services',
        'dual-send-parity.service.ts',
      ),
    ];
    for (const body of strictFiles) {
      expect(body).not.toMatch(/console\.(log|debug|info|warn|error)/);
      expect(body).not.toContain('x-api-key');
    }
    // Gateway transport files SET the auth header (header name literal is
    // required) — they must still never log. Token absence is pinned below.
    const gatewayFiles = [
      srcOf(
        'telegram',
        'infrastructure',
        'gateway',
        'gateway-hmac-signer.service.ts',
      ),
      srcOf(
        'telegram',
        'infrastructure',
        'gateway',
        'gateway-send-client.service.ts',
      ),
    ];
    for (const body of gatewayFiles) {
      expect(body).not.toMatch(/console\.(log|debug|info|warn|error)/);
    }
  });

  it('gateway path never carries the catalog token (vault id only)', () => {
    const client = srcOf(
      'telegram',
      'infrastructure',
      'gateway',
      'gateway-send-client.service.ts',
    );
    expect(client).not.toMatch(/botToken/);
    const signer = srcOf(
      'telegram',
      'infrastructure',
      'gateway',
      'gateway-hmac-signer.service.ts',
    );
    expect(signer).not.toMatch(/botToken/);
  });

  it('publishing responses never echo the catalog token', () => {
    const controller = srcOf(
      'telegram',
      'api',
      'http',
      'publishing.controller.ts',
    );
    expect(controller).not.toMatch(/botToken/);
  });
});
