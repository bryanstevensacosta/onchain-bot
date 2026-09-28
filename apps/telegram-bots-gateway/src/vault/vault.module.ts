import { Module } from '@nestjs/common';
import { VaultController } from './api/http/vault.controller';
import { VaultService } from './application/vault.service';
import { BotBindingService } from './application/bot-binding.service';
import { EncryptionService } from './infrastructure/encryption.service';
import { InMemoryBotVaultRepository } from './infrastructure/in-memory-bot-vault.repository';

@Module({
  controllers: [VaultController],
  providers: [VaultService, BotBindingService, EncryptionService, InMemoryBotVaultRepository],
  exports: [VaultService, BotBindingService, EncryptionService],
})
export class VaultModule {}
