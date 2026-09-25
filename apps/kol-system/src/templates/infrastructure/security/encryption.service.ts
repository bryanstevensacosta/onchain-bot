import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DomainError, ErrorCode } from '../../../shared/kernel/domain-error';

const ALGORITHM = 'aes-256-gcm';
const IV_BYTES = 12;

/**
 * AES-256-GCM field encryption for bot tokens (Tramo 1, todo 10, P22/P23).
 *
 * Key resolution: 64-hex `ENCRYPTION_KEY` (generated `openssl rand -hex 32`,
 * DISTINCT per env, P24) decodes to 32 bytes directly; any other non-empty
 * shape is hashed with SHA-256 (dev convenience, never production). Empty
 * key → fail-closed `DomainError` (the app must not boot without it —
 * Tier-1 validation already enforces this).
 *
 * Wire format: `${ivHex}:${tagHex}:${dataHex}` (all hex, `:`-joined).
 */
@Injectable()
export class EncryptionService {
  public constructor(private readonly config: ConfigService) {}

  public encrypt(plaintext: string): string {
    if (!plaintext) {
      throw new DomainError(
        ErrorCode.VALIDATION,
        'cannot encrypt empty plaintext',
      );
    }
    const key = this.resolveKey();
    const iv = randomBytes(IV_BYTES);
    const cipher = createCipheriv(ALGORITHM, key, iv);
    const data = Buffer.concat([
      cipher.update(plaintext, 'utf8'),
      cipher.final(),
    ]);
    const tag = cipher.getAuthTag();
    return `${iv.toString('hex')}:${tag.toString('hex')}:${data.toString('hex')}`;
  }

  public decrypt(payload: string): string {
    const key = this.resolveKey();
    const [ivHex, tagHex, dataHex] = (payload ?? '').split(':');
    try {
      if (!ivHex || !tagHex || !dataHex) throw new Error('malformed payload');
      const decipher = createDecipheriv(
        ALGORITHM,
        key,
        Buffer.from(ivHex, 'hex'),
      );
      decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
      return Buffer.concat([
        decipher.update(Buffer.from(dataHex, 'hex')),
        decipher.final(),
      ]).toString('utf8');
    } catch (err) {
      throw new DomainError(ErrorCode.VALIDATION, 'failed to decrypt payload', {
        reason: (err as Error).message,
      });
    }
  }

  private resolveKey(): Buffer {
    const raw =
      this.config.get<string>('app.encryptionKey') ??
      process.env.ENCRYPTION_KEY ??
      '';
    if (!raw.trim()) {
      throw new DomainError(
        ErrorCode.VALIDATION,
        'ENCRYPTION_KEY is required but empty (distinct per env, P24)',
      );
    }
    if (/^[0-9a-fA-F]{64}$/.test(raw.trim())) {
      return Buffer.from(raw.trim(), 'hex');
    }
    return createHash('sha256').update(raw, 'utf8').digest();
  }
}
