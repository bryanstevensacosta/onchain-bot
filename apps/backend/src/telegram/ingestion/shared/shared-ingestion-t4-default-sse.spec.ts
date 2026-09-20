import { GoneException } from '@nestjs/common';
import { appConfig } from 'shared/common/config/app.config';
import { selectIngestionAdapter } from './shared-ingestion.module';

describe('T4: default SSE + MTProto a 410 Gone', () => {
  const adapters = {
    mockAdapter: { kind: 'mock' },
    sseAdapter: { kind: 'sse' },
    mtprotoAdapter: { kind: 'mtproto' },
  };

  describe('selectIngestionAdapter (selector real del modulo)', () => {
    it('mock gana cuando useMock=true', () => {
      expect(
        selectIngestionAdapter(
          { useMock: true, useSse: true },
          adapters,
          'http://localhost:3031',
        ),
      ).toBe(adapters.mockAdapter);
    });

    it('flags vacios (default SSE) → sseAdapter', () => {
      expect(
        selectIngestionAdapter(
          { useMock: false, useSse: true },
          adapters,
          'http://localhost:3031',
        ),
      ).toBe(adapters.sseAdapter);
    });

    it('forzar MTProto → 410 Gone exacto, sin adapter (sin AUTH_KEY_DUPLICATED)', () => {
      try {
        selectIngestionAdapter(
          { useMock: false, useSse: false },
          adapters,
          'http://localhost:3031',
        );
        fail('expected GoneException');
      } catch (err) {
        expect(err).toBeInstanceOf(GoneException);
        expect((err as GoneException).getStatus()).toBe(410);
        expect((err as GoneException).message).toBe(
          'MTProto backend removido, usar INGESTION_TELEGRAM_URL',
        );
      }
    });
  });

  describe('appConfig().ingestion.useSse (default SSE)', () => {
    const saved = process.env.USE_SSE_INGESTION;

    afterEach(() => {
      if (saved === undefined) delete process.env.USE_SSE_INGESTION;
      else process.env.USE_SSE_INGESTION = saved;
    });

    it('env unset → true (SSE)', () => {
      delete process.env.USE_SSE_INGESTION;
      expect(appConfig().ingestion.useSse).toBe(true);
    });

    it("env 'false' explicito → false (activa rama 410, no MTProto)", () => {
      process.env.USE_SSE_INGESTION = 'false';
      expect(appConfig().ingestion.useSse).toBe(false);
    });

    it("env 'true' explicito → true", () => {
      process.env.USE_SSE_INGESTION = 'true';
      expect(appConfig().ingestion.useSse).toBe(true);
    });
  });
});
