import { ChainDetectionResult } from 'chain/detection/domain/entities/chain-detection-result.entity';
import { ChainId } from 'chain/identity/chain-id.vo';
import { ChainDetectionScore } from 'chain/detection/domain/value-objects/chain-detection-score.vo';
import { ChainDetectionResultEntity } from 'chain/detection/infrastructure/persistence/typeorm/entities/chain-detection-result.entity';

export class ChainDetectionResultMapper {
  public static toRow(r: ChainDetectionResult): ChainDetectionResultEntity {
    const row = new ChainDetectionResultEntity();
    row.id = r.id;
    row.address = r.address;
    row.resolvedChain = r.resolvedChain.value;
    row.confidence = r.confidence;
    row.isContract = r.isContract;
    row.scores = r.scores.map((s) => ({
      chain: s.chain.value,
      points: s.points,
      reasons: [...s.reasons],
    }));
    row.detectedAt = r.detectedAt;
    return row;
  }

  public static toDomain(
    row: ChainDetectionResultEntity,
  ): ChainDetectionResult {
    const scores = row.scores.map((s) =>
      ChainDetectionScore.create({
        chain: ChainId.fromString(s.chain),
        points: s.points,
        reasons: s.reasons,
      }),
    );
    return ChainDetectionResult.rehydrate({
      id: row.id,
      address: row.address,
      resolvedChain: ChainId.fromString(row.resolvedChain),
      confidence: row.confidence,
      scores,
      isContract: row.isContract,
      detectedAt: row.detectedAt,
    });
  }
}
