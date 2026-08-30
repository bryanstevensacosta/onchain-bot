import { Module } from '@nestjs/common';
import { DevController } from './dev.controller';
import { TelegramIngestionModule } from 'telegram/ingestion/telegram-ingestion.module';

/**
 * Development module for mock ingestion CLI tools
 * Only wire this module when USE_MOCK_INGESTION=true
 */
@Module({
  imports: [TelegramIngestionModule],
  controllers: [DevController],
})
export class DevModule {}
