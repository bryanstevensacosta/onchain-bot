import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import request from 'supertest';
import { TemplatesModule } from '../../templates.module';
import { TelegramAdminVerifierPort } from '../../domain/ports/telegram-admin-verifier.port';
import { SourceValidatorPort } from '../../domain/ports/source-validator.port';

describe('ThreadsStubController 501 pinning (C1, failing-first)', () => {
  let app: INestApplication;

  beforeEach(async () => {
    process.env.ENCRYPTION_KEY = '0'.repeat(64);
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
    await app.init();
  });

  afterEach(async () => {
    delete process.env.ENCRYPTION_KEY;
    await app.close();
  });

  it.each([
    ['get', '/api/templates/vip-calls/threads'],
    ['post', '/api/templates/vip-calls/threads'],
    ['get', '/api/templates/vip-calls/threads/abc'],
    ['post', '/api/templates/vip-calls/threads/abc/publish'],
  ])(
    '%s %s -> 501 THREADS_NOT_IMPLEMENTED (no threads impl, Tramo 2)',
    async (method, url) => {
      const server = app.getHttpServer();
      const res =
        method === 'get'
          ? await request(server).get(url).expect(501)
          : await request(server).post(url).expect(501);
      expect(res.body.error).toBe('THREADS_NOT_IMPLEMENTED');
    },
  );
});
