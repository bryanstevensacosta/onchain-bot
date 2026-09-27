import { Module } from '@nestjs/common';
import { ProvidersModule } from 'provider/infrastructure/providers.module';
import { DevHoldingsService } from './application/dev-holdings.service';

@Module({
  imports: [ProvidersModule],
  providers: [DevHoldingsService],
  exports: [DevHoldingsService],
})
export class HoldersModule {}
