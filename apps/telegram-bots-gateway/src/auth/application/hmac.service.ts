import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { Injectable } from '@nestjs/common';

/**
 * HMAC-SHA256 request signing (todo 2, service-to-service auth).
 *
 * Canonical string: `METHOD\npath\ntimestamp\nnonce\nbodyHash`
 * (`bodyHash` = sha256 hex of the raw request bytes, empty string when
 * there is no body). Signatures are hex digests compared with
 * `timingSafeEqual`. This service never logs secrets or signatures.
 */
@Injectable()
export class HmacService {
  public bodyHash(body?: Buffer | string): string {
    return createHash('sha256')
      .update(body === undefined ? '' : body)
      .digest('hex');
  }

  public canonical(
    method: string,
    path: string,
    timestamp: string,
    nonce: string,
    bodyHash: string,
  ): string {
    return [method.toUpperCase(), path, timestamp, nonce, bodyHash].join('\n');
  }

  public sign(
    secret: string,
    method: string,
    path: string,
    timestamp: string,
    nonce: string,
    body?: Buffer | string,
  ): string {
    return createHmac('sha256', secret)
      .update(this.canonical(method, path, timestamp, nonce, this.bodyHash(body)))
      .digest('hex');
  }

  public verify(
    secret: string,
    signature: string,
    method: string,
    path: string,
    timestamp: string,
    nonce: string,
    body?: Buffer | string,
  ): boolean {
    let presented: Buffer;
    try {
      presented = Buffer.from(signature, 'hex');
    } catch {
      return false;
    }
    if (presented.length !== 32) return false;
    const expected = Buffer.from(
      this.sign(secret, method, path, timestamp, nonce, body),
      'hex',
    );
    return timingSafeEqual(presented, expected);
  }
}
