import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { KolEventPublisher } from 'kol/ingestion/application/ports/kol-event.publisher';
import { KolListenerPort } from 'kol/ingestion/domain/ports/kol-listener.port';
import { InProcessKolEventPublisher } from 'kol/ingestion/infrastructure/messaging/in-process-kol-event.publisher';
import { KolTelegramMtprotoAdapter } from 'kol/ingestion/api/mtproto/kol-telegram-mtproto.adapter';
import { StartKolIngestionUseCase } from 'kol/ingestion/application/handlers/start-kol-ingestion.use-case';
import { KolRepository } from 'kol/identity/application/ports/kol.repository';
import { InMemoryKolRepository } from 'kol/identity/infrastructure/repositories/in-memory-kol.repository';
import { TypeOrmKolRepository } from 'kol/identity/infrastructure/persistence/typeorm/repositories/typeorm-kol.repository';
import { KolEntity } from 'kol/identity/infrastructure/persistence/typeorm/entities/kol.entity';
import { isDatabaseEnabled } from 'shared/common/persistence/database.module';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ExtractionModule } from 'token/intake/extraction/extraction.module';
import { ParsingModule } from 'token/intake/parsing/parsing.module';

/**
 * Telegram KOL ingestion BC module (Fase 4 of the kol-refactor plan).
 *
 * Owns:
 * - the inbound port `KolListenerPort` (Telegram MTProto)
 * - the event publisher `KolEventPublisher`
 * - the `KolTelegramMtprotoAdapter` (gramjs client)
 * - the `StartKolIngestionUseCase` that wires them to the KOL aggregate
 *   AND orchestrates downstream extraction + parsing via direct calls
 *   (per fix-1: text never crosses an event bus boundary).
 *
 * The KOL CRUD use cases, controller, seeder, and lifecycle live in
 * `kol/identity/` (see `IdentityModule`).
 */
@Module({
  imports: [
    ConfigModule,
    ExtractionModule,
    ParsingModule,
    ...(isDatabaseEnabled() ? [TypeOrmModule.forFeature([KolEntity])] : []),
  ],
  providers: [
    InMemoryKolRepository,
    ...(isDatabaseEnabled() ? [TypeOrmKolRepository] : []),
    {
      provide: KolRepository,
      inject: [
        InMemoryKolRepository,
        ...(isDatabaseEnabled() ? [TypeOrmKolRepository] : []),
      ],
      useFactory: (
        inMemory: InMemoryKolRepository,
        typeorm?: TypeOrmKolRepository,
      ): KolRepository => typeorm ?? inMemory,
    },
    {
      provide: KolEventPublisher,
      useClass: InProcessKolEventPublisher,
    },
    { provide: KolListenerPort, useClass: KolTelegramMtprotoAdapter },
    StartKolIngestionUseCase,
  ],
  exports: [
    KolRepository,
    KolEventPublisher,
    KolListenerPort,
    StartKolIngestionUseCase,
  ],
})
export class KolIngestionModule {}
