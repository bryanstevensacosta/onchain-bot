import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { isDatabaseEnabled } from 'shared/common/persistence/database.module';
import { TelegramChannelRepository } from 'ca/ingestion/telegram/application/ports/telegram-channel.repository';
import { TelegramEventPublisher } from 'ca/ingestion/telegram/application/ports/telegram-event.publisher';
import { TelegramListenerPort } from 'ca/ingestion/telegram/domain/ports/telegram-listener.port';
import { ResolvedChannelMetadataRepository } from 'ca/ingestion/telegram/application/ports/resolved-channel-metadata.repository';
import { AddChannelUseCase } from 'ca/ingestion/telegram/application/handlers/add-channel.use-case';
import { GetChannelUseCase } from 'ca/ingestion/telegram/application/handlers/get-channel.use-case';
import { ListChannelsUseCase } from 'ca/ingestion/telegram/application/handlers/list-channels.use-case';
import { StartListeningUseCase } from 'ca/ingestion/telegram/application/handlers/start-listening.use-case';
import { InMemoryTelegramChannelRepository } from 'ca/ingestion/telegram/infrastructure/repositories/in-memory-telegram-channel.repository';
import { InProcessTelegramEventPublisher } from 'ca/ingestion/telegram/infrastructure/messaging/in-process-telegram-event.publisher';
import { JsonResolvedChannelMetadataRepository } from 'ca/ingestion/telegram/infrastructure/persistence/json-resolved-channel-metadata.repository';
import { TypeOrmTelegramChannelRepository } from 'ca/ingestion/telegram/infrastructure/persistence/typeorm/repositories/typeorm-telegram-channel.repository';
import { TelegramChannelEntity } from 'ca/ingestion/telegram/infrastructure/persistence/typeorm/entities/telegram-channel.entity';
import { TelegramMtprotoAdapter } from 'ca/ingestion/telegram/api/mtproto/telegram-mtproto.adapter';
import { TelegramIngestionController } from 'ca/ingestion/telegram/api/http/telegram-ingestion.controller';
import { TelegramChannelSeeder } from 'ca/ingestion/telegram/infrastructure/seeders/telegram-channel.seeder';
import type { AppConfig } from 'shared/common/config/app.config';

@Module({
  imports: [
    ConfigModule,
    ...(isDatabaseEnabled()
      ? [TypeOrmModule.forFeature([TelegramChannelEntity])]
      : []),
  ],
  controllers: [TelegramIngestionController],
  providers: [
    AddChannelUseCase,
    GetChannelUseCase,
    ListChannelsUseCase,
    StartListeningUseCase,
    InMemoryTelegramChannelRepository,
    ...(isDatabaseEnabled() ? [TypeOrmTelegramChannelRepository] : []),
    {
      provide: TelegramChannelRepository,
      inject: [
        ConfigService,
        InMemoryTelegramChannelRepository,
        ...(isDatabaseEnabled() ? [TypeOrmTelegramChannelRepository] : []),
      ],
      useFactory: (
        config: ConfigService,
        inMemory: InMemoryTelegramChannelRepository,
        typeorm?: TypeOrmTelegramChannelRepository,
      ): TelegramChannelRepository => {
        const enabled =
          config.get<AppConfig>('app')?.database?.enabled === true;
        return enabled && typeorm ? typeorm : inMemory;
      },
    },
    {
      provide: TelegramEventPublisher,
      useClass: InProcessTelegramEventPublisher,
    },
    {
      provide: ResolvedChannelMetadataRepository,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const cfg = config.get<AppConfig>('app');
        const filePath =
          cfg?.ingestion?.telegram?.metadataCache?.filePath ??
          `${process.cwd()}/.cache/telegram-channel-metadata.json`;
        return new JsonResolvedChannelMetadataRepository(filePath);
      },
    },
    { provide: TelegramListenerPort, useClass: TelegramMtprotoAdapter },
    TelegramChannelSeeder,
  ],
  exports: [
    TelegramChannelRepository,
    TelegramEventPublisher,
    TelegramListenerPort,
    ResolvedChannelMetadataRepository,
  ],
})
export class TelegramIngestionModule {}
