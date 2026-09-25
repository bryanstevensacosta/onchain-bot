import { Inject, Injectable, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { DomainError, ErrorCode } from '../../shared/kernel/domain-error';
import { VaultService } from '../../vault/application/vault.service';

export interface BotProfile {
  readonly id: string;
  readonly handle: string;
  readonly botId: number;
  readonly username: string;
  readonly displayName: string;
  readonly avatarUrl: string | null;
}

type FetchFn = (
  url: string,
  init?: { signal?: AbortSignal },
) => Promise<{
  ok: boolean;
  json: () => Promise<unknown>;
  arrayBuffer: () => Promise<ArrayBuffer>;
}>;

interface BotApiEnvelope<T> {
  ok: boolean;
  description?: string;
  result?: T;
}

/**
 * Bot resolver: handle/id/username via Bot API `getMe`, avatar via
 * `getUserProfilePhotos` + `getFile`, cached PERMANENTLY under
 * `uploads/avatars/<vaultId>.jpg` (janitor-excluded by design — no janitor
 * exists in this app). No MTProto here.
 */
@Injectable()
export class BotResolverService {
  public constructor(
    private readonly vault: VaultService,
    private readonly config: ConfigService,
    @Optional() @Inject('FETCH_FN') private readonly fetchFn?: FetchFn,
  ) {}

  public async resolveProfile(vaultId: string): Promise<BotProfile> {
    const meta = await this.vault.get(vaultId);
    const token = await this.vault.decryptToken(vaultId);
    const me = await this.botApi<{
      id: number;
      username?: string;
      first_name?: string;
    }>(token, 'getMe');
    const avatarUrl = await this.resolveAvatar(vaultId, token, me.id);
    return {
      id: vaultId,
      handle: meta.label,
      botId: me.id,
      username: me.username ?? '',
      displayName: me.first_name ?? meta.label,
      avatarUrl,
    };
  }

  public avatarPathFor(vaultId: string): string {
    this.assertSafeId(vaultId);
    const dir = path.resolve(
      process.cwd(),
      this.config.get<string>('app.avatarDir', 'uploads/avatars') ??
        'uploads/avatars',
    );
    return path.join(dir, `${vaultId}.jpg`);
  }

  private async resolveAvatar(
    vaultId: string,
    token: string,
    botId: number,
  ): Promise<string | null> {
    const cached = this.avatarPathFor(vaultId);
    if (fs.existsSync(cached)) return `/api/bots/${vaultId}/avatar`;
    let photos: { total_count: number; photos: { file_id: string }[][] };
    try {
      photos = await this.botApi<{
        total_count: number;
        photos: { file_id: string }[][];
      }>(token, 'getUserProfilePhotos', `user_id=${botId}&limit=1`);
    } catch {
      return null;
    }
    const fileId = photos.photos?.[0]?.[0]?.file_id;
    if (!fileId) return null;
    try {
      const file = await this.botApi<{ file_path: string }>(
        token,
        'getFile',
        `file_id=${fileId}`,
      );
      if (!file.file_path) return null;
      const bytes = await this.downloadFile(token, file.file_path);
      fs.mkdirSync(path.dirname(cached), { recursive: true });
      fs.writeFileSync(cached, Buffer.from(bytes));
      return `/api/bots/${vaultId}/avatar`;
    } catch {
      return null;
    }
  }

  private async botApi<T>(
    token: string,
    method: string,
    query = '',
  ): Promise<T> {
    const url = `https://api.telegram.org/bot${token}/${method}${query ? `?${query}` : ''}`;
    const res = await this.fetchWithTimeout(url);
    const body = (await res.json()) as BotApiEnvelope<T>;
    if (!res.ok || !body.ok || body.result === undefined) {
      throw new DomainError(
        ErrorCode.UPSTREAM,
        `Bot API ${method} failed${body.description ? `: ${body.description}` : ''}`,
      );
    }
    return body.result;
  }

  private async downloadFile(
    token: string,
    filePath: string,
  ): Promise<ArrayBuffer> {
    const res = await this.fetchWithTimeout(
      `https://api.telegram.org/file/bot${token}/${filePath}`,
    );
    if (!res.ok) {
      throw new DomainError(ErrorCode.UPSTREAM, 'Bot API file download failed');
    }
    return res.arrayBuffer();
  }

  private async fetchWithTimeout(url: string) {
    const fetchFn: FetchFn =
      this.fetchFn ?? (globalThis.fetch as unknown as FetchFn);
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 10_000);
    try {
      return await fetchFn(url, { signal: ctrl.signal });
    } finally {
      clearTimeout(timer);
    }
  }

  private assertSafeId(vaultId: string): void {
    if (!/^[A-Za-z0-9_-]+$/.test(vaultId)) {
      throw new DomainError(ErrorCode.VALIDATION, 'invalid bot id', {
        botId: vaultId,
      });
    }
  }
}
