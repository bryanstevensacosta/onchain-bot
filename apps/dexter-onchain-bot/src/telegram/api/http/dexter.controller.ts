import { Controller, Get, Query } from '@nestjs/common';
import { TokenScanPipeline } from '@/scan/application/pipeline/token-scan.pipeline';
import { MessageFormatterAdapter } from '@/scan/infrastructure/formatter/message-formatter';

/**
 * HTTP lookup surface (dexter-onchain-bot native — no backend equivalent
 * prefix; the backend `chain-dexter/token` controller stays untouched).
 *
 * `GET /dexter/token?address=` — same resolve path as the Telegram
 * commands, for manual QA and operator checks. Lookup-only: read-only
 * card, never a publish.
 */
@Controller('dexter')
export class DexterController {
  public constructor(
    private readonly pipeline: TokenScanPipeline,
    private readonly formatter: MessageFormatterAdapter,
  ) {}

  @Get('token')
  public async getToken(@Query('address') address: string): Promise<unknown> {
    if (!address) {
      return { error: 'Address required' };
    }
    const outcome = await this.pipeline.resolveDetailed(address);
    if (outcome.status === 'ambiguous') {
      return {
        error:
          'Ambiguous address — it resolves on more than one chain. Retry with an explicit chain qualifier (chain:address).',
        address: outcome.address,
        candidates: outcome.candidates,
      };
    }
    if (outcome.status === 'invalid') {
      return {
        error: `Invalid address: ${outcome.reason}`,
        address: outcome.address,
      };
    }
    if (outcome.status === 'not-found') {
      return { error: 'Token not found' };
    }
    const token = outcome.token;
    return {
      ...token,
      text: this.formatter.format(token),
    };
  }
}
