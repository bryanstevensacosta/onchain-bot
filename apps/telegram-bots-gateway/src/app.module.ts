import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { BotsModule } from './bots/bots.module';
import { HealthModule } from './health/health.module';
import { buildAppConfig } from './shared/config/app.config';
import { VaultModule } from './vault/vault.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env.dev', '.env'],
      load: [
        () => ({
          app: {
            encryptionKey: buildAppConfig().encryptionKey,
            avatarDir: buildAppConfig().avatarDir,
          },
        }),
      ],
    }),
    HealthModule,
    VaultModule,
    BotsModule,
  ],
})
export class AppModule {}
