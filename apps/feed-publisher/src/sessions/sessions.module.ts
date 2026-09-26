import { Module, forwardRef } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ContentTemplatesModule } from '../template/content-templates.module';
import { DeduplicationModule } from '../deduplication/deduplication.module';
import { TelegramModule } from '../telegram/telegram.module';
import { PublishingSessionRepository } from './domain/ports/publishing-session.repository';
import { SessionPublisherPort } from './application/ports/session-publisher.port';
import { PublishingSessionUseCases } from './application/use-cases/publishing-session.use-cases';
import { PublishSessionMessageUseCase } from './application/use-cases/publish-session-message.use-case';
import { SessionPublishAuthorizer } from './application/services/session-publish-authorizer.service';
import { SessionPublishPlanner } from './application/services/session-publish-planner.service';
import { PublishAuditLog } from './application/services/publish-audit-log.service';
import { PublishRateLimiter } from './application/services/publish-rate-limiter.service';
import { InMemoryPublishingSessionRepository } from './infrastructure/repositories/in-memory-publishing-session.repository';
import { RecordingSessionPublisher } from './infrastructure/publish/recording-session-publisher.adapter';
import { GatewaySessionPublisher } from './infrastructure/publish/gateway-session-publisher.adapter';
import { SessionsController } from './api/http/sessions.controller';
import { PublishAuditController } from './api/http/publish-audit.controller';
import { SessionsHealthIndicator } from './health/sessions-health.indicator';

/**
 * SessionsModule (Tramo 2, todo 12, P34;
 * gateway routing telegram-bots-gateway todo 5).
 *
 * Owns the multi-tab BC: `PublishingSession` (template-loaded or
 * ad-hoc, source toggles only, own keywords + matching/publishing/llm
 * switches + own scheduling + N telegram/threads bot targets +
 * active/inactive) + `SessionPublishPlanner` (per-session routing over
 * the SHARED global `DeduplicationService`, P38 per-target pacing) +
 * the recording publisher (live binding; `GatewaySessionPublisher` is
 * provided + exported for the gateway cutover but NOT live-bound until
 * gateway todo 7) + the frontend-backed `SessionsController` +
 * `SessionsHealthIndicator` (P21 hook). Imports the template/bot
 * catalog (one-way, no cycle) and the shared dedup module; the
 * in-memory repo is live, TypeORM deferred (GAP-1). `TelegramModule`
 * (forwardRef) supplies the vault-id mapping + gateway sender for the
 * explicit publish path — sessions/targets keep working after the
 * vault migration because plans resolve through it.
 */
@Module({
  imports: [
    ConfigModule,
    ContentTemplatesModule,
    DeduplicationModule,
    forwardRef(() => TelegramModule),
  ],
  controllers: [SessionsController, PublishAuditController],
  providers: [
    PublishingSessionUseCases,
    PublishSessionMessageUseCase,
    SessionPublishAuthorizer,
    SessionPublishPlanner,
    PublishAuditLog,
    {
      provide: PublishRateLimiter,
      useFactory: () => new PublishRateLimiter(),
    },
    SessionsHealthIndicator,
    InMemoryPublishingSessionRepository,
    RecordingSessionPublisher,
    GatewaySessionPublisher,
    {
      provide: PublishingSessionRepository,
      useClass: InMemoryPublishingSessionRepository,
    },
    {
      provide: SessionPublisherPort,
      useClass: RecordingSessionPublisher,
    },
  ],
  exports: [
    PublishingSessionRepository,
    SessionPublisherPort,
    PublishingSessionUseCases,
    PublishSessionMessageUseCase,
    SessionPublishPlanner,
    SessionPublishAuthorizer,
    PublishAuditLog,
    PublishRateLimiter,
    RecordingSessionPublisher,
    GatewaySessionPublisher,
    SessionsHealthIndicator,
  ],
})
export class SessionsModule {}
