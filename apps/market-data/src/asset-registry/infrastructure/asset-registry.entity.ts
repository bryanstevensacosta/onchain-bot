import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';
import type { AssetRecord } from '../domain/asset-record';

/**
 * Persistent asset registry (Tramo 3, asset-registry).
 *
 * One row per `chain:contract` (contract stored lowercased — the
 * PK-ish dedup contract). `cmcId` is the CoinMarketCap UCID,
 * `geckoId` the CoinGecko id, `providerIds` the per-provider native
 * ids (jsonb). Slow metadata only — never on the hot snapshot path.
 */
@Entity('asset_registry')
@Unique('uq_asset_registry_chain_contract', ['chain', 'contract'])
@Index('ix_asset_registry_chain_contract', ['chain', 'contract'])
@Index('ix_asset_registry_cmc', ['cmcId'])
@Index('ix_asset_registry_gecko', ['geckoId'])
@Index('ix_asset_registry_symbol_chain', ['chain', 'symbol'])
export class AssetRegistryEntity {
  @PrimaryGeneratedColumn('uuid')
  public id!: string;

  @Column({ type: 'text' })
  public chain!: string;

  @Column({ type: 'text' })
  public contract!: string;

  @Column({ type: 'text', nullable: true, default: null })
  public symbol!: string | null;

  @Column({ type: 'text', nullable: true, default: null })
  public name!: string | null;

  @Column({ type: 'int', nullable: true, default: null })
  public cmcId!: number | null;

  @Column({ type: 'text', nullable: true, default: null })
  public geckoId!: string | null;

  @Column({ type: 'jsonb', default: {} })
  public providerIds!: Record<string, string>;

  @Column({ type: 'text', nullable: true, default: null })
  public logoUrl!: string | null;

  @Column({ type: 'text', array: true, default: '{}' })
  public categories!: string[];

  @CreateDateColumn({ type: 'timestamptz' })
  public createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  public updatedAt!: Date;
}

export function toAssetRecord(entity: AssetRegistryEntity): AssetRecord {
  return {
    id: entity.id,
    chain: entity.chain,
    contract: entity.contract,
    symbol: entity.symbol,
    name: entity.name,
    cmcId: entity.cmcId,
    geckoId: entity.geckoId,
    providerIds: { ...(entity.providerIds ?? {}) },
    logoUrl: entity.logoUrl,
    categories: [...(entity.categories ?? [])],
    updatedAt:
      entity.updatedAt instanceof Date
        ? entity.updatedAt.toISOString()
        : String(entity.updatedAt),
  };
}
