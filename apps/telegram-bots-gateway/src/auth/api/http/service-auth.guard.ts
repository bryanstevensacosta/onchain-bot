import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
  Optional,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ClientRegistryService } from '../../application/client-registry.service';
import type { ClientScope } from '../../domain/client-credential';
import { HmacService } from '../../application/hmac.service';
import { NonceStore } from '../../application/nonce-store';
import { REQUIRE_SCOPE_KEY } from './require-scope.decorator';

export interface GatewayClientBinding {
  readonly id: string;
  readonly scopes: readonly ClientScope[];
}

interface GatewayRequest {
  method?: string;
  path?: string;
  url?: string;
  headers?: Record<string, unknown>;
  body?: unknown;
  rawBody?: Buffer | string;
  gatewayClient?: GatewayClientBinding;
}

/**
 * Service-to-service auth guard (todo 2).
 *
 * Headers: `x-api-key` (client id) + `x-timestamp` (unix seconds) +
 * `x-nonce` + `x-signature` (HMAC-SHA256 over the canonical request).
 * Keyless dev (no registered clients) fails open, kol-system mirror.
 *
 * Status discipline: auth problems (unknown client, expired timestamp,
 * bad signature, replayed nonce) -> 401; valid auth with insufficient
 * scope -> 403. Error messages are generic — keys, secrets and
 * signatures are never logged or echoed.
 */
@Injectable()
export class ServiceAuthGuard implements CanActivate {
  public constructor(
    private readonly registry: ClientRegistryService,
    private readonly hmac: HmacService,
    private readonly nonces: NonceStore,
    private readonly reflector: Reflector,
    @Optional()
    @Inject('AUTH_CLOCK_SKEW_SEC')
    private readonly skewSec: number = 300,
  ) {}

  public canActivate(context: ExecutionContext): boolean {
    if (this.registry.isKeyless()) return true;
    const required =
      this.reflector.get<ClientScope>(REQUIRE_SCOPE_KEY, context.getHandler()) ??
      this.reflector.get<ClientScope>(REQUIRE_SCOPE_KEY, context.getClass());
    if (!required) return true;

    const req = context.switchToHttp().getRequest<GatewayRequest>();
    const headers = req.headers ?? {};
    const clientId = String(headers['x-api-key'] ?? '');
    const timestamp = String(headers['x-timestamp'] ?? '');
    const nonce = String(headers['x-nonce'] ?? '');
    const signature = String(headers['x-signature'] ?? '');

    const cred = this.registry.findById(clientId);
    if (!cred) throw new UnauthorizedException('invalid client credentials');

    const ts = Number(timestamp);
    const nowSec = Math.floor(Date.now() / 1000);
    if (!timestamp || !Number.isFinite(ts) || Math.abs(nowSec - ts) > this.skewSec) {
      throw new UnauthorizedException('request timestamp outside allowed window');
    }
    if (!nonce || nonce.length < 8) {
      throw new UnauthorizedException('invalid nonce');
    }
    const bodyBytes = this.rawBodyBytes(req);
    const path = req.path ?? req.url?.split('?')[0] ?? '';
    const valid = this.hmac.verify(
      cred.secret,
      signature,
      req.method ?? 'GET',
      path,
      timestamp,
      nonce,
      bodyBytes,
    );
    if (!valid) throw new UnauthorizedException('invalid signature');
    if (!this.nonces.consume(`${cred.id}:${nonce}`, this.skewSec * 2 * 1000)) {
      throw new UnauthorizedException('nonce already used');
    }
    if (!this.registry.hasScope(cred, required)) {
      throw new ForbiddenException('insufficient scope');
    }
    req.gatewayClient = { id: cred.id, scopes: cred.scopes };
    return true;
  }

  private rawBodyBytes(req: GatewayRequest): Buffer | string {
    if (Buffer.isBuffer(req.rawBody)) return req.rawBody;
    if (typeof req.rawBody === 'string') return req.rawBody;
    if (typeof req.body === 'string') return req.body;
    if (req.body === undefined || req.body === null) return '';
    return JSON.stringify(req.body);
  }
}
