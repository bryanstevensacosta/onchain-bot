import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import request from 'supertest';
import { TemplatesModule } from '../../templates.module';
import { TelegramAdminVerifierPort } from '../../domain/ports/telegram-admin-verifier.port';
import { SourceValidatorPort } from '../../domain/ports/source-validator.port';

describe('TelegramBotsController redacted CRUD (P23, failing-first)', () => {
  let app: INestApplication;

  beforeEach(async () => {
    process.env.ENCRYPTION_KEY = 'f'.repeat(64);
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

  it('creates + reads redacted (***), updates, deletes', async () => {
    const server = app.getHttpServer();
    const created = await request(server)
      .post('/api/telegram-bots')
      .send({ label: 'vip', token: '999:SECRET' })
      .expect(201);
    expect(created.body.token).toBe('***');
    expect(JSON.stringify(created.body)).not.toContain('SECRET');
    const listed = await request(server).get('/api/telegram-bots').expect(200);
    expect(listed.body).toHaveLength(1);
    expect(listed.body[0].token).toBe('***');
    const one = await request(server)
      .get(`/api/telegram-bots/${created.body.id}`)
      .expect(200);
    expect(one.body.token).toBe('***');
    const updated = await request(server)
      .patch(`/api/telegram-bots/${created.body.id}`)
      .send({ label: 'vip2' })
      .expect(200);
    expect(updated.body.label).toBe('vip2');
    await request(server)
      .delete(`/api/telegram-bots/${created.body.id}`)
      .expect(200);
    await request(server)
      .get(`/api/telegram-bots/${created.body.id}`)
      .expect(404);
  });
});
