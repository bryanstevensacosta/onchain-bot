import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import request from 'supertest';
import { ThreadsModule } from '../../threads.module';

describe('ThreadsController 501 pinning (C1 skeleton, failing-first)', () => {
  let app: INestApplication;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true }), ThreadsModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it.each([
    ['get', '/api/threads'],
    ['post', '/api/threads'],
    ['get', '/api/threads/abc'],
    ['post', '/api/threads/abc/enqueue'],
    ['post', '/api/threads/abc/publish'],
  ])(
    '%s %s -> 501 THREADS_NOT_IMPLEMENTED (v1 skeleton, v2 contract)',
    async (method, url) => {
      const server = app.getHttpServer();
      const res =
        method === 'get'
          ? await request(server).get(url).expect(501)
          : await request(server).post(url).send({}).expect(501);
      expect(res.body.error).toBe('THREADS_NOT_IMPLEMENTED');
    },
  );
});
