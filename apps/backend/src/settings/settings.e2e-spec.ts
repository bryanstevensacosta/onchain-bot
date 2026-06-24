import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import request from 'supertest';
import { appConfig } from 'shared/common/config/app.config';
import { SettingsModule } from 'settings/settings.module';
import { SettingsPresetEntity } from 'settings/infrastructure/persistence/typeorm/entities/settings-preset.entity';
import { SignalEntity } from 'settings/infrastructure/persistence/typeorm/entities/signal.entity';
import { ScoringThresholdEntity } from 'settings/infrastructure/persistence/typeorm/entities/scoring-threshold.entity';
import { SettingsFilterEntity } from 'settings/infrastructure/persistence/typeorm/entities/settings-filter.entity';
import { SettingsAuditLogEntity } from 'settings/infrastructure/persistence/typeorm/entities/settings-audit-log.entity';

describe('SettingsPresets (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          envFilePath: ['.env'],
          load: [appConfig],
        }),
        TypeOrmModule.forRootAsync({
          inject: [ConfigService],
          useFactory: (config: ConfigService) => {
            const db = config.get<{ database: Record<string, unknown> }>(
              'app',
            )?.database;
            return {
              type: 'postgres' as const,
              host: (db?.host as string) ?? 'localhost',
              port: (db?.port as number) ?? 5432,
              username: (db?.username as string) ?? 'alpha_meta_token_scanner',
              password: (db?.password as string) ?? 'alpha_meta_token_scanner',
              database: (db?.database as string) ?? 'alpha_meta_token_scanner',
              entities: [
                SettingsPresetEntity,
                SignalEntity,
                ScoringThresholdEntity,
                SettingsFilterEntity,
                SettingsAuditLogEntity,
              ],
              synchronize: true,
              logging: false,
            };
          },
        }),
        SettingsModule,
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();

    dataSource = app.get(DataSource);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await dataSource.query(
      `DELETE FROM settings_audit_log WHERE entity_type = 'settings_preset'`,
    );
    await dataSource.query(
      `DELETE FROM settings_presets WHERE name != 'Default'`,
    );
    await dataSource.query(
      `UPDATE settings_presets SET is_active = true WHERE name = 'Default'`,
    );
  });

  it('GET /settings/presets → 200, includes Default', async () => {
    const res = await request(app.getHttpServer())
      .get('/settings/presets')
      .expect(200);
    expect(Array.isArray(res.body)).toBe(true);
    const presets = res.body as Array<{ name: string }>;
    expect(presets.some((p) => p.name === 'Default')).toBe(true);
  });

  it('POST /settings/presets → 201, creates new', async () => {
    const newPreset = {
      name: 'TestPresets',
      description: 'Test preset',
      snapshot: {
        filters: { base_score: 75 },
        signals: {},
        thresholds: [],
      },
    };
    const res = await request(app.getHttpServer())
      .post('/settings/presets')
      .send(newPreset)
      .expect(201);
    expect(res.body.name).toBe('TestPresets');
    expect(res.body.isActive).toBe(false);
  });

  it('POST /settings/presets/:id/apply → 200, sets is_active=true', async () => {
    const created = await request(app.getHttpServer())
      .post('/settings/presets')
      .send({
        name: 'ToApply',
        snapshot: { filters: { base_score: 80 }, signals: {}, thresholds: [] },
      })
      .expect(201);

    const applied = await request(app.getHttpServer())
      .post(`/settings/presets/${created.body.id}/apply`)
      .expect(200);
    expect(applied.body.isActive).toBe(true);
    expect(applied.body.id).toBe(created.body.id);
  });

  it('GET /settings/presets/active → 200, returns active', async () => {
    const res = await request(app.getHttpServer())
      .get('/settings/presets/active')
      .expect(200);
    expect(res.body).not.toBeNull();
    expect(res.body.isActive).toBe(true);
  });

  it('DELETE /settings/presets/:id (non-active) → 204', async () => {
    const created = await request(app.getHttpServer())
      .post('/settings/presets')
      .send({
        name: 'ToDelete',
        snapshot: { filters: {}, signals: {}, thresholds: [] },
      })
      .expect(201);

    await request(app.getHttpServer())
      .delete(`/settings/presets/${created.body.id}`)
      .expect(204);
  });

  it('DELETE /settings/presets/:id (active) → 400', async () => {
    const active = await request(app.getHttpServer())
      .get('/settings/presets/active')
      .expect(200);

    await request(app.getHttpServer())
      .delete(`/settings/presets/${active.body.id}`)
      .expect(400);
  });
});
