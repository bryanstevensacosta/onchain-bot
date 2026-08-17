import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import {
  CreateAdDto,
  ReuseLibraryImagesDto,
  UpdateAdDto,
} from 'telegram/crypto-news-ads/api/input/ads.input';

/**
 * DTO validation for the crypto-news-ads REST API. Mirrors the global
 * `ValidationPipe` (400 on shape violations): `plainToInstance` +
 * `validate` from class-validator.
 *
 * Key rules under test:
 *  - `body` is capped at 4096 chars ONLY for `format: 'text'` (or when
 *    format is omitted) — photo/video/album bodies are not length-capped
 *    by the DTO (the media carries the content).
 *  - `albumMediaIds` is capped at 10 entries.
 *  - `format` must be one of text/photo/video/album.
 */
describe('ads.input DTOs', () => {
  const validCreate = (): Record<string, unknown> => ({
    name: 'Promo',
    body: 'Buy $X',
  });

  describe('CreateAdDto', () => {
    it('accepts a minimal valid payload', async () => {
      const dto = plainToInstance(CreateAdDto, validCreate());
      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });

    it('rejects an invalid format', async () => {
      const dto = plainToInstance(CreateAdDto, {
        ...validCreate(),
        format: 'carousel',
      });
      const errors = await validate(dto);
      expect(errors).toHaveLength(1);
      expect(errors[0].property).toBe('format');
    });

    it('rejects albumMediaIds with more than 10 entries', async () => {
      const dto = plainToInstance(CreateAdDto, {
        ...validCreate(),
        format: 'album',
        albumMediaIds: Array.from({ length: 11 }, (_, i) => `img-${i}`),
      });
      const errors = await validate(dto);
      expect(errors).toHaveLength(1);
      expect(errors[0].property).toBe('albumMediaIds');
    });

    it('accepts albumMediaIds with exactly 10 entries', async () => {
      const dto = plainToInstance(CreateAdDto, {
        ...validCreate(),
        format: 'album',
        albumMediaIds: Array.from({ length: 10 }, (_, i) => `img-${i}`),
      });
      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });

    it('rejects a body longer than 4096 chars when format is "text"', async () => {
      const dto = plainToInstance(CreateAdDto, {
        ...validCreate(),
        body: 'x'.repeat(4097),
      });
      const errors = await validate(dto);
      expect(errors).toHaveLength(1);
      expect(errors[0].property).toBe('body');
    });

    it('rejects a body longer than 4096 chars when format is omitted (defaults to text)', async () => {
      const dto = plainToInstance(CreateAdDto, {
        ...validCreate(),
        body: 'x'.repeat(4097),
      });
      const errors = await validate(dto);
      expect(errors).toHaveLength(1);
      expect(errors[0].property).toBe('body');
    });

    it('accepts a body longer than 4096 chars when format is "photo"', async () => {
      const dto = plainToInstance(CreateAdDto, {
        ...validCreate(),
        format: 'photo',
        body: 'x'.repeat(4097),
      });
      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });

    it('accepts a body longer than 4096 chars when format is "video"', async () => {
      const dto = plainToInstance(CreateAdDto, {
        ...validCreate(),
        format: 'video',
        body: 'x'.repeat(4097),
      });
      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });

    it('rejects a name longer than 128 chars', async () => {
      const dto = plainToInstance(CreateAdDto, {
        ...validCreate(),
        name: 'n'.repeat(129),
      });
      const errors = await validate(dto);
      expect(errors).toHaveLength(1);
      expect(errors[0].property).toBe('name');
    });

    it('rejects an invalid expirationAction', async () => {
      const dto = plainToInstance(CreateAdDto, {
        ...validCreate(),
        expirationAction: 'archive',
      });
      const errors = await validate(dto);
      expect(errors).toHaveLength(1);
      expect(errors[0].property).toBe('expirationAction');
    });

    it('accepts a valid buttons array', async () => {
      const dto = plainToInstance(CreateAdDto, {
        ...validCreate(),
        buttons: [
          { text: 'Abrir', url: 'https://ourbit.com/ref?agent=1' },
          { text: 'Canal', url: 'https://t.me/ourbit' },
        ],
      });
      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });

    it('rejects buttons with more than 6 entries', async () => {
      const dto = plainToInstance(CreateAdDto, {
        ...validCreate(),
        buttons: Array.from({ length: 7 }, (_, i) => ({
          text: `B${i}`,
          url: `https://ourbit.com/${i}`,
        })),
      });
      const errors = await validate(dto);
      expect(errors).toHaveLength(1);
      expect(errors[0].property).toBe('buttons');
    });

    it('rejects a button with empty text', async () => {
      const dto = plainToInstance(CreateAdDto, {
        ...validCreate(),
        buttons: [{ text: '', url: 'https://ourbit.com/ref' }],
      });
      const errors = await validate(dto);
      expect(errors).toHaveLength(1);
      expect(errors[0].property).toBe('buttons');
      expect(errors[0].children?.[0]?.children?.[0]?.property).toBe('text');
    });

    it('rejects a button with empty url', async () => {
      const dto = plainToInstance(CreateAdDto, {
        ...validCreate(),
        buttons: [{ text: 'Abrir', url: '' }],
      });
      const errors = await validate(dto);
      expect(errors).toHaveLength(1);
      expect(errors[0].property).toBe('buttons');
      expect(errors[0].children?.[0]?.children?.[0]?.property).toBe('url');
    });
  });

  describe('UpdateAdDto', () => {
    it('accepts an empty patch', async () => {
      const dto = plainToInstance(UpdateAdDto, {});
      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });

    it('rejects a body longer than 4096 chars when format is "text"', async () => {
      const dto = plainToInstance(UpdateAdDto, {
        body: 'x'.repeat(4097),
      });
      const errors = await validate(dto);
      expect(errors).toHaveLength(1);
      expect(errors[0].property).toBe('body');
    });

    it('accepts a body longer than 4096 chars when format is "album"', async () => {
      const dto = plainToInstance(UpdateAdDto, {
        format: 'album',
        body: 'x'.repeat(4097),
      });
      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });

    it('rejects albumMediaIds with more than 10 entries', async () => {
      const dto = plainToInstance(UpdateAdDto, {
        albumMediaIds: Array.from({ length: 11 }, (_, i) => `img-${i}`),
      });
      const errors = await validate(dto);
      expect(errors).toHaveLength(1);
      expect(errors[0].property).toBe('albumMediaIds');
    });
  });

  describe('ReuseLibraryImagesDto', () => {
    it('rejects an empty libraryMediaIds array', async () => {
      const dto = plainToInstance(ReuseLibraryImagesDto, {
        libraryMediaIds: [],
      });
      const errors = await validate(dto);
      expect(errors).toHaveLength(1);
      expect(errors[0].property).toBe('libraryMediaIds');
    });

    it('rejects non-UUID library media ids', async () => {
      const dto = plainToInstance(ReuseLibraryImagesDto, {
        libraryMediaIds: ['not-a-uuid'],
      });
      const errors = await validate(dto);
      expect(errors).toHaveLength(1);
      expect(errors[0].property).toBe('libraryMediaIds');
    });

    it('accepts up to 10 valid UUIDs', async () => {
      const dto = plainToInstance(ReuseLibraryImagesDto, {
        libraryMediaIds: Array.from(
          { length: 10 },
          (_, i) => `11111111-2222-4333-8444-${String(i).padStart(12, '0')}`,
        ),
      });
      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });
  });
});
