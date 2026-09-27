/**
 * P58 no-duplication guards (central metadata BC).
 *
 * RED-first: pins the adversarial invariants before the module exists —
 * (a) `phone` is stored-never-exposed (no SELECT, no DTO, no log),
 * (b) the avatar directory has ONE owner (metadata re-exports the avatar
 * constants, no second dir name), and
 * (c) registry writes mirror into metadata (dual-write, schema §4 step 1)
 * so the catalog holds subscription state (active/type) while identity
 * (handle/photo) is referenced by id.
 */
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { ConfigService } from '@nestjs/config';
import { KOL_AVATAR_DIR_NAME } from '../avatar/avatar.constants';
import { METADATA_AVATAR_DIR_NAME } from './metadata.constants';
import { RegisterNewsSourceUseCase } from '../registry/application/use-cases/register-news-source.use-case';
import { MetadataService } from './metadata.service';
import type { MetadataPhotoPort } from './metadata-photo.port';
import { MetadataRepository } from './metadata.repository';
import type { TelegramChannelMetadataEntity } from './channel-metadata.entity';

function makeConfig(root: string): ConfigService {
  return {
    get: (key: string) => (key === 'app' ? { uploads: { root } } : undefined),
  } as unknown as ConfigService;
}

describe('metadata no-duplication (P58 adversarial)', () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'metadata-nodup-'));
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('phone is stored-never-exposed: no DTO, no projection, no log carries it', async () => {
    const rows = new Map<string, TelegramChannelMetadataEntity>();
    const repo = {
      findByChannelId: async (channelId: string) => rows.get(channelId) ?? null,
      findAll: async () => [...rows.values()],
      create: (
        channelId: string,
        partial?: Partial<TelegramChannelMetadataEntity>,
      ) => ({ channelId, ...(partial ?? {}) }) as TelegramChannelMetadataEntity,
      save: async (row: TelegramChannelMetadataEntity) => {
        rows.set(row.channelId, row);
        return row;
      },
    } as unknown as MetadataRepository;
    const photos = {
      fetchChannelPhoto: async () => null,
    } as MetadataPhotoPort;
    const service = new MetadataService(makeConfig(root), photos, repo);
    await service.adoptRegistryRow('-1005', {
      handle: null,
      title: 'Some User',
      kind: 'user',
      isBot: false,
      phone: '+15551234567',
    });
    const stored = rows.get('-1005');
    expect(stored?.phone).toBe('+15551234567');
    const view = await service.getView('-1005');
    expect(view).not.toBeNull();
    expect('phone' in (view as Record<string, unknown>)).toBe(false);
    expect(JSON.stringify(view)).not.toContain('5551234567');
  });

  it('avatar storage has a single owner: metadata reuses the avatar dir name', () => {
    expect(METADATA_AVATAR_DIR_NAME).toBe(KOL_AVATAR_DIR_NAME);
    expect(METADATA_AVATAR_DIR_NAME).toBe('avatar');
  });

  it('registry writes mirror into metadata (dual-write, schema §4 step 1)', async () => {
    const mirrored: Array<{ channelId: string }> = [];
    const metadata = {
      adoptRegistryRow: async (channelId: string) => {
        mirrored.push({ channelId });
      },
    };
    const sourceRepo = {
      findByChannelId: async () => null,
      create: (
        channelId: string,
        title: string,
        handle?: string,
        type: 'kol' | 'crypto-news' = 'crypto-news',
      ) =>
        ({
          channelId,
          title,
          handle: handle ?? null,
          type,
          isActive: true,
          lifecycleStatus: 'ACTIVE',
          addedAt: new Date(),
          url: null,
        }) as unknown as Record<string, unknown>,
      save: async (row: Record<string, unknown>) => row,
    };
    const listener = {
      resolveChannelMetadata: async () => {
        throw new Error('MTProto unreachable in unit test');
      },
    };
    const useCase = new RegisterNewsSourceUseCase(
      sourceRepo as never,
      listener as never,
      undefined,
      metadata as never,
    );
    const out = await useCase.execute({
      channelId: '-10042',
      title: 'Mirror Channel',
      type: 'crypto-news',
    });
    expect(out.channelId).toBe('-10042');
    expect(mirrored).toEqual([{ channelId: '-10042' }]);
  });
});
