import { Injectable, Optional } from '@nestjs/common';
import { DomainError, ErrorCode } from 'shared/kernel/domain-error';
import type { PublishTarget } from '../../../template/domain/template-target';
import { PublishingSessionRepository } from '../../domain/ports/publishing-session.repository';
import {
  SessionPublisherPort,
  type SessionPublishPlan,
} from '../ports/session-publisher.port';
import { PublishAuditLog } from '../services/publish-audit-log.service';
import { PublishRateLimiter } from '../services/publish-rate-limiter.service';
import { SessionPublishAuthorizer } from '../services/session-publish-authorizer.service';
import { GatewayBotMappingService } from '../../../telegram/infrastructure/gateway/gateway-bot-mapping.service';

export interface PublishSessionMessageInput {
  readonly sessionId: string;
  readonly target: PublishTarget;
  readonly botId: string;
  readonly chatId: string;
  readonly content: string;
}

/**
 * Explicit session publish (Tramo 2, todo 14, P50;
 * gateway routing telegram-bots-gateway todo 5).
 *
 * Ownership-enforced single-message publish behind
 * POST /api/sessions/:id/publish: unknown sessions 404, foreign
 * bindings/bots/channels 403 (audited as blocked), over-budget
 * sessions 429 (audited as rate-limited). Only authorized,
 * in-budget attempts reach the publisher, and every attempt lands in
 * the audit log (routing facts only, never tokens).
 *
 * Vault ids (todo 5): the plan `botId` resolves through the
 * `GatewayBotMappingService` when wired — sessions/targets keep
 * working after `POST /api/content-template-bots/migrate-to-gateway`
 * because the recorded plan already carries the vault id the gateway
 * expects. Unmapped ids pass through unchanged (all existing specs).
 */
@Injectable()
export class PublishSessionMessageUseCase {
  public constructor(
    private readonly sessions: PublishingSessionRepository,
    private readonly authorizer: SessionPublishAuthorizer,
    private readonly limiter: PublishRateLimiter,
    private readonly publisher: SessionPublisherPort,
    private readonly audit: PublishAuditLog,
    @Optional()
    private readonly mapping?: GatewayBotMappingService,
  ) {}

  public async execute(input: PublishSessionMessageInput): Promise<{
    plan: SessionPublishPlan;
  }> {
    const session = await this.sessions.findById(input.sessionId);
    if (!session) {
      throw new DomainError(
        ErrorCode.NOT_FOUND,
        `unknown session: ${input.sessionId}`,
      );
    }
    try {
      await this.authorizer.authorize(
        session,
        input.target,
        input.botId,
        input.chatId,
      );
    } catch (err) {
      this.audit.append({
        sessionId: session.id,
        target: input.target,
        botId: input.botId,
        chatId: input.chatId,
        mode: session.renderMode(),
        result: 'blocked',
        reason: err instanceof Error ? err.message : 'forbidden',
      });
      throw err;
    }
    try {
      this.limiter.check(session.id);
    } catch (err) {
      this.audit.append({
        sessionId: session.id,
        target: input.target,
        botId: input.botId,
        chatId: input.chatId,
        mode: session.renderMode(),
        result: 'rate-limited',
        reason: err instanceof Error ? err.message : 'rate limited',
      });
      throw err;
    }
    const plan: SessionPublishPlan = {
      sessionId: session.id,
      target: input.target,
      botId: this.mapping?.resolveGatewayId(input.botId) ?? input.botId,
      chatId: input.chatId,
      mode: session.renderMode(),
      content: input.content,
    };
    await this.publisher.publish(plan);
    this.audit.append({
      sessionId: plan.sessionId,
      target: plan.target,
      botId: plan.botId,
      chatId: plan.chatId,
      mode: plan.mode,
      result: 'published',
    });
    return { plan };
  }
}
