import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from './auth/auth.module';
import { BotsModule } from './bots/bots.module';
import { HealthModule } from './health/health.module';
import { IngressModule } from './ingress/ingress.module';
import { SendModule } from './send/send.module';
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
            telegramApiBase: buildAppConfig().telegramApiBase,
            clockSkewSec: buildAppConfig().clockSkewSec,
          },
        }),
      ],
    }),
    HealthModule,
    VaultModule,
    BotsModule,
    AuthModule,
    SendModule,
    IngressModule,
  ],
})
export class AppModule {}
