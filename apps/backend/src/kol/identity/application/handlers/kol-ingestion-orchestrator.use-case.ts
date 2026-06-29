import { Injectable, Logger } from '@nestjs/common';
import { KolRepository } from 'kol/identity/application/ports/kol.repository';
import { KolEventPublisher } from 'kol/identity/application/ports/kol-event.publisher';
import { TelegramListenerPort } from 'telegram/ingestion/domain/ports/telegram-listener.port';
import { KolId } from 'kol/identity/domain/value-objects/kol-id.vo';
import type { StartIngestionInput } from 'telegram/ingestion/api/input/start-ingestion.input';
import {
  KolMapper,
  KolView,
} from 'kol/identity/application/mappers/kol.mapper';
import { ExtractFromMessageUseCase } from 'token/intake/extraction/application/handlers/extract-from-message.use-case';
import { ParseFromCandidatesUseCase } from 'token/intake/parsing/application/handlers/parse-from-candidates.use-case';
import { ContractAddress } from 'token/identity/contract-address.vo';

/**
 * Bridge use case: connects Telegram ingestion engine with KOL domain.
 *
 * This is the glue between telegram/ingestion (pure engine) and kol/identity
 * (KOL aggregate). It:
 * 1. Marks KOLs as ACTIVE and persists them
 * 2. Subscribes to their Telegram channels via TelegramListenerPort
 * 3. Routes each message through the token pipeline (extraction → parsing)
 *
 * Per fix-1 (Bot Dev ToS §4.3): raw text flows ONLY through direct method
 * calls to ExtractFromMessageUseCase + ParseFromCandidatesUseCase.
 * Events emitted are pure observability signals (no text).
 */
@Injectable()
export class KolIngestionOrchestratorUseCase {
  private readonly logger = new Logger(KolIngestionOrchestratorUseCase.name);

  constructor(
    private readonly kolRepo: KolRepository,
    private readonly listener: TelegramListenerPort,
    private readonly eventPublisher: KolEventPublisher,
    private readonly extractFromMessage: ExtractFromMessageUseCase,
    private readonly parseFromCandidates: ParseFromCandidatesUseCase,
  ) {}

  public async execute(
    input: StartIngestionInput,
  ): Promise<ReadonlyArray<KolView>> {
    const kolIds = input.channelIds.map((id: string) => KolId.fromString(id));
    const kols = await Promise.all(
      kolIds.map((id: KolId) => this.kolRepo.findById(id)),
    );

    for (const kol of kols) {
      if (!kol) continue;
      kol.startListening();
      await this.kolRepo.save(kol);
      await this.eventPublisher.publishAll(kol.commit());
    }

    void this.consumeStream(kolIds.map((id: KolId) => id.value));

    const validKols = kols.filter(
      (k): k is NonNullable<typeof k> => k !== null && k !== undefined,
    );
    return validKols.map((k) => KolMapper.toView(k));
  }

  private async consumeStream(channelIds: string[]): Promise<void> {
    for await (const raw of this.listener.subscribe(channelIds)) {
      await this.processMessage(raw);
    }
  }

  /**
   * Per fix-1: process a raw message via direct method calls (text stays
   * in call stack, never crosses an event bus). The KOL metadata update
   * fires an event (observability only, no text).
   */
  private async processMessage(raw: {
    readonly peerId: string;
    readonly messageId: number;
    readonly text: string;
    readonly occurredAt: Date;
  }): Promise<void> {
    const kolId = KolId.fromString(raw.peerId);
    const kol = await this.kolRepo.findById(kolId);
    if (!kol) return;

    kol.recordMessageIngested(raw.messageId, raw.occurredAt);
    await this.kolRepo.save(kol);
    await this.eventPublisher.publishAll(kol.commit());

    const username = kol.handle?.value ?? null;

    const extractionView = await this.extractFromMessage.execute({
      kolId: raw.peerId,
      messageId: raw.messageId,
      occurredAt: raw.occurredAt,
      text: raw.text,
    });

    if (extractionView.contractAddresses.length > 0) {
      try {
        const contractAddresses = extractionView.contractAddresses.map(
          (c: { value: string; chainHint: string }) => {
            if (c.chainHint === 'evm') {
              return ContractAddress.fromEvm(c.value);
            }
            if (c.chainHint === 'solana') {
              return ContractAddress.fromSolana(c.value);
            }
            return ContractAddress.fromUnknown(c.value);
          },
        );
        await this.parseFromCandidates.execute({
          kolId: raw.peerId,
          messageId: raw.messageId,
          occurredAt: raw.occurredAt,
          rawText: raw.text,
          contractAddresses,
          username,
        });
      } catch (err) {
        if (
          !(err instanceof Error) ||
          !err.message.includes('NO_CONTRACT_ADDRESS')
        ) {
          this.logger.error(
            `Parsing failed for ${raw.peerId}:${raw.messageId}: ${(err as Error).message}`,
          );
        }
      }
    }
  }

  /**
   * On-demand historical backfill for one KOL.
   */
  public async backfillKol(
    kolId: string,
    limit: number,
  ): Promise<{ ingested: number; total: number }> {
    const id = KolId.fromString(kolId);
    const kol = await this.kolRepo.findById(id);
    if (!kol) {
      return { ingested: 0, total: 0 };
    }
    const messages = await this.listener.backfill(kolId, limit);
    let ingested = 0;
    for (const raw of messages) {
      await this.processMessage(raw);
      ingested += 1;
    }
    return { ingested, total: messages.length };
  }
}
