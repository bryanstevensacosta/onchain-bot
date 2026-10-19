import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import {
  classifyTokenSecurity,
  SNAPSHOT_HONEYPOT_REQUEST_TIMEOUT_MS,
  type HoneypotProbe,
} from 'snapshot/domain/snapshot-honeypot';

/**
 * Keyless GoPlus `token_security` adapter (dexter plan todo 71,
 * Fase 1). Plain `@Injectable` — deliberately NOT a
 * `DataProviderPort`: no registry descriptor, no quote-fetcher seat,
 * no outbound bucket. The only consumer is the snapshot tail (the
 * `honeypot` extra), which bounds the leg with the shared 400ms tail
 * budget; this adapter's own axios timeout bounds the abandoned work.
 *
 * CONTRACT (live-verified 2026-10-19):
 * - `GET /api/v1/token_security/{chainId}?contract_addresses={addr}`
 *   — keyless. ONE address per request: a batch >1 returns only the
 *   first entry (sdK doc note), so batching is not an option.
 * - Errors are HTTP-200-by-body: chain unsupported answers
 *   `{"code":2022,…}`; the classifier reads the BODY.
 * - `getTokenSecurity` NEVER throws and NEVER rejects: every
 *   non-verdict outcome (network, timeout, 5xx, non-200, malformed
 *   body) resolves the `transient` verdict — the caller degrades to
 *   an absent field and retries on the next request.
 */
@Injectable()
export class GoplusService {
  private readonly logger = new Logger(GoplusService.name);
  private readonly baseUrl = 'https://api.gopluslabs.io/api/v1';

  public async getTokenSecurity(
    chainId: number,
    address: string,
  ): Promise<HoneypotProbe> {
    const contract = typeof address === 'string' ? address.trim() : '';
    // Pre-network guards: nothing to ask / nothing valid to ask with.
    if (!Number.isFinite(chainId) || chainId <= 0 || contract === '') {
      return { kind: 'transient' };
    }
    try {
      const response = await axios.get(
        `${this.baseUrl}/token_security/${chainId}`,
        {
          params: { contract_addresses: contract },
          timeout: SNAPSHOT_HONEYPOT_REQUEST_TIMEOUT_MS,
        },
      );
      return classifyTokenSecurity(response?.data, contract);
    } catch (err) {
      this.logger.debug(
        `goplus token_security failed (chainId=${chainId} address=${contract}): ` +
          (err as Error).message,
      );
      return { kind: 'transient' };
    }
  }
}
