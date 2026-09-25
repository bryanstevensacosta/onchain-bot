import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import request from 'supertest';
import { TemplatesModule } from '../../templates.module';
import { TemplateRepository } from '../../domain/ports/template.repository';
import { TelegramAdminVerifierPort } from '../../domain/ports/telegram-admin-verifier.port';
import { SourceValidatorPort } from '../../domain/ports/source-validator.port';
import { PublishingTemplate } from '../../domain/entities/publishing-template.entity';

describe('TemplatesController 12 endpoints (todo 10 + todo 22 scoring, failing-first)', () => {
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

  it('PATCH /:id/scoring edits scoring_config with range validation (todo 22, P28)', async () => {
    const server = app.getHttpServer();
    // Defaults visible on read (v1 values).
    const one = await request(server)
      .get('/api/templates/vip-calls')
      .expect(200);
    expect(one.body.scoringConfig.baseScore).toBe(50);
    expect(one.body.scoringConfig.tiers).toEqual({
      strong: 80,
      decent: 60,
      neutral: 40,
      risky: 20,
    });
    // Happy path: partial patch merges over defaults.
    const patched = await request(server)
      .patch('/api/templates/vip-calls/scoring')
      .send({ baseScore: 10, gates: { minScore: 0 } })
      .expect(200);
    expect(patched.body.scoringConfig.baseScore).toBe(10);
    expect(patched.body.scoringConfig.gates.minScore).toBe(0);
    expect(patched.body.scoringConfig.bonuses.liquidityHigh).toBe(20);
    // Invalid ranges -> 400 (DTO validation).
    await request(server)
      .patch('/api/templates/vip-calls/scoring')
      .send({ baseScore: 101 })
      .expect(400);
    // Invalid ordering passes the DTO but fails entity validation -> 400.
    await request(server)
      .patch('/api/templates/vip-calls/scoring')
      .send({ tiers: { strong: 10, decent: 60, neutral: 40, risky: 20 } })
      .expect(400);
    // Failed patches leave the stored config intact.
    const after = await request(server)
      .get('/api/templates/vip-calls')
      .expect(200);
    expect(after.body.scoringConfig.baseScore).toBe(10);
    // Missing template -> 404.
    await request(server)
      .patch('/api/templates/nope/scoring')
      .send({ baseScore: 10 })
      .expect(404);
  });
});
