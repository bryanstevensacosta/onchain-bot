import { Logger } from '@nestjs/common';
import { promises as fs, Stats } from 'node:fs';
import { stat } from 'node:fs/promises';
import { MediaCleanupService } from '../media-cleanup.service';

// Mock both node:fs and node:fs/promises since the service imports from both.
// jest.mock is hoisted above imports, so the mocked functions are in place
// before the service file is required.
jest.mock('node:fs', () => {
  const actual = jest.requireActual('node:fs') as unknown as Record<
    string,
    unknown
  >;
  const actualPromises = (actual['promises'] ?? {}) as Record<string, unknown>;
  return {
    ...actual,
    promises: {
      ...actualPromises,
      stat: jest.fn(),
      unlink: jest.fn(),
    },
  };
});

jest.mock('node:fs/promises', () => {
  const actual = jest.requireActual('node:fs/promises') as unknown as Record<
    string,
    unknown
  >;
  return {
    ...actual,
    stat: jest.fn(),
    unlink: jest.fn(),
  };
});

// Get references to the mocked functions
const mockedStatFromFs = fs.stat as jest.MockedFunction<typeof fs.stat>;
const mockedUnlinkFromFs = fs.unlink as jest.MockedFunction<typeof fs.unlink>;
const mockedStatFromPromises = stat as jest.MockedFunction<typeof stat>;

describe('MediaCleanupService.cleanupPublishedMedia', () => {
  let service: MediaCleanupService;
  let loggedMessages: string[];
  let warnedMessages: string[];
  let errorMessages: string[];
  let debugMessages: string[];

  beforeEach(() => {
    loggedMessages = [];
    warnedMessages = [];
    errorMessages = [];
    debugMessages = [];
    jest.clearAllMocks();
    mockedStatFromFs.mockReset();
    mockedUnlinkFromFs.mockReset();
    mockedStatFromPromises.mockReset();

    jest
      .spyOn(Logger.prototype, 'log')
      .mockImplementation((message: unknown) => {
        loggedMessages.push(String(message));
      });
    jest
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation((message: unknown) => {
        warnedMessages.push(String(message));
      });
    jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation((message: unknown) => {
        errorMessages.push(String(message));
      });
    jest
      .spyOn(Logger.prototype, 'debug')
      .mockImplementation((message: unknown) => {
        debugMessages.push(String(message));
      });

    service = new MediaCleanupService();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  function createStats(mtimeMs: number, isFile = true) {
    return {
      isFile: () => isFile,
      mtimeMs,
    } as unknown as Stats;
  }

  function setupStatMock(mtimeMs: number, isFile = true) {
    const stats = createStats(mtimeMs, isFile);
    mockedStatFromFs.mockResolvedValue(stats);
    mockedStatFromPromises.mockResolvedValue(stats);
  }

  function setupStatRejection(error: Error) {
    mockedStatFromFs.mockRejectedValue(error);
    mockedStatFromPromises.mockRejectedValue(error);
  }

  function setupUnlinkMock(resolvedValue = undefined, error?: Error) {
    if (error) {
      mockedUnlinkFromFs.mockRejectedValue(error);
    } else {
      mockedUnlinkFromFs.mockResolvedValue(resolvedValue);
    }
  }

  describe('TTL = 0', () => {
    it('skips cleanup entirely and returns empty result', async () => {
      const result = await service.cleanupPublishedMedia(
        ['/path/to/file1.jpg', '/path/to/file2.png'],
        0,
      );

      expect(result).toEqual({ deleted: 0, errors: [] });
      expect(mockedStatFromFs).not.toHaveBeenCalled();
      expect(mockedStatFromPromises).not.toHaveBeenCalled();
      expect(mockedUnlinkFromFs).not.toHaveBeenCalled();
      expect(
        debugMessages.some((m) => m.includes('Media cleanup skipped')),
      ).toBe(true);
    });
  });

  describe('File age evaluation', () => {
    const ttlDays = 7;

    it('deletes files older than ttlDays (mtime < cutoff)', async () => {
      const oldFilePath = '/uploads/media/old-image.jpg';
      const oldMtime = Date.now() - 8 * 24 * 60 * 60 * 1000; // 8 days ago

      setupStatMock(oldMtime);
      setupUnlinkMock();

      const result = await service.cleanupPublishedMedia(
        [oldFilePath],
        ttlDays,
      );

      expect(result).toEqual({ deleted: 1, errors: [] });
      expect(mockedStatFromPromises).toHaveBeenCalledWith(oldFilePath);
      expect(mockedUnlinkFromFs).toHaveBeenCalledWith(oldFilePath);
      expect(
        loggedMessages.some((m) => m.includes('Deleted expired media file')),
      ).toBe(true);
    });

    it('skips files newer than ttlDays (mtime >= cutoff)', async () => {
      const newFilePath = '/uploads/media/new-image.jpg';
      const newMtime = Date.now() - 3 * 24 * 60 * 60 * 1000; // 3 days ago

      setupStatMock(newMtime);

      const result = await service.cleanupPublishedMedia(
        [newFilePath],
        ttlDays,
      );

      expect(result).toEqual({ deleted: 0, errors: [] });
      expect(mockedStatFromPromises).toHaveBeenCalledWith(newFilePath);
      expect(mockedUnlinkFromFs).not.toHaveBeenCalled();
      expect(
        debugMessages.some((m) => m.includes('File not expired yet')),
      ).toBe(true);
    });

    it('skips files with mtime exactly at cutoff (boundary case)', async () => {
      const boundaryFilePath = '/uploads/media/boundary-image.jpg';
      // Calculate cutoff the same way the service does
      const cutoffTime = Date.now() - ttlDays * 24 * 60 * 60 * 1000;

      setupStatMock(cutoffTime);

      const result = await service.cleanupPublishedMedia(
        [boundaryFilePath],
        ttlDays,
      );

      // mtimeMs === cutoffTime means mtimeMs < cutoffTime is FALSE, so not deleted
      expect(result).toEqual({ deleted: 0, errors: [] });
      expect(mockedUnlinkFromFs).not.toHaveBeenCalled();
    });
  });

  describe('Missing files (ENOENT)', () => {
    const ttlDays = 7;

    it('handles ENOENT gracefully — does not throw, logs warning, continues', async () => {
      const missingFilePath = '/uploads/media/missing.jpg';
      const enoentError = new Error('ENOENT: no such file or directory');
      (enoentError as NodeJS.ErrnoException).code = 'ENOENT';

      setupStatRejection(enoentError);

      const result = await service.cleanupPublishedMedia(
        [missingFilePath],
        ttlDays,
      );

      expect(result).toEqual({ deleted: 0, errors: [] });
      expect(
        warnedMessages.some((m) => m.includes('Media file not found')),
      ).toBe(true);
      expect(errorMessages).toHaveLength(0); // ENOENT is not logged as error
    });

    it('continues processing other files after ENOENT', async () => {
      const missingFilePath = '/uploads/media/missing.jpg';
      const existingFilePath = '/uploads/media/existing.jpg';
      const oldMtime = Date.now() - 8 * 24 * 60 * 60 * 1000; // 8 days ago

      const enoentError = new Error('ENOENT');
      (enoentError as NodeJS.ErrnoException).code = 'ENOENT';

      mockedStatFromPromises
        .mockRejectedValueOnce(enoentError)
        .mockResolvedValueOnce(createStats(oldMtime));
      mockedStatFromFs
        .mockRejectedValueOnce(enoentError)
        .mockResolvedValueOnce(createStats(oldMtime));
      setupUnlinkMock();

      const result = await service.cleanupPublishedMedia(
        [missingFilePath, existingFilePath],
        ttlDays,
      );

      expect(result).toEqual({ deleted: 1, errors: [] });
      expect(mockedUnlinkFromFs).toHaveBeenCalledWith(existingFilePath);
    });
  });

  describe('Non-file paths', () => {
    const ttlDays = 7;

    it('skips directories with warning', async () => {
      const dirPath = '/uploads/media/some-directory';

      setupStatMock(Date.now(), false); // isFile = false

      const result = await service.cleanupPublishedMedia([dirPath], ttlDays);

      expect(result).toEqual({ deleted: 0, errors: [] });
      expect(mockedUnlinkFromFs).not.toHaveBeenCalled();
      expect(
        warnedMessages.some((m) => m.includes('Skipping non-file path')),
      ).toBe(true);
    });

    it('skips symlinks (isFile returns false) with warning', async () => {
      const symlinkPath = '/uploads/media/symlink.jpg';

      setupStatMock(Date.now(), false);

      const result = await service.cleanupPublishedMedia(
        [symlinkPath],
        ttlDays,
      );

      expect(result).toEqual({ deleted: 0, errors: [] });
      expect(
        warnedMessages.some((m) => m.includes('Skipping non-file path')),
      ).toBe(true);
    });

    it('continues processing other files after non-file', async () => {
      const dirPath = '/uploads/media/some-directory';
      const filePath = '/uploads/media/old-file.jpg';
      const oldMtime = Date.now() - 8 * 24 * 60 * 60 * 1000;

      mockedStatFromPromises
        .mockResolvedValueOnce(createStats(Date.now(), false))
        .mockResolvedValueOnce(createStats(oldMtime));
      mockedStatFromFs
        .mockResolvedValueOnce(createStats(Date.now(), false))
        .mockResolvedValueOnce(createStats(oldMtime));
      setupUnlinkMock();

      const result = await service.cleanupPublishedMedia(
        [dirPath, filePath],
        ttlDays,
      );

      expect(result).toEqual({ deleted: 1, errors: [] });
      expect(mockedUnlinkFromFs).toHaveBeenCalledWith(filePath);
    });
  });

  describe('Other errors during stat/unlink', () => {
    const ttlDays = 7;

    it('logs error and adds to errors array when stat fails with non-ENOENT error', async () => {
      const filePath = '/uploads/media/error-file.jpg';
      const permissionError = new Error('EACCES: permission denied');
      (permissionError as NodeJS.ErrnoException).code = 'EACCES';

      setupStatRejection(permissionError);

      const result = await service.cleanupPublishedMedia([filePath], ttlDays);

      expect(result).toEqual({
        deleted: 0,
        errors: [`${filePath}: EACCES: permission denied`],
      });
      expect(
        errorMessages.some((m) => m.includes('Failed to cleanup media file')),
      ).toBe(true);
    });

    it('logs error and adds to errors array when unlink fails', async () => {
      const filePath = '/uploads/media/old-file.jpg';
      const oldMtime = Date.now() - 8 * 24 * 60 * 60 * 1000;
      const unlinkError = new Error('EPERM: operation not permitted');
      (unlinkError as NodeJS.ErrnoException).code = 'EPERM';

      setupStatMock(oldMtime);
      setupUnlinkMock(undefined, unlinkError);

      const result = await service.cleanupPublishedMedia([filePath], ttlDays);

      expect(result).toEqual({
        deleted: 0,
        errors: [`${filePath}: EPERM: operation not permitted`],
      });
      expect(
        errorMessages.some((m) => m.includes('Failed to cleanup media file')),
      ).toBe(true);
    });

    it('continues processing other files after stat error', async () => {
      const errorFilePath = '/uploads/media/error-file.jpg';
      const goodFilePath = '/uploads/media/good-file.jpg';
      const oldMtime = Date.now() - 8 * 24 * 60 * 60 * 1000;

      const statError = new Error('EACCES');
      (statError as NodeJS.ErrnoException).code = 'EACCES';

      mockedStatFromPromises
        .mockRejectedValueOnce(statError)
        .mockResolvedValueOnce(createStats(oldMtime));
      mockedStatFromFs
        .mockRejectedValueOnce(statError)
        .mockResolvedValueOnce(createStats(oldMtime));
      setupUnlinkMock();

      const result = await service.cleanupPublishedMedia(
        [errorFilePath, goodFilePath],
        ttlDays,
      );

      expect(result).toEqual({
        deleted: 1,
        errors: [`${errorFilePath}: EACCES`],
      });
      expect(mockedUnlinkFromFs).toHaveBeenCalledWith(goodFilePath);
    });

    it('continues processing other files after unlink error', async () => {
      const badUnlinkPath = '/uploads/media/bad-unlink.jpg';
      const goodFilePath = '/uploads/media/good-file.jpg';
      const oldMtime = Date.now() - 8 * 24 * 60 * 60 * 1000;

      const unlinkError = new Error('EPERM');
      (unlinkError as NodeJS.ErrnoException).code = 'EPERM';

      setupStatMock(oldMtime);
      mockedUnlinkFromFs
        .mockRejectedValueOnce(unlinkError)
        .mockResolvedValueOnce(undefined);

      const result = await service.cleanupPublishedMedia(
        [badUnlinkPath, goodFilePath],
        ttlDays,
      );

      expect(result).toEqual({
        deleted: 1,
        errors: [`${badUnlinkPath}: EPERM`],
      });
      expect(mockedUnlinkFromFs).toHaveBeenCalledTimes(2);
    });
  });

  describe('Return value structure', () => {
    const ttlDays = 7;
    const oldMtime = Date.now() - 8 * 24 * 60 * 60 * 1000;

    it('returns correct deleted count for multiple old files', async () => {
      const paths = [
        '/uploads/media/old-1.jpg',
        '/uploads/media/old-2.png',
        '/uploads/media/old-3.gif',
      ];

      setupStatMock(oldMtime);
      setupUnlinkMock();

      const result = await service.cleanupPublishedMedia(paths, ttlDays);

      expect(result).toEqual({ deleted: 3, errors: [] });
      expect(mockedUnlinkFromFs).toHaveBeenCalledTimes(3);
    });

    it('returns mixed results: deleted count + errors array', async () => {
      const goodPath = '/uploads/media/good-old.jpg';
      const errorPath = '/uploads/media/error-file.jpg';
      const missingPath = '/uploads/media/missing.jpg';

      const statError = new Error('EACCES');
      (statError as NodeJS.ErrnoException).code = 'EACCES';
      const enoentError = new Error('ENOENT');
      (enoentError as NodeJS.ErrnoException).code = 'ENOENT';

      mockedStatFromPromises
        .mockResolvedValueOnce(createStats(oldMtime))
        .mockRejectedValueOnce(statError)
        .mockRejectedValueOnce(enoentError);
      mockedStatFromFs
        .mockResolvedValueOnce(createStats(oldMtime))
        .mockRejectedValueOnce(statError)
        .mockRejectedValueOnce(enoentError);
      setupUnlinkMock();

      const result = await service.cleanupPublishedMedia(
        [goodPath, errorPath, missingPath],
        ttlDays,
      );

      expect(result).toEqual({
        deleted: 1,
        errors: [`${errorPath}: EACCES`],
      });
    });

    it('errors array contains file path and error message', async () => {
      const filePath = '/uploads/media/bad.jpg';
      const unlinkError = new Error('Custom unlink failure');

      setupStatMock(oldMtime);
      setupUnlinkMock(undefined, unlinkError);

      const result = await service.cleanupPublishedMedia([filePath], ttlDays);

      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain(filePath);
      expect(result.errors[0]).toContain('Custom unlink failure');
    });
  });

  describe('Logging', () => {
    const ttlDays = 7;
    const oldMtime = Date.now() - 8 * 24 * 60 * 60 * 1000;

    it('logs completion summary with deleted count and error count', async () => {
      const paths = [
        '/uploads/media/old-1.jpg',
        '/uploads/media/old-2.jpg',
        '/uploads/media/error.jpg',
      ];

      const statError = new Error('EACCES');
      (statError as NodeJS.ErrnoException).code = 'EACCES';

      mockedStatFromPromises
        .mockResolvedValueOnce(createStats(oldMtime))
        .mockResolvedValueOnce(createStats(oldMtime))
        .mockRejectedValueOnce(statError);
      mockedStatFromFs
        .mockResolvedValueOnce(createStats(oldMtime))
        .mockResolvedValueOnce(createStats(oldMtime))
        .mockRejectedValueOnce(statError);
      setupUnlinkMock();

      await service.cleanupPublishedMedia(paths, ttlDays);

      const summaryLog = loggedMessages.find((m) =>
        m.includes('Media cleanup completed'),
      );
      expect(summaryLog).toContain('2 file(s) deleted');
      expect(summaryLog).toContain('1 error(s)');
    });

    it('logs debug message with file age for non-expired files', async () => {
      const newFilePath = '/uploads/media/new-file.jpg';
      const newMtime = Date.now() - 3 * 24 * 60 * 60 * 1000; // 3 days ago

      setupStatMock(newMtime);

      await service.cleanupPublishedMedia([newFilePath], ttlDays);

      const debugLog = debugMessages.find((m) =>
        m.includes('File not expired yet'),
      );
      expect(debugLog).toContain('age: 3 days');
    });
  });

  describe('Edge cases', () => {
    it('handles empty paths array', async () => {
      const result = await service.cleanupPublishedMedia([], 7);

      expect(result).toEqual({ deleted: 0, errors: [] });
      expect(mockedStatFromPromises).not.toHaveBeenCalled();
      expect(mockedStatFromFs).not.toHaveBeenCalled();
    });

    it('handles negative ttlDays (cutoff in future, old files ARE deleted)', async () => {
      const filePath = '/uploads/media/old.jpg';
      const oldMtime = Date.now() - 8 * 24 * 60 * 60 * 1000;

      setupStatMock(oldMtime);
      setupUnlinkMock();

      // With negative ttlDays, cutoffTime = now - (-1)*day = now + day (future)
      // Since oldMtime (past) < cutoffTime (future), the file IS considered expired
      const result = await service.cleanupPublishedMedia([filePath], -1);

      expect(result).toEqual({ deleted: 1, errors: [] });
      expect(mockedUnlinkFromFs).toHaveBeenCalledWith(filePath);
    });

    it('handles very large ttlDays (no files deleted)', async () => {
      const hugeTtlDays = 365 * 10; // 10 years
      const filePath = '/uploads/media/old.jpg';
      const oldMtime = Date.now() - 8 * 24 * 60 * 60 * 1000;

      setupStatMock(oldMtime);

      const result = await service.cleanupPublishedMedia(
        [filePath],
        hugeTtlDays,
      );

      // 10 years TTL means cutoff is 10 years ago, 8-day-old file is not expired
      expect(result).toEqual({ deleted: 0, errors: [] });
      expect(mockedUnlinkFromFs).not.toHaveBeenCalled();
    });
  });
});
