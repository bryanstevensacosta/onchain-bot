import { Module } from '@nestjs/common';
import { BotsController } from './api/http/bots.controller';
import { BotResolverService } from './application/bot-resolver.service';
import { VaultModule } from '../vault/vault.module';

@Module({
  imports: [VaultModule],
  controllers: [BotsController],
  providers: [BotResolverService],
  exports: [BotResolverService],
})
export class BotsModule {}
