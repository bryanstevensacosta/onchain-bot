import { Module } from '@nestjs/common';
import { GoplusService } from './goplus.service';

/**
 * GoPlus module (dexter plan todo 71, Fase 1): keyless taxes-only
 * adapter. Keyless ⇒ no config provider (unlike the keyed adapters)
 * and no `forRoot`.
 */
@Module({
  providers: [GoplusService],
  exports: [GoplusService],
})
export class GoplusModule {}
