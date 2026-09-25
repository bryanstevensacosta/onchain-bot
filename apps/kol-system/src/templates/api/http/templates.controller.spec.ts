import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import request from 'supertest';
import { TemplatesModule } from '../../templates.module';
import { TemplateRepository } from '../../domain/ports/template.repository';
import { TelegramAdminVerifierPort } from '../../domain/ports/telegram-admin-verifier.port';
import { SourceValidatorPort } from '../../domain/ports/source-validator.port';
import { PublishingTemplate } from '../../domain/entities/publishing-template.entity';

describe('TemplatesController 11 endpoints (todo 10, failing-first)', () => {
  let app: INestApplication;

  beforeEach(async () => {
    process.env.ENCRYPTION_KEY = 'e'.repeat(64);
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true }), TemplatesModule],
    })
      .overrideProvider(TelegramAdminVerifierPort)
      .useValue({ verifyAdmin: async () => true })
      .overrideProvider(SourceValidatorPort)
      .useValue({
        validateSources: async (ids: string[]) => ({
          valid: ids,
          unknownIds: [],
        }),
      })
      .compile();
    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();
  });

  afterEach(async () => {
    delete process.env.ENCRYPTION_KEY;
    await app.close();
  });

  it('CRUD + activate/deactivate + rankings + pending-approvals + sources', async () => {
    const server = app.getHttpServer();
    // 1-2. POST create + GET list
    await request(server)
      .post('/api/templates')
      .send({ name: 'gems' })
      .expect(201);
    const list = await request(server).get('/api/templates').expect(200);
    expect(list.body.length).toBeGreaterThanOrEqual(1);
    // 3. GET one
    const one = await request(server).get('/api/templates/gems').expect(200);
    expect(one.body.threadConfig).toBeNull();
    expect(one.body.botId).toBeNull();
    // 4. PATCH update
    const patched = await request(server)
      .patch('/api/templates/gems')
      .send({ minVisibleScore: 60 })
      .expect(200);
    expect(patched.body.minVisibleScore).toBe(60);
    // 5-6. deactivate + activate
    await request(server)
      .post('/api/templates/vip-calls/deactivate')
      .expect(201);
    const reactivated = await request(server)
      .post('/api/templates/vip-calls/activate')
      .expect(201);
    expect(reactivated.body.active).toBe(true);
    // 7. rankings (empty: no scored calls yet)
    const rankings = await request(server)
      .get('/api/templates/vip-calls/rankings')
      .expect(200);
    expect(rankings.body.ranked).toEqual([]);
    // 8. pending-approvals stub (approval lands in todo 11)
    const pending = await request(server)
      .get('/api/templates/vip-calls/pending-approvals')
      .expect(200);
    expect(pending.body.pending).toEqual([]);
    // 9. sources selector (P16)
    const sources = await request(server)
      .patch('/api/templates/vip-calls/sources')
      .send({ kolSourceIds: ['ch1'] })
      .expect(200);
    expect(sources.body.kolSourceIds).toEqual(['ch1']);
    // 10. missing template -> 404
    await request(server).get('/api/templates/nope').expect(404);
    // 11. DELETE
    await request(server).delete('/api/templates/gems').expect(200);
    await request(server).get('/api/templates/gems').expect(404);
  });

  it('PATCH /:id/channel verifies admin and stores admin_verified_at', async () => {
    const server = app.getHttpServer();
    const repo = app.get(TemplateRepository);
    await repo.save(PublishingTemplate.create({ id: 't', name: 't' }));
    // bot catalog lives in its own controller; seed via repository through the API
    const created = await request(server)
      .post('/api/telegram-bots')
      .send({ label: 'b', token: '111:TOKEN' })
      .expect(201);
    const res = await request(server)
      .patch('/api/templates/t/channel')
      .send({ botId: created.body.id, channelTarget: '@vip' })
      .expect(200);
    expect(res.body.channelTarget).toBe('@vip');
    expect(res.body.adminVerifiedAt).not.toBeNull();
    expect(res.body.canPublish).toBe(true);
  });
});
