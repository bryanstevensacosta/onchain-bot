import * as crypto from 'node:crypto';
import * as path from 'node:path';
import {
  BadRequestException,
  Controller,
  Get,
  Param,
  Post,
  Req,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { ScheduledAdMediaRepository } from '../../domain/ports/scheduled-ad-media.repository';
import { AdMediaLibraryRepository } from '../../domain/ports/ad-media-library.repository';
import { SchedulingMediaStoragePort } from '../../domain/ports/scheduling-media-storage.port';
import { AdMediaLibraryEntry } from '../../domain/ad-media-library-entry.entity';
import { DomainError, ErrorCode } from 'shared/kernel/domain-error';
import { sniffSchedulingMimeType } from '../../application/services/scheduling-media-sniffer';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const MAX_LIBRARY_BYTES = 50 * 1024 * 1024;

const SERVABLE_MIME_TYPES: ReadonlySet<string> = new Set([
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
  'video/mp4',
]);

interface UploadedLibraryFile {
  readonly buffer: Buffer;
  readonly originalname: string;
}

export interface SchedulingLibraryEntryView {
  readonly id: string;
  readonly url: string;
  readonly originalFileName: string | null;
  readonly mimeType: string | null;
  readonly fileSize: number | null;
  readonly createdAt: string;
}

/**
 * Scheduling media endpoints (`/api/scheduling/media`, P36 naming):
 * per-post attachment serving + the shared media library (list, get,
 * upload). Missing rows or files answer 404 (never 500 for a stale
 * path); only stored relative paths are ever joined with the uploads
 * root, with a traversal guard on every resolve.
 */
@ApiTags('feed-publisher-scheduling')
@Controller('api/scheduling/media')
export class SchedulingMediaController {
  public constructor(
    private readonly adMediaRepo: ScheduledAdMediaRepository,
    private readonly libraryRepo: AdMediaLibraryRepository,
    private readonly storage: SchedulingMediaStoragePort,
  ) {}

  @Get('library')
  @ApiOperation({ summary: 'List the shared scheduling media library' })
  public async listLibrary(): Promise<
    ReadonlyArray<SchedulingLibraryEntryView>
  > {
    const library = await this.libraryRepo.findAll();
    return library.map((entry) => ({
      id: entry.id,
      url: `/api/scheduling/media/library/${entry.id}`,
      originalFileName: entry.originalFileName,
      mimeType: entry.mimeType,
      fileSize: entry.fileSize,
      createdAt: entry.createdAt.toISOString(),
    }));
  }

  @Post('library')
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: MAX_LIBRARY_BYTES } }),
  )
  @ApiOperation({ summary: 'Upload an asset to the shared library' })
  public async uploadToLibrary(
    @UploadedFile() file: UploadedLibraryFile,
  ): Promise<SchedulingLibraryEntryView> {
    if (!file?.buffer || file.buffer.byteLength === 0) {
      throw new BadRequestException('empty file');
    }
    const mimeType = sniffSchedulingMimeType(file.buffer);
    if (!SERVABLE_MIME_TYPES.has(mimeType)) {
      throw new BadRequestException('only image/video files are allowed');
    }
    const contentHash = crypto
      .createHash('sha256')
      .update(file.buffer)
      .digest('hex');
    const hit = await this.libraryRepo.findByContentHash(contentHash);
    if (hit) {
      return SchedulingMediaController.toLibraryView(hit);
    }
    const stored = await this.storage.storeLibraryFile(
      file.buffer,
      mimeType,
      contentHash,
    );
    const saved = await this.libraryRepo.save(
      AdMediaLibraryEntry.create({
        filePath: stored.relativePath,
        contentHash,
        originalFileName: file.originalname,
        mimeType,
        fileSize: stored.size,
      }),
    );
    return SchedulingMediaController.toLibraryView(saved);
  }

  @Get('library/:libraryMediaId')
  @ApiOperation({ summary: 'Serve a shared-library asset' })
  public async getLibraryMedia(
    @Param('libraryMediaId') libraryMediaId: string,
    @Req() req: Request,
    @Res({ passthrough: false }) res: Response,
  ): Promise<void> {
    if (!UUID_RE.test(libraryMediaId)) {
      res.status(404).json({ statusCode: 404, message: 'Media not found' });
      return;
    }
    const record = await this.libraryRepo.findById(libraryMediaId);
    if (!record) {
      res.status(404).json({ statusCode: 404, message: 'Media not found' });
      return;
    }
    await this.serveStoredFile(req, res, record.filePath, record.mimeType);
  }

  @Get(':mediaId')
  @ApiOperation({ summary: 'Serve a scheduling-post attachment' })
  public async getMedia(
    @Param('mediaId') mediaId: string,
    @Req() req: Request,
    @Res({ passthrough: false }) res: Response,
  ): Promise<void> {
    if (!UUID_RE.test(mediaId)) {
      res.status(404).json({ error: 'Media not found' });
      return;
    }
    const media =
      (await this.adMediaRepo.findById(mediaId)) ??
      (await this.libraryRepo.findById(mediaId));
    if (!media) {
      res.status(404).json({ error: 'Media not found' });
      return;
    }
    await this.serveStoredFile(req, res, media.filePath, media.mimeType);
  }

  private async serveStoredFile(
    req: Request,
    res: Response,
    filePath: string,
    storedMimeType: string | null,
  ): Promise<void> {
    if (filePath.includes('..') || path.isAbsolute(filePath)) {
      res.status(404).json({ error: 'Media not found' });
      return;
    }
    let fileBuffer: Buffer;
    try {
      fileBuffer = await this.storage.readFile(filePath);
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code === 'ENOENT') {
        res.status(404).json({ error: 'Media file missing on disk' });
        return;
      }
      if (err instanceof DomainError && err.code === ErrorCode.VALIDATION) {
        res.status(404).json({ error: 'Media not found' });
        return;
      }
      throw err;
    }
    const mimeType = storedMimeType ?? sniffSchedulingMimeType(fileBuffer);
    const range = req.headers.range;
    if (typeof range === 'string' && range.startsWith('bytes=')) {
      const total = fileBuffer.byteLength;
      const [startRaw, endRaw] = range.replace('bytes=', '').split('-');
      const start = Number.parseInt(startRaw, 10);
      const end =
        endRaw === '' || endRaw === undefined
          ? total - 1
          : Number.parseInt(endRaw, 10);
      if (
        !Number.isFinite(start) ||
        !Number.isFinite(end) ||
        start < 0 ||
        end >= total ||
        start > end
      ) {
        res.status(416).set('Content-Range', `bytes */${total}`).end();
        return;
      }
      res
        .status(206)
        .set('Content-Type', mimeType)
        .set('Content-Range', `bytes ${start}-${end}/${total}`)
        .set('Content-Length', String(end - start + 1))
        .set('Accept-Ranges', 'bytes')
        .set('Cache-Control', 'public, max-age=86400, immutable')
        .end(fileBuffer.subarray(start, end + 1));
      return;
    }
    res
      .status(200)
      .set('Content-Type', mimeType)
      .set('Content-Length', String(fileBuffer.byteLength))
      .set('Accept-Ranges', 'bytes')
      .set('Cache-Control', 'public, max-age=86400, immutable')
      .end(fileBuffer);
  }

  private static toLibraryView(
    entry: AdMediaLibraryEntry,
  ): SchedulingLibraryEntryView {
    return {
      id: entry.id,
      url: `/api/scheduling/media/library/${entry.id}`,
      originalFileName: entry.originalFileName,
      mimeType: entry.mimeType,
      fileSize: entry.fileSize,
      createdAt: entry.createdAt.toISOString(),
    };
  }
}
