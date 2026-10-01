import { Module } from '@nestjs/common';
import { ProvidersModule } from 'provider/infrastructure/providers.module';
import { DevHoldingsPort } from './domain/holdings.port';
import { DevHoldingsService } from './application/dev-holdings.service';

@Module({
  imports: [ProvidersModule],
  providers: [
    DevHoldingsService,
    { provide: DevHoldingsPort, useExisting: DevHoldingsService },
  ],
  exports: [DevHoldingsPort, DevHoldingsService],
})
export class HoldersModule {}
