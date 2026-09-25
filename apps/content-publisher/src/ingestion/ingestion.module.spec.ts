import { Test } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { IngestionModule } from './ingestion.module';
import { CryptoNewsIngestionClient } from './application/services/crypto-news-ingestion-client.service';
import { ProcessCryptoNewsMessageHandler } from './application/handlers/process-crypto-news-message.handler';
import { CryptoNewsIngestionClientPort } from './domain/ports/ingestion-client.port';
import { IngestionHealthIndicator } from './health/ingestion-health.indicator';

describe('IngestionModule', () => {
  it('wires the crypto-news ingestion graph', async () => {
    const module = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true }),
        IngestionModule,
      ],
    }).compile();
    expect(module.get(IngestionModule)).toBeDefined();
    expect(module.get(CryptoNewsIngestionClient)).toBeDefined();
    expect(module.get(ProcessCryptoNewsMessageHandler)).toBeDefined();
    expect(module.get(CryptoNewsIngestionClientPort)).toBeDefined();
    expect(module.get(IngestionHealthIndicator)).toBeDefined();
    await module.close();
  });
});
