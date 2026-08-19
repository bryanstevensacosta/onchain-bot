import { Api, TelegramClient } from 'telegram';
import type {
  ResolvedChannelMetadata,
  JoinChannelResult,
} from 'telegram/ingestion/shared/domain/ports/telegram-listener.port';

export class TelegramPeerResolver {
  async resolvePeerAsChannel(client: TelegramClient, channelId: string) {
    // If starts with @, treat as username - pass directly to getEntity
    if (channelId.startsWith('@')) {
      return await client.getEntity(channelId);
    }
    // If doesn't match pure numeric (with optional leading -), treat as username/other
    if (!/^-?\d+$/.test(channelId)) {
      return await client.getEntity(channelId);
    }
    // Numeric ID - try with -100 prefix first, then without
    const withPrefix = channelId.startsWith('-100')
      ? channelId
      : `-100${channelId.replace(/^-/, '')}`;
    try {
      return await client.getEntity(withPrefix);
    } catch {
      return await client.getEntity(channelId);
    }
  }

  async resolveChannelMetadata(
    client: TelegramClient,
    channelId: string,
  ): Promise<ResolvedChannelMetadata> {
    const entity = (await this.resolvePeerAsChannel(client, channelId)) as {
      id?: { toString(): string } | number | string;
      title?: string;
      username?: string;
      firstName?: string;
      lastName?: string;
    };
    const resolvedId = entity?.id !== undefined ? String(entity.id) : channelId;
    return {
      peerId: resolvedId,
      title: entity?.title?.trim() || `Telegram channel ${resolvedId}`,
      handle: entity?.username?.trim() || null,
      kind: entity?.title?.trim()
        ? 'channel'
        : entity?.firstName || entity?.lastName
          ? 'user'
          : 'unknown',
    };
  }

  async joinChannel(
    client: TelegramClient,
    peerId: string,
  ): Promise<JoinChannelResult> {
    try {
      const peer = await this.resolvePeerAsChannel(client, peerId);
      await client.invoke(new Api.channels.JoinChannel({ channel: peer }));
      return { joined: true, wasAlreadyMember: false };
    } catch (err) {
      const msg = (err as Error)?.message ?? '';
      if (msg.includes('USER_ALREADY_PARTICIPANT')) {
        return { joined: true, wasAlreadyMember: true };
      }
      if (msg.includes('CHANNEL_PRIVATE') || msg.includes('CHANNEL_INVALID')) {
        return {
          joined: false,
          wasAlreadyMember: false,
          error: `Channel is private or invalid: ${peerId}`,
        };
      }
      if (msg.includes('CHANNELS_TOO_MUCH')) {
        return {
          joined: false,
          wasAlreadyMember: false,
          error: `Account has joined too many channels`,
        };
      }
      if (msg.includes('FLOOD_WAIT')) {
        return {
          joined: false,
          wasAlreadyMember: false,
          error: `Flood wait: ${msg}`,
        };
      }
      return { joined: false, wasAlreadyMember: false, error: msg };
    }
  }
}
