import { Controller, Get, Query } from '@nestjs/common';
import { TokenScanPipeline } from '../../../scan/application/pipeline/token-scan.pipeline';
import { MessageFormatterAdapter } from '../../../scan/infrastructure/formatter/message-formatter';

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
    const token = await this.pipeline.resolve(address);
    if (!token) {
      return { error: 'Token not found' };
    }
    return {
      ...token,
      text: this.formatter.format(token),
    };
  }
}
