import { Injectable, Logger } from '@nestjs/common';
import { signGatewayRequest } from './gateway-hmac-signer';

/**
 * Gateway send client: vault botId only — token NEVER crosses.
 * Keyless dev (empty URL) returns skipped without network.
 */
@Injectable()
export class GatewaySendClient {
  private readonly logger = new Logger(GatewaySendClient.name);

  public async sendThreadsText(input: {
    botId: string;
    text: string;
    clientMsgId?: string;
  }): Promise<{ ok: boolean; remoteId?: string; reason?: string }> {
    const base = (process.env.BOTS_GATEWAY_URL ?? '').trim();
    if (!base || !input.botId) {
      return { ok: false, reason: 'gateway not configured' };
    }
    const path = '/api/threads/publish';
    const rawBody = JSON.stringify({
      botId: input.botId,
      text: input.text,
      client_msg_id: input.clientMsgId ?? `${Date.now()}`,
    });
    const headers = signGatewayRequest({
      method: 'POST',
      path,
      rawBody,
      clientId: process.env.BOTS_GATEWAY_CLIENT_ID ?? '',
      clientSecret: process.env.BOTS_GATEWAY_CLIENT_SECRET ?? '',
    });
    try {
      const res = await fetch(`${base}${path}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...headers },
        body: rawBody,
        signal: AbortSignal.timeout(10000),
      });
      const json = (await res.json().catch(() => ({}))) as {
        id?: unknown;
        message?: unknown;
      };
      if (!res.ok) {
        return {
          ok: false,
          reason: `gateway status=${res.status} ${JSON.stringify(json)}`,
        };
      }
      return {
        ok: true,
        remoteId: typeof json.id === 'string' ? json.id : 'gateway-ok',
      };
    } catch (err) {
      this.logger.warn(
        `gateway send failed: ${err instanceof Error ? err.message : 'unknown'}`,
      );
      return {
        ok: false,
        reason: `gateway network: ${err instanceof Error ? err.message : 'unknown'}`,
      };
    }
  }
}
