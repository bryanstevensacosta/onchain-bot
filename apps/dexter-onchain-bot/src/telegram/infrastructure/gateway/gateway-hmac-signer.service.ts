import {
  createHash,
  createHmac,
  randomUUID,
  timingSafeEqual,
} from 'node:crypto';
import { Injectable } from '@nestjs/common';

/**
 * HMAC-SHA256 request signer for the telegram-bots-gateway (todo 6).
 *
 * Mirrors the gateway canonical string (gateway todo 2,
 * `apps/telegram-bots-gateway/src/auth/application/hmac.service.ts`):
 * `METHOD\npath\ntimestamp\nnonce\nsha256(rawBody)` (hex HMAC-SHA256
 * with the per-client secret, compared timing-safe server-side).
 * `path` must be the exact gateway route path (`/api/bots/:id/send`,
 * `/api/vault/bots`) and `rawBody` the exact JSON bytes sent — the guard
 * verifies `rawBody`, not the parsed body.
 *
 * Credentials come from flat env (`BOTS_GATEWAY_CLIENT_ID` /
 * `BOTS_GATEWAY_CLIENT_SECRET`, dexter config style): keyless dev
 * (either empty) returns `{}` — the gateway guard fails open when no
 * clients are registered. Secrets and signatures are never logged here.
 */
@Injectable()
export class GatewayHmacSigner {
  public static bodyHash(rawBody: string): string {
    return createHash('sha256').update(rawBody).digest('hex');
  }

  public static canonical(
    method: string,
    path: string,
    timestamp: string,
    nonce: string,
    bodyHash: string,
  ): string {
    return [method.toUpperCase(), path, timestamp, nonce, bodyHash].join('\n');
  }

  public static sign(
    secret: string,
    method: string,
    path: string,
    timestamp: string,
    nonce: string,
    rawBody: string,
  ): string {
    return createHmac('sha256', secret)
      .update(
        GatewayHmacSigner.canonical(
          method,
          path,
          timestamp,
          nonce,
          GatewayHmacSigner.bodyHash(rawBody),
        ),
      )
      .digest('hex');
  }

  public static verify(
    secret: string,
    signature: string,
    method: string,
    path: string,
    timestamp: string,
    nonce: string,
    rawBody: string,
  ): boolean {
    let presented: Buffer;
    try {
      presented = Buffer.from(signature, 'hex');
    } catch {
      return false;
    }
    if (presented.length !== 32) return false;
    const expected = Buffer.from(
      GatewayHmacSigner.sign(secret, method, path, timestamp, nonce, rawBody),
      'hex',
    );
    return timingSafeEqual(presented, expected);
  }

  public authHeaders(
    method: string,
    path: string,
    rawBody: string,
    opts: { timestamp?: string; nonce?: string } = {},
  ): Record<string, string> {
    const clientId = (process.env.BOTS_GATEWAY_CLIENT_ID ?? '').trim();
    const secret = (process.env.BOTS_GATEWAY_CLIENT_SECRET ?? '').trim();
    if (!clientId || !secret) return {};
    const timestamp = opts.timestamp ?? String(Math.floor(Date.now() / 1000));
    const nonce = opts.nonce ?? randomUUID().replace(/-/g, '');
    return {
      'x-api-key': clientId,
      'x-timestamp': timestamp,
      'x-nonce': nonce,
      'x-signature': GatewayHmacSigner.sign(
        secret,
        method,
        path,
        timestamp,
        nonce,
        rawBody,
      ),
    };
  }
}
