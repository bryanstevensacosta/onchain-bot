import { Global, Module } from '@nestjs/common';
import { SharedIngestionModule } from './shared/shared-ingestion.module';

@Global()
@Module({
  imports: [SharedIngestionModule],
  exports: [SharedIngestionModule],
})
export class TelegramIngestionModule {}
