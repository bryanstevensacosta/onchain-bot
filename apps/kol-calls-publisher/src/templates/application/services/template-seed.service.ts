import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { TemplateRepository } from '../../domain/ports/template.repository';
import { PublishingTemplate } from '../../domain/entities/publishing-template.entity';

/**
 * Seeds the default template NAMED `vip-calls` (P14 — a datum, not a
 * module). Dashboard-only (no bot), all sources (empty selector, P16),
 * active on boot. Idempotent: a second run never duplicates.
 */
@Injectable()
export class TemplateSeedService implements OnModuleInit {
  private readonly logger = new Logger(TemplateSeedService.name);

  public constructor(private readonly templates: TemplateRepository) {}

  public async onModuleInit(): Promise<void> {
    const existing = await this.templates.findById('vip-calls');
    if (existing) return;
    await this.templates.save(
      PublishingTemplate.create({ id: 'vip-calls', name: 'vip-calls' }),
    );
    this.logger.log('Seeded default template vip-calls (dashboard-only, P14)');
  }
}
