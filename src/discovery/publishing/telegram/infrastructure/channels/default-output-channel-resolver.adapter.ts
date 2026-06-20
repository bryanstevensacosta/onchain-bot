import { Injectable, Logger } from '@nestjs/common';
import { OutputChannel } from 'discovery/publishing/telegram/domain/value-objects/output-channel.vo';
import { OutputChannelResolverPort } from 'discovery/publishing/telegram/domain/ports/output-channel-resolver.port';

/**
 * Default output channel resolver.
 *
 * v1: hard-coded list of output channels per tier.
 * v2: database-backed config with per-user preferences.
 *
 * To override in production, set environment variables:
 * - PUBLISHING_TELEGRAM_PRIMARY_CHANNELS=myChannel1,myChannel2
 * - PUBLISHING_TELEGRAM_SECONDARY_CHANNELS=...
 * - PUBLISHING_TELEGRAM_PREMIUM_CHANNELS=...
 */
@Injectable()
export class DefaultOutputChannelResolverAdapter extends OutputChannelResolverPort {
  private readonly logger = new Logger(
    DefaultOutputChannelResolverAdapter.name,
  );

  private static readonly PRIMARY: ReadonlyArray<{
    channelId: string;
    username: string;
  }> = [{ channelId: 'OnChainAlphaBot', username: 'OnChainAlphaBot' }];

  private static readonly SECONDARY: ReadonlyArray<{
    channelId: string;
    username: string;
  }> = [{ channelId: 'SpyDefiCalls', username: 'SpyDefiCalls' }];

  private static readonly PREMIUM: ReadonlyArray<{
    channelId: string;
    username: string;
  }> = [{ channelId: 'AlphaPremiumHub', username: 'AlphaPremiumHub' }];

  public listAll(): ReadonlyArray<OutputChannel> {
    return [
      ...DefaultOutputChannelResolverAdapter.PRIMARY.map((c) =>
        OutputChannel.create({ ...c, tier: 'PRIMARY' }),
      ),
      ...DefaultOutputChannelResolverAdapter.SECONDARY.map((c) =>
        OutputChannel.create({ ...c, tier: 'SECONDARY' }),
      ),
      ...DefaultOutputChannelResolverAdapter.PREMIUM.map((c) =>
        OutputChannel.create({ ...c, tier: 'PREMIUM' }),
      ),
    ];
  }

  public listForScore(score: number): ReadonlyArray<OutputChannel> {
    return this.listAll().filter((c) => c.shouldPublish(score));
  }
}
