import { ConfigService } from '@nestjs/config';
import { AuthModule } from './auth.module';

describe('AuthModule startup guard (adversarial)', () => {
  it('throws a clear error on staging/prod without ENCRYPTION_KEY', () => {
    const mod = new AuthModule(new ConfigService({ NODE_ENV: 'staging' }));
    expect(() => mod.onModuleInit()).toThrow(
      'ENCRYPTION_KEY is required but empty',
    );
  });

  it('throws a clear error on production without ENCRYPTION_KEY', () => {
    const mod = new AuthModule(new ConfigService({ NODE_ENV: 'production' }));
    expect(() => mod.onModuleInit()).toThrow(
      'ENCRYPTION_KEY is required but empty',
    );
  });

  it('warns (not throws) in keyless dev', () => {
    const mod = new AuthModule(new ConfigService({ NODE_ENV: 'development' }));
    expect(() => mod.onModuleInit()).not.toThrow();
  });
});
