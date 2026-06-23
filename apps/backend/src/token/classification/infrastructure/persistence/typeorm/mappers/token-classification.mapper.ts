import { TokenClassification } from 'token/classification/domain/entities/token-classification.entity';
import { ChainId } from 'chain/identity/chain-id.vo';
import { Classification } from 'token/classification/domain/value-objects/classification.vo';
import { SecurityFlag } from 'token/honeypot/domain/value-objects/security-flag.vo';
import { RiskSignal } from 'token/classification/domain/value-objects/risk-signal.vo';
import { TokenClassificationEntity } from 'token/classification/infrastructure/persistence/typeorm/entities/token-classification.entity';

export class TokenClassificationMapper {
  public static toRow(c: TokenClassification): TokenClassificationEntity {
    const row = new TokenClassificationEntity();
    row.id = c.id;
    row.chain = c.chain.value;
    row.address = c.address;
    row.classification = c.classification.value;
    row.securityFlag = c.securityFlag.value;
    row.confidence = c.confidence;
    row.riskWeight = c.riskWeight();
    row.highestSeverity = c.highestSeverity();
    row.snapshotCompleteness = c.snapshotCompleteness;
    row.signals = c.signals.map((s) => ({
      type: s.type,
      severity: s.severity,
      description: s.description,
    }));
    row.classifiedAt = c.classifiedAt;
    return row;
  }

  public static toDomain(row: TokenClassificationEntity): TokenClassification {
    const signals = row.signals.map((s) =>
      RiskSignal.create({
        type: s.type as never,
        severity: s.severity as never,
        description: s.description,
      }),
    );
    return TokenClassification.rehydrate({
      id: row.id,
      chain: ChainId.fromString(row.chain),
      address: row.address,
      classification: Classification.fromString(row.classification),
      securityFlag: SecurityFlag.fromString(row.securityFlag),
      signals,
      snapshotCompleteness: row.snapshotCompleteness,
      confidence: row.confidence,
      classifiedAt: row.classifiedAt,
    });
  }
}
