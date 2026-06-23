import { HoneypotAnalysis } from 'token/honeypot/domain/entities/honeypot-analysis.entity';
import { ChainId } from 'chain/identity/chain-id.vo';
import { HoneypotRisk } from 'token/honeypot/domain/value-objects/honeypot-risk.vo';
import {
  HoneypotSignal,
  HoneypotSeverity,
} from 'token/honeypot/domain/value-objects/honeypot-signal.vo';
import { HoneypotAnalysisEntity } from 'token/honeypot/infrastructure/persistence/typeorm/entities/honeypot-analysis.entity';

export class HoneypotAnalysisMapper {
  public static toRow(a: HoneypotAnalysis): HoneypotAnalysisEntity {
    const row = new HoneypotAnalysisEntity();
    row.id = a.id;
    row.chain = a.chain.value;
    row.address = a.address;
    row.risk = a.risk.value;
    row.signals = a.signals.map((s) => ({
      type: s.type,
      severity: s.severity,
      description: s.description,
    }));
    row.buyTax = a.buyTax;
    row.sellTax = a.sellTax;
    row.transferTax = a.transferTax;
    row.canSell = a.canSell;
    row.canBuy = a.canBuy;
    row.ownerCanDrain = a.ownerCanDrain;
    row.ownerRenounced = a.ownerRenounced;
    row.isProxy = a.isProxy;
    row.analysisSource = a.analysisSource;
    row.analyzedAt = a.analyzedAt;
    return row;
  }

  public static toDomain(row: HoneypotAnalysisEntity): HoneypotAnalysis {
    const signals = row.signals.map((s) =>
      HoneypotSignal.create({
        type: s.type as never,
        severity: s.severity as unknown as HoneypotSeverity,
        description: s.description,
      }),
    );
    return HoneypotAnalysis.rehydrate({
      id: row.id,
      chain: ChainId.fromString(row.chain),
      address: row.address,
      risk: HoneypotRisk.fromString(row.risk),
      signals,
      buyTax: row.buyTax,
      sellTax: row.sellTax,
      transferTax: row.transferTax,
      canSell: row.canSell,
      canBuy: row.canBuy,
      ownerCanDrain: row.ownerCanDrain,
      ownerRenounced: row.ownerRenounced,
      isProxy: row.isProxy,
      analysisSource: row.analysisSource as
        | 'SIMULATION'
        | 'STATIC'
        | 'HEURISTIC',
      analyzedAt: row.analyzedAt,
    });
  }
}
