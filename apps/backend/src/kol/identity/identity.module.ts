import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ExtractionModule } from 'token/intake/extraction/extraction.module';
import { ParsingModule } from 'token/intake/parsing/parsing.module';
import { KolEventPublisher } from 'kol/identity/application/ports/kol-event.publisher';
import { KolIngestionOrchestratorUseCase } from 'kol/identity/application/handlers/kol-ingestion-orchestrator.use-case';
import { InProcessDomainEventPublisher } from 'shared/common/messaging/in-process-domain-event.publisher';
import { KolRepository } from 'kol/identity/application/ports/kol.repository';
import { RegisterKolUseCase } from 'kol/identity/application/handlers/register-kol.use-case';
import { GetKolUseCase } from 'kol/identity/application/handlers/get-kol.use-case';
import { ListKolsUseCase } from 'kol/identity/application/handlers/list-kols.use-case';
import { ListActiveKolIdsUseCase } from 'kol/identity/application/handlers/list-active-kol-ids.use-case';
import { SetKolLifecycleUseCase } from 'kol/identity/application/handlers/set-kol-lifecycle.use-case';
import { FeedIdentityHttpClient } from 'kol/identity/infrastructure/http/feed-identity-http-client';
import { KolController } from 'kol/identity/api/http/kol.controller';

/**
 * Identity BC module (item 8, telegram-feed-unification).
 *
 * KOL identity moved to ingestion-telegram (`telegram_feed_sources`,
 * `type='kol'`): the local `kols` table is dropped, `TypeOrmKolRepository`,
 * `InMemoryKolRepository`, `KolEntity`, the seeder residues, and the
 * (orphan) resolved-metadata cache are deleted. The `KolRepository` PORT is
 * kept — consumers inject the same token — but the implementation is now
 * `FeedIdentityHttpClient` (reads via `GET {INGESTION_TELEGRAM_URL}/api/feed/sources?type=kol`,
 * fail-open `[]`/`null`, writes throw 501).
 *
 * The CRUD/lifecycle use cases are 501 shims (never silently deleted);
 * `KolController` answers 501 on all 6 routes. Only
 * `KolIngestionOrchestratorUseCase` stays functional (pipeline bridge:
 * reads flow through the port unchanged, extraction/parsing untouched).
 */
@Module({
  imports: [ConfigModule, ExtractionModule, ParsingModule],
  controllers: [KolController],
  providers: [
    RegisterKolUseCase,
    GetKolUseCase,
    ListKolsUseCase,
    ListActiveKolIdsUseCase,
    SetKolLifecycleUseCase,
    FeedIdentityHttpClient,
    {
      provide: KolRepository,
      useExisting: FeedIdentityHttpClient,
    },
    KolIngestionOrchestratorUseCase,
    {
      provide: KolEventPublisher,
      useClass: InProcessDomainEventPublisher,
    },
  ],
  exports: [
    KolRepository,
    KolEventPublisher,
    RegisterKolUseCase,
    KolIngestionOrchestratorUseCase,
  ],
})
export class IdentityModule {}
