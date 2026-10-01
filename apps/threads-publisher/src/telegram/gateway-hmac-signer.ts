import { createHash, createHmac, randomUUID } from 'node:crypto';

/**
 * Gateway HMAC signer (canonical METHOD\npath\nts\nnonce\nsha256(rawBody)).
 * Keyless dev (empty secret) returns {} (fail-open, no signing).
 */
export function signGatewayRequest(input: {
  method: string;
  path: string;
  rawBody: string;
  clientId: string;
  clientSecret: string;
  ts?: string;
  nonce?: string;
}): Record<string, string> {
  const secret = (input.clientSecret ?? '').trim();
  if (secret.length === 0) {
    return {};
  }
  const ts = input.ts ?? String(Date.now());
  const nonce = input.nonce ?? randomUUID();
  const bodyHash = createHash('sha256')
    .update(input.rawBody, 'utf8')
    .digest('hex');
  const canonical = `${input.method.toUpperCase()}\n${input.path}\n${ts}\n${nonce}\n${bodyHash}`;
  const sig = createHmac('sha256', secret)
    .update(canonical, 'utf8')
    .digest('hex');
  return {
    'x-client-id': input.clientId,
    'x-ts': ts,
    'x-nonce': nonce,
    'x-signature': sig,
  };
}
