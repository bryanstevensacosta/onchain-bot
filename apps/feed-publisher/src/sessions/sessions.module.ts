import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ContentTemplatesModule } from '../template/content-templates.module';
import { DeduplicationModule } from '../deduplication/deduplication.module';
import { PublishingSessionRepository } from './domain/ports/publishing-session.repository';
import { SessionPublisherPort } from './application/ports/session-publisher.port';
import { PublishingSessionUseCases } from './application/use-cases/publishing-session.use-cases';
import { SessionPublishPlanner } from './application/services/session-publish-planner.service';
import { InMemoryPublishingSessionRepository } from './infrastructure/repositories/in-memory-publishing-session.repository';
import { RecordingSessionPublisher } from './infrastructure/publish/recording-session-publisher.adapter';
import { SessionsController } from './api/http/sessions.controller';
import { SessionsHealthIndicator } from './health/sessions-health.indicator';

/**
 * SessionsModule (Tramo 2, todo 12, P34).
 *
 * Owns the multi-tab BC: `PublishingSession` (template-loaded or
 * ad-hoc, source toggles only, own keywords + matching/publishing/llm
 * switches + own scheduling + N telegram/threads bot targets +
 * active/inactive) + `SessionPublishPlanner` (per-session routing over
 * the SHARED global `DeduplicationService`, P38 per-target pacing) +
 * the recording publisher (live binding; Bot API binding follow-up) +
 * the frontend-backed `SessionsController` + `SessionsHealthIndicator`
 * (P21 hook). Imports the template/bot catalog (one-way, no cycle)
 * and the shared dedup module; the in-memory repo is live, TypeORM
 * deferred (GAP-1).
 */
@Module({
  imports: [ConfigModule, ContentTemplatesModule, DeduplicationModule],
  controllers: [SessionsController],
  providers: [
    PublishingSessionUseCases,
    SessionPublishPlanner,
    SessionsHealthIndicator,
    InMemoryPublishingSessionRepository,
    RecordingSessionPublisher,
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
    SessionPublishPlanner,
    RecordingSessionPublisher,
    SessionsHealthIndicator,
  ],
})
export class SessionsModule {}
