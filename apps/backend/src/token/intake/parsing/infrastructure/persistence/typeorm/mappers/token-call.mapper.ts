import { TokenCall } from 'token/intake/parsing/domain/entities/token-call.entity';
import { ContractAddress } from 'token/identity/contract-address.vo';
import { ParsedContract } from 'token/intake/parsing/domain/value-objects/parsed-contract.vo';
import { TokenMetrics } from 'shared/common/value-objects/token-metrics.vo';
import { TokenCallEntity } from 'token/intake/parsing/infrastructure/persistence/typeorm/entities/token-call.entity';

export class TokenCallMapper {
  public static toRow(c: TokenCall): TokenCallEntity {
    const row = new TokenCallEntity();
    row.id = c.id;
    row.kolId = c.kolId;
    row.messageId = String(c.messageId);
    row.occurredAt = c.occurredAt;
    row.contract = {
      value: c.contract.address.value,
      chainHint: c.contract.address.chainHint as unknown as
        | 'evm'
        | 'solana'
        | 'unknown',
    };
    row.ticker = c.ticker;
    row.name = c.name;
    row.chart = c.chart;
    row.liquidityUsd =
      c.metrics.liquidityUsd !== null ? String(c.metrics.liquidityUsd) : null;
    row.marketCapUsd =
      c.metrics.marketCapUsd !== null ? String(c.metrics.marketCapUsd) : null;
    row.fdvUsd = c.metrics.fdvUsd !== null ? String(c.metrics.fdvUsd) : null;
    row.holders = c.metrics.holders;
    row.confidence = c.confidence;
    return row;
  }

  public static toDomain(row: TokenCallEntity): TokenCall {
    const contractAddress =
      row.contract.chainHint === 'evm'
        ? ContractAddress.fromEvm(row.contract.value)
        : row.contract.chainHint === 'solana'
          ? ContractAddress.fromSolana(row.contract.value)
          : ContractAddress.fromUnknown(row.contract.value);
    const contract = ParsedContract.fromAddresses([contractAddress]);
    const metrics = TokenMetrics.create({
      liquidityUsd: row.liquidityUsd !== null ? Number(row.liquidityUsd) : null,
      marketCapUsd: row.marketCapUsd !== null ? Number(row.marketCapUsd) : null,
      fdvUsd: row.fdvUsd !== null ? Number(row.fdvUsd) : null,
      holders: row.holders,
    });
    return TokenCall.rehydrate({
      id: row.id,
      kolId: row.kolId,
      messageId: Number(row.messageId),
      occurredAt: row.occurredAt,
      contract,
      ticker: row.ticker,
      name: row.name,
      metrics,
      chart: row.chart,
      confidence: row.confidence,
    });
  }
}
