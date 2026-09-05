import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { KolEntity } from 'kol/identity/infrastructure/persistence/typeorm/entities/kol.entity';
import { CryptoNewsSourceEntity } from 'telegram/ingestion/crypto-news/infrastructure/persistence/typeorm/entities/crypto-news-source.entity';

/**
 * Registration result from ingestion-service
 */
export interface RegistrationResult {
  registered: boolean;
  channelUnionSize: number;
  message: string;
}

/**
 * Registration status for health checks
 */
export enum RegistrationStatus {
  UNREGISTERED = 'unregistered',
  REGISTERED = 'registered',
  RETRYING = 'retrying',
  FAILED = 'failed',
}

/**
 * BackendRegistrationClient - Registers backend with ingestion-service
 *
 * Responsibilities:
 * - Register on boot with POST /api/ingestion/backends/register
 * - Keep-alive registration every 5 minutes
 * - Retry with exponential backoff on failure
 * - Provide registration status for health checks
 *
 * Per Requirement: Backend must self-register to enable multi-backend mode
 */
@Injectable()
export class BackendRegistrationClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(BackendRegistrationClient.name);
  private readonly ingestionServiceUrl: string;
  private readonly backendId: string;
  private registrationStatus = RegistrationStatus.UNREGISTERED;
  private lastRegistrationAttempt: Date | null = null;
  private consecutiveFailures = 0;
  private channelUnionSize = 0;

  constructor(
    private readonly config: ConfigService,
    @InjectRepository(KolEntity)
    private readonly kolRepo: Repository<KolEntity>,
    @InjectRepository(CryptoNewsSourceEntity)
    private readonly newsRepo: Repository<CryptoNewsSourceEntity>,
  ) {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const appConfig = this.config.get('app');

    this.ingestionServiceUrl =
      appConfig?.ingestion?.serviceUrl || 'http://localhost:3031';

    this.backendId =
      appConfig?.backendId || process.env.BACKEND_ID || 'production';
  }

  async onModuleInit(): Promise<void> {
    this.logger.log(
      `[BACKEND-REGISTRATION] Initializing with ID: ${this.backendId}`,
    );

    // Initial registration (non-blocking)
    void this.registerWithRetry();
  }

  async onModuleDestroy(): Promise<void> {
    // Graceful unregister (best effort, don't block shutdown)
    this.logger.log('[BACKEND-REGISTRATION] Shutting down');
  }

  /**
   * Get active channel IDs from local database
   * Queries both KOL channels and crypto-news sources
   */
  async getActiveChannels(): Promise<string[]> {
    try {
      // Query KOL channels with lifecycleStatus='ACTIVE'
      const kols = await this.kolRepo.find({
        where: { lifecycleStatus: 'ACTIVE' },
        select: ['kolId'],
      });

      // Query crypto-news sources with lifecycleStatus='ACTIVE' AND isActive=true
      const newsSources = await this.newsRepo.find({
        where: { lifecycleStatus: 'ACTIVE', isActive: true },
        select: ['channelId'],
      });

      const channels = [
        ...kols.map((k) => k.kolId),
        ...newsSources.map((n) => n.channelId),
      ];

      this.logger.log(
        `[BACKEND-REGISTRATION] Found ${channels.length} active channels (${kols.length} KOLs + ${newsSources.length} news)`,
      );

      return channels;
    } catch (error) {
      this.logger.error(
        `[BACKEND-REGISTRATION] Failed to query active channels: ${error instanceof Error ? error.message : String(error)}`,
      );
      // Graceful degradation: return empty array on DB error
      return [];
    }
  }

  /**
   * Register with ingestion-service with retry logic
   */
  private async registerWithRetry(maxAttempts = 5): Promise<void> {
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        this.registrationStatus = RegistrationStatus.RETRYING;
        this.lastRegistrationAttempt = new Date();

        const result = await this.registerWithIngestionService();

        if (result.registered) {
          this.registrationStatus = RegistrationStatus.REGISTERED;
          this.consecutiveFailures = 0;
          this.channelUnionSize = result.channelUnionSize;

          this.logger.log(
            `[BACKEND-REGISTRATION-SUCCESS] Registered as "${this.backendId}" with ${result.channelUnionSize} channels in union`,
          );
          return;
        }
      } catch (error) {
        this.consecutiveFailures++;
        const isLastAttempt = attempt === maxAttempts;

        if (isLastAttempt) {
          this.registrationStatus = RegistrationStatus.FAILED;
          this.logger.error(
            `[BACKEND-REGISTRATION-FAILED] Failed after ${maxAttempts} attempts: ${error instanceof Error ? error.message : String(error)}`,
          );
          return;
        }

        // Exponential backoff: 1s, 2s, 4s, 8s, 16s (capped at 30s)
        const delay = Math.min(Math.pow(2, attempt - 1) * 1000, 30_000);
        this.logger.warn(
          `[BACKEND-REGISTRATION-RETRY] Attempt ${attempt} failed, retrying in ${delay}ms`,
        );
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  /**
   * Register with ingestion-service
   */
  async registerWithIngestionService(): Promise<RegistrationResult> {
    const sourceWhitelist = await this.getActiveChannels();
    const url = `${this.ingestionServiceUrl}/api/ingestion/backends/register`;

    const payload = {
      backendId: this.backendId,
      sourceWhitelist,
      apiVersion: 'v1',
    };

    this.logger.log(
      `[BACKEND-REGISTRATION-REQUEST] POST ${url} with ${sourceWhitelist.length} channels`,
    );

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10_000);

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(
          `Registration failed with status ${response.status}: ${errorText}`,
        );
      }

      const result = (await response.json()) as RegistrationResult;
      return result;
    } catch (error) {
      clearTimeout(timeoutId);

      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error('Registration request timed out after 10s');
      }

      throw error;
    }
  }

  /**
   * Keep-alive: re-register every 5 minutes
   */
  @Cron(CronExpression.EVERY_5_MINUTES)
  async handleKeepAlive(): Promise<void> {
    // Only run keep-alive if we've successfully registered at least once
    if (this.registrationStatus === RegistrationStatus.UNREGISTERED) {
      return;
    }

    this.logger.log(
      '[BACKEND-REGISTRATION-KEEPALIVE] Running keep-alive registration',
    );

    try {
      const result = await this.registerWithIngestionService();

      if (result.registered) {
        this.registrationStatus = RegistrationStatus.REGISTERED;
        this.consecutiveFailures = 0;
        this.channelUnionSize = result.channelUnionSize;
        this.logger.log(
          `[BACKEND-REGISTRATION-KEEPALIVE-SUCCESS] Channel union size: ${result.channelUnionSize}`,
        );
      }
    } catch (error) {
      this.consecutiveFailures++;
      this.logger.warn(
        `[BACKEND-REGISTRATION-KEEPALIVE-FAILED] ${error instanceof Error ? error.message : String(error)}`,
      );

      // If keep-alive fails too many times, trigger full retry
      if (this.consecutiveFailures >= 3) {
        this.logger.error(
          '[BACKEND-REGISTRATION-KEEPALIVE-FAILED] Too many keep-alive failures, triggering full re-registration',
        );
        this.registrationStatus = RegistrationStatus.UNREGISTERED;
        void this.registerWithRetry();
      }
    }
  }

  /**
   * Force re-registration (called when SSE receives 401)
   */
  async forceReregistration(): Promise<void> {
    this.logger.warn(
      '[BACKEND-REGISTRATION-FORCE] Forcing re-registration due to 401',
    );
    this.registrationStatus = RegistrationStatus.UNREGISTERED;
    await this.registerWithRetry();
  }

  /**
   * Get registration status for health checks
   */
  getStatus(): {
    status: RegistrationStatus;
    backendId: string;
    channelUnionSize: number;
    lastAttempt: Date | null;
    consecutiveFailures: number;
  } {
    return {
      status: this.registrationStatus,
      backendId: this.backendId,
      channelUnionSize: this.channelUnionSize,
      lastAttempt: this.lastRegistrationAttempt,
      consecutiveFailures: this.consecutiveFailures,
    };
  }

  /**
   * Check if backend is registered
   */
  isRegistered(): boolean {
    return this.registrationStatus === RegistrationStatus.REGISTERED;
  }

  /**
   * Get backend ID
   */
  getBackendId(): string {
    return this.backendId;
  }
}
