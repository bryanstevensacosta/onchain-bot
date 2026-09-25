import { Injectable } from '@nestjs/common';
import {
  BotVaultEntry,
  type RedactedBotVaultEntry,
} from '../domain/bot-vault.entity';
import { DomainError, ErrorCode } from '../../shared/kernel/domain-error';
import { EncryptionService } from '../infrastructure/encryption.service';
import { InMemoryBotVaultRepository } from '../infrastructure/in-memory-bot-vault.repository';

/**
 * Internal vault CRUD: callers pass PLAINTEXT tokens, the service encrypts
 * before persisting and only ever returns redacted projections.
 */
@Injectable()
export class VaultService {
  public constructor(
    private readonly repo: InMemoryBotVaultRepository,
    private readonly encryption: EncryptionService,
  ) {}

  public async register(input: {
    label: string;
    token: string;
    ownerApp: string;
  }): Promise<RedactedBotVaultEntry> {
    if (!input.token) {
      throw new DomainError(ErrorCode.VALIDATION, 'token must not be empty');
    }
    const entry = BotVaultEntry.create({
      label: input.label,
      encryptedToken: this.encryption.encrypt(input.token),
      ownerApp: input.ownerApp,
    });
    await this.repo.save(entry);
    return entry.toRedacted();
  }

  public async list(): Promise<RedactedBotVaultEntry[]> {
    const rows = await this.repo.findAll();
    return rows.map((row) => row.toRedacted());
  }

  public async get(id: string): Promise<RedactedBotVaultEntry> {
    return (await this.require(id)).toRedacted();
  }

  public async rotate(
    id: string,
    token: string,
  ): Promise<RedactedBotVaultEntry> {
    if (!token) {
      throw new DomainError(ErrorCode.VALIDATION, 'token must not be empty', {
        botId: id,
      });
    }
    const entry = await this.require(id);
    entry.rotateToken(this.encryption.encrypt(token));
    await this.repo.save(entry);
    return entry.toRedacted();
  }

  public async remove(id: string): Promise<void> {
    await this.require(id);
    await this.repo.delete(id);
  }

  /** Internal-only: plaintext token for Bot API calls (never logged, never in responses). */
  public async decryptToken(id: string): Promise<string> {
    const entry = await this.require(id);
    return this.encryption.decrypt(entry.encryptedToken);
  }

  private async require(id: string): Promise<BotVaultEntry> {
    const entry = await this.repo.findById(id);
    if (!entry) {
      throw new DomainError(ErrorCode.NOT_FOUND, `bot ${id} not found`, {
        botId: id,
      });
    }
    return entry;
  }
}
