import { ChannelContentFilterConfig } from '../../domain/channel-content-filter-config.entity';

/**
 * A single regex transform rule as consumed by the matching pipeline.
 * Lower priority value = applied first; ties break by creation order.
 */
export interface ChannelFilterRule {
  readonly pattern: string;
  readonly replacement: string;
  readonly flags: string;
  readonly priority: number;
  readonly isActive: boolean;
  readonly createdAt: Date;
}

/**
 * Outbound port: per-channel content-filter rules + CRUD.
 *
 * `channel_id` stays opaque (no FK — sources live in the ingestion
 * service DB). Unknown channels yield `[]`, never an error.
 */
export abstract class ChannelFilterRepository {
  public abstract findFiltersByChannelId(
    channelId: string,
  ): Promise<ReadonlyArray<ChannelFilterRule>>;

  public abstract findAll(): Promise<ReadonlyArray<ChannelContentFilterConfig>>;

  public abstract findById(
    id: string,
  ): Promise<ChannelContentFilterConfig | null>;

  public abstract save(config: ChannelContentFilterConfig): Promise<void>;

  public abstract delete(id: string): Promise<boolean>;
}
