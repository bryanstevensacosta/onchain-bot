import { promises as fs } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { ConfigService } from '@nestjs/config';
import { LocalAdMediaStorageAdapter } from '../local-ad-media-storage.adapter';
import { DomainError, ErrorCode } from 'shared/kernel/domain-error';

describe('LocalAdMediaStorageAdapter — media library file store/read', () => {
  let uploadsRoot: string;
  let adapter: LocalAdMediaStorageAdapter;

  const buildAdapter = (): LocalAdMediaStorageAdapter => {
    const config = {
      getOrThrow: jest.fn().mockReturnValue({ uploadsRoot }),
    } as unknown as ConfigService;
    return new LocalAdMediaStorageAdapter(config);
  };

  beforeEach(async () => {
    uploadsRoot = path.join(
      os.tmpdir(),
      'crypto-news-ads-adapter-' + Date.now(),
    );
    adapter = buildAdapter();
  });

  afterEach(async () => {
    await fs.rm(uploadsRoot, { recursive: true, force: true });
  });

  it('writes a canonical library file and returns its relative path + byte size', async () => {
    const buffer = Buffer.from('fake-png-bytes', 'utf8');
    const contentHash =
      'abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890';

    const result = await adapter.storeLibraryFile(
      buffer,
      'image/png',
      contentHash,
    );

    expect(result.relativePath).toBe(
      `crypto-news-ads-library/${contentHash}.png`,
    );
    expect(result.size).toBe(buffer.byteLength);
    const onDisk = await fs.readFile(
      path.join(uploadsRoot, 'crypto-news-ads-library', `${contentHash}.png`),
    );
    expect(onDisk.equals(buffer)).toBe(true);
  });

  it('round-trips: readFile returns exactly the bytes storeLibraryFile wrote', async () => {
    const buffer = Buffer.from('png bytes that should round-trip', 'utf8');
    const contentHash =
      'feedbead1234567890abcdef1234567890abcdef1234567890abcdef1234567890';

    const { relativePath } = await adapter.storeLibraryFile(
      buffer,
      'image/jpeg',
      contentHash,
    );
    const readBack = await adapter.readFile(relativePath);

    expect(readBack.equals(buffer)).toBe(true);
    expect(readBack.byteLength).toBe(buffer.byteLength);
  });

  it('throws a VALIDATION DomainError when readFile escapes the uploads root', async () => {
    await expect(adapter.readFile('../secret.png')).rejects.toThrow(
      DomainError,
    );
    await expect(adapter.readFile('../secret.png')).rejects.toMatchObject({
      code: ErrorCode.VALIDATION,
    });
    await expect(adapter.readFile('/etc/passwd')).rejects.toMatchObject({
      code: ErrorCode.VALIDATION,
    });
  });

  it('is idempotent: storing the same hash twice does not error and keeps the same path', async () => {
    const buffer = Buffer.from('duplicate-payload', 'utf8');
    const contentHash =
      'cafebabe1234567890abcdef1234567890abcdef1234567890abcdef1234567890';

    const first = await adapter.storeLibraryFile(
      buffer,
      'image/webp',
      contentHash,
    );
    const second = await adapter.storeLibraryFile(
      buffer,
      'image/webp',
      contentHash,
    );

    expect(second.relativePath).toBe(first.relativePath);
    expect(second.size).toBe(first.size);
    const onDisk = await fs.readFile(
      path.join(uploadsRoot, 'crypto-news-ads-library', `${contentHash}.webp`),
    );
    expect(onDisk.equals(buffer)).toBe(true);
  });
});
