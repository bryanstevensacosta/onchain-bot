import { Test } from '@nestjs/testing';
import {
  DatabaseModule,
  isDatabaseEnabled,
  isProductionLikeEnvironment,
  parseDatabaseUrlOrThrow,
  redactDatabaseUrl,
  resolveDatabaseUrl,
} from './database.module';
import { DEXTER_PERSISTED_ENTITIES } from './entities';
import { DisplayMapOrmEntity } from '../../templates/infrastructure/persistence/typeorm/display-map.orm-entity';
import { MessageTemplateOrmEntity } from '../../templates/infrastructure/persistence/typeorm/message-template.orm-entity';

describe('DatabaseModule wiring seam (todo 1 foundation)', () => {
  const OLD_ENV = process.env;

  beforeEach(() => {
    process.env = { ...OLD_ENV };
  });

  afterAll(() => {
    process.env = OLD_ENV;
  });

  describe('isDatabaseEnabled', () => {
    it('defaults to false when unset (in-memory mode)', () => {
      delete process.env.DATABASE_ENABLED;
      expect(isDatabaseEnabled()).toBe(false);
    });

    it('is true only for "true" (case-insensitive)', () => {
      process.env.DATABASE_ENABLED = 'true';
      expect(isDatabaseEnabled()).toBe(true);
      process.env.DATABASE_ENABLED = 'TRUE';
      expect(isDatabaseEnabled()).toBe(true);
      process.env.DATABASE_ENABLED = 'yes';
      expect(isDatabaseEnabled()).toBe(false);
    });
  });

  describe('isProductionLikeEnvironment', () => {
    it.each([
      ['staging', true],
      ['production', true],
      ['development', false],
      ['test', false],
      [undefined, false],
    ])('NODE_ENV=%s → %s', (nodeEnv, expected) => {
      if (nodeEnv === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = nodeEnv;
      expect(isProductionLikeEnvironment()).toBe(expected);
    });
  });

  describe('parseDatabaseUrlOrThrow', () => {
    it('parses a valid dexter URL', () => {
      expect(
        parseDatabaseUrlOrThrow(
          'postgres://onchain_bot:onchain_bot@localhost:5432/onchain_bot_dexter',
        ),
      ).toEqual({
        host: 'localhost',
        port: 5432,
        username: 'onchain_bot',
        password: 'onchain_bot',
        database: 'onchain_bot_dexter',
      });
    });

    it('throws a READABLE error on garbage (never hangs)', () => {
      expect(() => parseDatabaseUrlOrThrow('not-a-url')).toThrow(
        /Invalid DATABASE_URL/,
      );
      expect(() => parseDatabaseUrlOrThrow('http://localhost/db')).toThrow(
        /protocol/,
      );
      expect(() =>
        parseDatabaseUrlOrThrow('postgres://localhost:5432/'),
      ).toThrow(/missing database name/);
    });

    it('redacts to postgres://<unparseable> on total garbage (no raw echo)', () => {
      expect(redactDatabaseUrl('not-a-url')).toBe('postgres://<unparseable>');
      expect(redactDatabaseUrl('%%%')).toBe('postgres://<unparseable>');
      expect(redactDatabaseUrl('')).toBe('postgres://<unparseable>');
    });

    it('never leaks USER:PASSWORD in thrown messages (F2-M1)', () => {
      const secret = 's3cret-pw-xyz';
      // Total garbage → unparseable marker, no raw echo, no secret.
      let garbageMessage = '';
      try {
        parseDatabaseUrlOrThrow(`utter garbage user:${secret}@stuff`);
      } catch (err) {
        garbageMessage = (err as Error).message;
      }
      expect(garbageMessage).not.toBe('');
      expect(garbageMessage).not.toContain(secret);
      expect(garbageMessage).toContain('postgres://<unparseable>');
      // Parseable-but-invalid URLs → redacted host form with ***, no secret.
      const badUrls = [
        // wrong protocol → protocol keyword kept, password redacted
        `http://alice:${secret}@localhost:5432/db`,
        // missing database name → keyword kept, password redacted
        `postgres://alice:${secret}@localhost:5432/`,
        // bad port → port keyword kept, password redacted
        `postgres://alice:${secret}@localhost:0/db`,
      ];
      for (const bad of badUrls) {
        let message = '';
        try {
          parseDatabaseUrlOrThrow(bad);
        } catch (err) {
          message = (err as Error).message;
        }
        expect(message).not.toBe('');
        expect(message).not.toContain(secret);
        expect(message).not.toContain(`alice:${secret}`);
        expect(message).toContain('***');
      }
      // Keywords survive redaction on the redacted paths.
      expect(() =>
        parseDatabaseUrlOrThrow(`http://alice:${secret}@localhost:5432/db`),
      ).toThrow(/protocol/);
      expect(() =>
        parseDatabaseUrlOrThrow(`postgres://alice:${secret}@localhost:5432/`),
      ).toThrow(/missing database name/);
      expect(() =>
        parseDatabaseUrlOrThrow(`postgres://alice:${secret}@localhost:0/db`),
      ).toThrow(/port/);
    });
  });

  describe('resolveDatabaseUrl', () => {
    it('defaults to the unified onchain_bot_dexter DB (C-DB-01)', () => {
      delete process.env.DATABASE_URL;
      expect(resolveDatabaseUrl()).toContain('onchain_bot_dexter');
    });
  });

  describe('DEXTER_PERSISTED_ENTITIES', () => {
    it('registers todo-5 DisplayMapOrmEntity (todo 3 appends MessageTemplateOrmEntity)', () => {
      expect(DEXTER_PERSISTED_ENTITIES).toContain(DisplayMapOrmEntity);
    });

    it('registers todo-3 MessageTemplateOrmEntity (DisplayMap assertion intact)', () => {
      expect(DEXTER_PERSISTED_ENTITIES).toContain(MessageTemplateOrmEntity);
      expect(DEXTER_PERSISTED_ENTITIES).toContain(DisplayMapOrmEntity);
    });
  });

  describe('forRootFromEnv', () => {
    it('returns an empty module when DATABASE_ENABLED=false', async () => {
      process.env.DATABASE_ENABLED = 'false';
      const mod = Test.createTestingModule({
        imports: [DatabaseModule.forRootFromEnv()],
      });
      const compiled = await mod.compile();
      const app = compiled.createNestApplication();
      await app.init();
      expect(compiled.get(DatabaseModule)).toBeDefined();
      await app.close();
    });
  });
});
