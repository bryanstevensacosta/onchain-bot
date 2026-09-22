import { ConfigService } from '@nestjs/config';
import { promises as fs } from 'fs';
import { DiskMonitorError, DiskMonitorService } from './disk-monitor.service';

jest.mock('fs', () => {
  const actual = jest.requireActual('fs') as unknown as Record<string, unknown>;
  const actualPromises = (actual['promises'] ?? {}) as Record<string, unknown>;
  return {
    ...actual,
    promises: {
      ...actualPromises,
      statfs: jest.fn(),
      readdir: jest.fn(),
      stat: jest.fn(),
    },
  };
});
const mockedStatfs = fs.statfs as jest.MockedFunction<typeof fs.statfs>;
const mockedReaddir = fs.readdir as jest.MockedFunction<typeof fs.readdir>;
const mockedStat = fs.stat as jest.MockedFunction<typeof fs.stat>;

function makeConfig(): ConfigService {
  return {
    get: (key: string) => {
      if (key === 'app.uploads.root') return undefined;
      if (key === 'app.uploadsRoot') return undefined;
      return undefined;
    },
  } as unknown as ConfigService;
}

describe('DiskMonitorService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('getDiskUsage() returns percent used from statfs', async () => {
    mockedStatfs.mockResolvedValue({
      blocks: 1000,
      bfree: 150,
      bsize: 4096,
    } as unknown as Awaited<ReturnType<typeof fs.statfs>>);
    const svc = new DiskMonitorService(makeConfig());
    await expect(svc.getDiskUsage('/uploads')).resolves.toBeCloseTo(85, 5);
    expect(mockedStatfs).toHaveBeenCalledWith('/uploads');
  });

  it('getDiskUsage() clamps to 0-100', async () => {
    mockedStatfs.mockResolvedValue({
      blocks: 0,
      bfree: 0,
      bsize: 4096,
    } as unknown as Awaited<ReturnType<typeof fs.statfs>>);
    const svc = new DiskMonitorService(makeConfig());
    await expect(svc.getDiskUsage('/uploads')).resolves.toBe(0);
  });

  it('getDiskUsage() throws DiskMonitorError when statfs fails', async () => {
    mockedStatfs.mockRejectedValue(
      Object.assign(new Error('no such device'), { code: 'ENOENT' }),
    );
    const svc = new DiskMonitorService(makeConfig());
    await expect(svc.getDiskUsage('/uploads')).rejects.toBeInstanceOf(
      DiskMonitorError,
    );
  });

  it('getDirectorySize() sums files recursively', async () => {
    const dirent = (name: string, dir: boolean) =>
      ({
        name,
        isDirectory: () => dir,
        isFile: () => !dir,
      }) as unknown as import('fs').Dirent;
    mockedReaddir.mockImplementation((dir: unknown) => {
      if (String(dir).endsWith('uploads')) {
        return Promise.resolve([dirent('a.jpg', false), dirent('sub', true)]);
      }
      return Promise.resolve([dirent('b.jpg', false)]);
    });
    mockedStat.mockImplementation((p: unknown) => {
      if (String(p).endsWith('a.jpg'))
        return Promise.resolve({ size: 100 }) as unknown as Promise<
          import('fs').Stats
        >;
      return Promise.resolve({ size: 50 }) as unknown as Promise<
        import('fs').Stats
      >;
    });
    const svc = new DiskMonitorService(makeConfig());
    await expect(svc.getDirectorySize('/uploads')).resolves.toBe(150);
  });

  it('getDirectorySize() throws DiskMonitorError when root is unreadable', async () => {
    mockedReaddir.mockRejectedValue(
      Object.assign(new Error('missing'), { code: 'ENOENT' }),
    );
    const svc = new DiskMonitorService(makeConfig());
    await expect(svc.getDirectorySize('/uploads')).rejects.toBeInstanceOf(
      DiskMonitorError,
    );
  });
});
