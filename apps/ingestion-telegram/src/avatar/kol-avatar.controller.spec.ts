import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import { KolAvatarController } from './kol-avatar.controller';
import { KolAvatarService } from './kol-avatar.service';
import { KolAvatarPhotoPort } from './kol-avatar-photo.port';
import { KOL_AVATAR_PLACEHOLDER_SVG } from './avatar.constants';

describe('KolAvatarController (GET file-or-placeholder 200)', () => {
  let app: INestApplication;
  let root: string;
  let photos: { calls: string[]; result: Buffer | null };

  beforeEach(async () => {
    root = mkdtempSync(join(tmpdir(), 'kol-avatar-ctrl-'));
    photos = {
      calls: [],
      result: Buffer.from('jpeg-bytes'),
    };
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
            fetchChannelPhoto: async (channelId: string) => {
              photos.calls.push(channelId);
              return photos.result;
            },
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

  it('serves a stored avatar with 200', async () => {
    await request(app.getHttpServer())
      .post('/api/kol-avatar/-1001/refresh')
      .expect(201)
      .expect((res) => {
        if (res.body.avatar !== 'fetched') {
          throw new Error(`expected fetched, got ${res.body.avatar}`);
        }
      });
    await request(app.getHttpServer())
      .get('/api/kol-avatar/-1001')
      .expect(200)
      .expect('Content-Type', /image\/jpeg/);
  });

  it('serves the placeholder with 200 when no avatar was fetched', async () => {
    photos.result = null;
    const res = await request(app.getHttpServer()).get('/api/kol-avatar/-1009');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/image\/svg\+xml/);
    const body =
      typeof res.text === 'string'
        ? res.text
        : Buffer.from(res.body as Uint8Array).toString('utf8');
    expect(body).toContain(KOL_AVATAR_PLACEHOLDER_SVG.slice(0, 20));
  });

  it('rejects hostile channel ids with 400', async () => {
    await request(app.getHttpServer()).get('/api/kol-avatar/!!!').expect(400);
  });

  it('explicit refresh reports placeholder on MTProto failure (deferred retry)', async () => {
    photos.result = null;
    const res = await request(app.getHttpServer()).post(
      '/api/kol-avatar/-1007/refresh',
    );
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      channelId: '-1007',
      avatar: 'placeholder',
      avatarUrl: '/api/kol-avatar/-1007',
    });
    // Still servable as placeholder afterwards.
    await request(app.getHttpServer())
      .get('/api/kol-avatar/-1007')
      .expect(200)
      .expect('Content-Type', /image\/svg\+xml/);
  });

  it('serves a pre-existing avatar file without hitting MTProto', async () => {
    mkdirSync(join(root, 'avatar'), { recursive: true });
    writeFileSync(join(root, 'avatar', '-1005.jpg'), 'pre-existing');
    await request(app.getHttpServer())
      .get('/api/kol-avatar/-1005')
      .expect(200)
      .expect('Content-Type', /image\/jpeg/);
    expect(photos.calls).toEqual([]);
  });
});
