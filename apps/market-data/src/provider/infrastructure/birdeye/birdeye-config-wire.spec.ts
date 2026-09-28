import { Test } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { appConfig } from '@/shared/infrastructure/config/app.config';
import { BirdeyeModule } from './birdeye.module';
import { BIRDEYE_CONFIG, type BirdeyeConfig } from './birdeye.config';

/**
 * Failing-first spec (provider-keys wire): the Birdeye adapter must
 * resolve its API key from the `app.birdeye` config namespace, and
 * stay null-safe (`apiKey: ''`) when the key is unset.
 */
describe('BirdeyeModule (provider-keys wire)', () => {
  const ENV_KEY = 'BIRDEYE_API_KEY';
  let saved: string | undefined;

  beforeEach(() => {
    saved = process.env[ENV_KEY];
  });

  afterEach(() => {
    if (saved === undefined) delete process.env[ENV_KEY];
    else process.env[ENV_KEY] = saved;
  });

  it('resolves apiKey from the app.birdeye namespace', async () => {
    process.env[ENV_KEY] = 'wire-test-key';
    const module = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          ignoreEnvFile: true,
          load: [appConfig],
        }),
        BirdeyeModule,
      ],
    }).compile();
    expect(module.get<BirdeyeConfig>(BIRDEYE_CONFIG).apiKey).toBe(
      'wire-test-key',
    );
    await module.close();
  });

  it('falls back to empty apiKey when the key is unset (null-safe)', async () => {
    delete process.env[ENV_KEY];
    const module = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          ignoreEnvFile: true,
          load: [appConfig],
        }),
        BirdeyeModule,
      ],
    }).compile();
    expect(module.get<BirdeyeConfig>(BIRDEYE_CONFIG).apiKey).toBe('');
    await module.close();
  });
});
