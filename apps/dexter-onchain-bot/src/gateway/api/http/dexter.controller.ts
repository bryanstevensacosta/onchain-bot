import { Controller, Get, Inject, Optional, Query } from '@nestjs/common';
import { TokenScanPipeline } from '@/scan/application/pipeline/token-scan.pipeline';
import { MessageFormatterAdapter } from '@/scan/infrastructure/formatter/message-formatter';
import {
  MESSAGE_TEMPLATE_REPOSITORY,
  type MessageTemplateRepository,
} from '@/templates/domain/ports/message-template.repository';
import type { MessageTemplate } from '@/templates/domain/message-template.entity';
import {
  TemplateRendererService,
  type TemplateValues,
} from '@/placeholders/application/template-renderer.service';

/**
 * HTTP lookup surface (dexter-onchain-bot native — no backend equivalent
 * prefix; the backend `chain-dexter/token` controller stays untouched).
 *
 * `GET /dexter/token?address=` — same resolve path as the Telegram
 * commands, for manual QA and operator checks. Lookup-only: read-only
 * card, never a publish.
 *
 * Todo 13: when a `ca` template is active AND renders cleanly, `text`
 * carries the rendered template and `templateUsed` names it; otherwise
 * the legacy built-in shape plus `templateUsed: null`. Error shapes
 * (ambiguous/invalid/not-found/missing-param) are byte-identical to the
 * pre-template contract.
 *
 * Robust-nulls (plan todo 19a): `pending` answers
 * `{ error: 'Token pending — retry shortly', address, pending: true }`
 * (HTTP 200) — copy differs from `Token not found` on purpose.
 */
@Controller('dexter')
export class DexterController {
  public constructor(
    private readonly pipeline: TokenScanPipeline,
    private readonly formatter: MessageFormatterAdapter,
    @Inject(MESSAGE_TEMPLATE_REPOSITORY)
    @Optional()
    private readonly templates?: MessageTemplateRepository | null,
    @Inject(TemplateRendererService)
    @Optional()
    private readonly renderer?: TemplateRendererService | null,
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
    // Robust-nulls wire contract (plan todo 19a, PINNED): pending
    // travels as `{ error, address, pending: true }` over HTTP 200 —
    // never 429/202 bare. The `not-found` byte-contract above is frozen.
    if (outcome.status === 'pending') {
      return {
        error: 'Token pending — retry shortly',
        address: outcome.address,
        pending: true,
      };
    }
    const token = outcome.token;
    const scanCard = this.formatter.formatScanCard(token);
    const legacy = {
      ...token,
      text: this.formatter.format(token),
      scanCard: scanCard.text,
      scanCardParseMode: scanCard.parseMode,
    };
    const active = await this.findActiveCaTemplate();
    if (!active || !this.renderer) {
      return { ...legacy, templateUsed: null };
    }
    try {
      const values: TemplateValues = { ...token };
      const rendered = this.renderer.render(
        active.bodyMarkdown,
        values,
        active.command,
      );
      return {
        ...legacy,
        text: rendered.text,
        templateUsed: {
          command: active.command,
          name: active.name,
          version: active.version,
        },
      };
    } catch {
      return { ...legacy, templateUsed: null };
    }
  }

  private async findActiveCaTemplate(): Promise<MessageTemplate | null> {
    if (!this.templates) {
      return null;
    }
    try {
      const active = await this.templates.findActiveByCommand('ca');
      return active;
    } catch {
      return null;
    }
  }
}
