import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import { KolAvatarController } from './kol-avatar.controller';
import { KolAvatarService } from './kol-avatar.service';
import { KolAvatarPhotoPort } from './kol-avatar-photo.port';
import { TelegramFeedSourceRepository } from '../registry/infrastructure/persistence/typeorm/repositories/typeorm-feed-source.repository';

/**
 * Central todo 12 (P57): `POST /api/kol-avatar/backfill` endpoint.
 */
describe('KolAvatarController backfill endpoint (central todo 12)', () => {
  let app: INestApplication;
  let root: string;

  beforeEach(async () => {
    root = mkdtempSync(join(tmpdir(), 'kol-avatar-backfill-ctrl-'));
    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [KolAvatarController],
      providers: [
        KolAvatarService,
        {
          provide: ConfigService,
          useValue: {
            get: (key: string) =>
              key === 'app' ? { uploads: { root } } : undefined,
          },
        },
        {
          provide: KolAvatarPhotoPort,
          useValue: {
            fetchChannelPhoto: async () => Buffer.from('jpeg-bytes'),
          },
        },
        {
          provide: TelegramFeedSourceRepository,
          useValue: {
            findAll: async () => [
              { channelId: '-1001', handle: 'alpha' },
              { channelId: '-1002', handle: null },
            ],
            findByChannelId: async (channelId: string) => ({
              channelId,
              avatarPath: null,
              avatarUpdatedAt: null,
            }),
            save: async (row: unknown) => row,
          },
        },
      ],
    }).compile();
    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterEach(async () => {
    await app.close();
    rmSync(root, { recursive: true, force: true });
  });

  it('backfills missing avatars and reports totals with 201', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/kol-avatar/backfill')
      .expect(201);
    expect(res.body).toMatchObject({ checked: 2 });
    expect(res.body.fetched).toBe(2);
    // Both ids servable afterwards (file, not placeholder).
    await request(app.getHttpServer())
      .get('/api/kol-avatar/-1001')
      .expect(200)
      .expect('Content-Type', /image\/jpeg/);
    await request(app.getHttpServer())
      .get('/api/kol-avatar/-1002')
      .expect(200)
      .expect('Content-Type', /image\/jpeg/);
  });
});
