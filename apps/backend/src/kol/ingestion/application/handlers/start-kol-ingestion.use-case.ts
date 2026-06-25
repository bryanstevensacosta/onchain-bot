import { Injectable, Logger } from '@nestjs/common';
import { KolRepository } from 'kol/identity/application/ports/kol.repository';
import { KolEventPublisher } from 'kol/ingestion/application/ports/kol-event.publisher';
import { KolListenerPort } from 'kol/ingestion/domain/ports/kol-listener.port';
import { KolId } from 'kol/identity/domain/value-objects/kol-id.vo';
import type { StartKolIngestionInput } from 'kol/ingestion/api/input/start-kol-ingestion.input';
import {
  KolMapper,
  KolView,
} from 'kol/identity/application/mappers/kol.mapper';
import { ExtractFromMessageUseCase } from 'token/intake/extraction/application/handlers/extract-from-message.use-case';
import { ParseFromCandidatesUseCase } from 'token/intake/parsing/application/handlers/parse-from-candidates.use-case';
import { ContractAddress } from 'token/identity/contract-address.vo';

/**
 * Use case: start the real-time Telegram listener on a set of KOLs.
 *
 * Wires the inbound port (`KolListenerPort`) to the KOLs' lifecycle:
 * each KOL gets marked active, its events are emitted, and the
 * underlying stream is consumed in the background.
 *
 * Per fix-1 (Bot Dev ToS §4.3): the raw text flows ONLY through direct
 * method calls to ExtractFromMessageUseCase + ParseFromCandidatesUseCase.
 * The events emitted are pure observability signals (no text).
 *
 * Fase 4 of the kol-refactor plan: renamed from `StartListeningUseCase`.
 */
@Injectable()
export class StartKolIngestionUseCase {
  private readonly logger = new Logger(StartKolIngestionUseCase.name);

  constructor(
    private readonly kolRepo: KolRepository,
    private readonly listener: KolListenerPort,
    private readonly eventPublisher: KolEventPublisher,
    private readonly extractFromMessage: ExtractFromMessageUseCase,
    private readonly parseFromCandidates: ParseFromCandidatesUseCase,
  ) {}

  public async execute(
    input: StartKolIngestionInput,
  ): Promise<ReadonlyArray<KolView>> {
    const kolIds = input.kolIds.map((id: string) => KolId.fromString(id));
    const kols = await Promise.all(
      kolIds.map((id: KolId) => this.kolRepo.findById(id)),
    );

    for (const kol of kols) {
      if (!kol) continue;
      kol.startListening();
      await this.kolRepo.save(kol);
      await this.eventPublisher.publishAll(kol.commit());
    }

    void this.consumeStream(kolIds.map((id) => id.value));

    return kols
      .filter((k): k is NonNullable<typeof k> => k !== null && k !== undefined)
      .map((k) => KolMapper.toView(k));
  }

  private async consumeStream(kolIds: string[]): Promise<void> {
    for await (const raw of this.listener.subscribe(kolIds)) {
      await this.processMessage(raw);
    }
  }

  /**
   * Per fix-1: process a raw message via direct method calls (text stays
   * in call stack, never crosses an event bus). The KOL metadata update
   * fires an event (observability only, no text).
   */
  private async processMessage(raw: {
    readonly kolId: string;
    readonly messageId: number;
    readonly text: string;
    readonly occurredAt: Date;
  }): Promise<void> {
    const kolId = KolId.fromString(raw.kolId);
    const kol = await this.kolRepo.findById(kolId);
    if (!kol) return;

    kol.recordMessageIngested(raw.messageId, raw.occurredAt);
    await this.kolRepo.save(kol);
    await this.eventPublisher.publishAll(kol.commit());

    const username = kol.handle?.value ?? null;

    // Direct call to extraction (text stays in call stack)
    const extractionView = await this.extractFromMessage.execute({
      kolId: raw.kolId,
      messageId: raw.messageId,
      occurredAt: raw.occurredAt,
      text: raw.text,
    });

    // If extraction found CAs, proceed to parsing (direct call)
    if (extractionView.contractAddresses.length > 0) {
      try {
        const contractAddresses = extractionView.contractAddresses.map((c) => {
          if (c.chainHint === 'evm') {
            return ContractAddress.fromEvm(c.value);
          }
          if (c.chainHint === 'solana') {
            return ContractAddress.fromSolana(c.value);
          }
          return ContractAddress.fromUnknown(c.value);
        });
        await this.parseFromCandidates.execute({
          kolId: raw.kolId,
          messageId: raw.messageId,
          occurredAt: raw.occurredAt,
          rawText: raw.text,
          contractAddresses,
          username,
        });
      } catch (err) {
        // NO_CONTRACT_ADDRESS is absorbed; other errors logged
        if (
          !(err instanceof Error) ||
          !err.message.includes('NO_CONTRACT_ADDRESS')
        ) {
          this.logger.error(
            `Parsing failed for ${raw.kolId}:${raw.messageId}: ${(err as Error).message}`,
          );
        }
      }
    }
  }

  /**
   * On-demand historical backfill for one KOL. Calls the listener's
   * `backfill()` (which fetches `limit` most recent messages via
   * `client.getMessages`) and runs each through the same direct-call
   * pipeline as the live stream.
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
