import { Injectable } from '@nestjs/common';
import { TrackedMention } from '../../domain/entities/tracked-mention.entity';
import type { RecordCallResult } from '../../domain/entities/tracked-mention.entity';
import { TrackedMentionRepository } from '../ports/tracked-mention.repository';

export interface RecordMentionInput {
  readonly kolId: string;
  readonly chain: string;
  readonly address: string;
  readonly mentionId: string;
  readonly mcAt: number | null;
  readonly seenAt: Date;
}

export interface RecordMentionResult extends RecordCallResult {
  readonly tracked: TrackedMention;
}

/**
 * Records one mention against its (kol, contract) tracker (Tramo 1,
 * todo 12, P8 — direct call fix-1, no event bus).
 *
 * First mention of a kol+contract creates the row (`First time`,
 * `first_mc_at` pinned from the mention's own mc); later mentions fold
 * into the same row (`Nx from last call`, `last_call_mc_at` refreshed).
 */
@Injectable()
export class RecordMentionUseCase {
  public constructor(private readonly tracked: TrackedMentionRepository) {}

  public async execute(input: RecordMentionInput): Promise<RecordMentionResult> {
    const existing = await this.tracked.findByKolContract(
      input.kolId,
      input.chain,
      input.address,
    );
    if (!existing) {
      const created = TrackedMention.create({
        kolId: input.kolId,
        chain: input.chain,
        address: input.address,
        mentionId: input.mentionId,
        mcAt: input.mcAt,
        seenAt: input.seenAt,
      });
      await this.tracked.save(created);
      return {
        tracked: created,
        multiple: created.multiple,
        mcDelta: null,
        isFirst: true,
      };
    }
    const result = existing.recordCall({
      mentionId: input.mentionId,
      mcAt: input.mcAt,
      seenAt: input.seenAt,
    });
    await this.tracked.save(existing);
    return { tracked: existing, ...result };
  }
}
