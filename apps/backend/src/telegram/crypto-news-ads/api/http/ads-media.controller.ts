import * as path from 'node:path';
import { promises as fs } from 'node:fs';
import { Controller, Get, Param, Req, Res } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express';
import { AdMediaRepository } from 'telegram/crypto-news-ads/application/ports/ad-media.repository';
import { AdMediaLibraryRepository } from 'telegram/crypto-news-ads/application/ports/ad-media-library.repository';
import {
  detectMediaMimeType,
  serveMediaFile,
} from 'shared/common/http/media-serving';
import type { AppConfig } from 'shared/common/config/app.config';
import { UUID_RE } from './ad-uuid';
import type { AdMediaLibraryEntryView } from './ads-media.view';

/**
 * Serves an ad image attachment by its media-row UUID.
 *
 * Clone of the crypto-news serve pattern (Range/206 support, 404 on
 * missing row or file — never 500 for a stale path). Only the STORED
 * relative path from the media row is joined with the uploads root.
 */
@Controller('crypto-news-ads')
export class AdsMediaController {
  private readonly uploadsRoot: string;

  public constructor(
    private readonly adMediaRepo: AdMediaRepository,
    private readonly libraryRepo: AdMediaLibraryRepository,
    config: ConfigService,
  ) {
    const appCfg = config.getOrThrow<AppConfig>('app');
    this.uploadsRoot = appCfg.uploadsRoot;
  }

  @Get('media/:mediaId')
  public async getMedia(
    @Param('mediaId') mediaId: string,
    @Req() req: Request,
    @Res({ passthrough: false }) res: Response,
  ): Promise<void> {
    if (!UUID_RE.test(mediaId)) {
      res.status(404).json({ error: 'Media not found' });
      return;
    }
    const media = await this.adMediaRepo.findById(mediaId);
    if (!media) {
      res.status(404).json({ error: 'Media not found' });
      return;
    }
    const resolvedRoot = path.resolve(this.uploadsRoot);
    const absPath = path.resolve(this.uploadsRoot, media.filePath);
    if (!absPath.startsWith(resolvedRoot + path.sep)) {
      res.status(404).json({ error: 'Media not found' });
      return;
    }

    let fileBuffer: Buffer;
    try {
      fileBuffer = await fs.readFile(absPath);
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code === 'ENOENT') {
        res.status(404).json({ error: 'Media file missing on disk' });
        return;
      }
      throw err;
    }

    const mimeType = detectMediaMimeType(
      media.filePath,
      media.mimeType,
      fileBuffer,
    );
    serveMediaFile(
      res,
      req,
      fileBuffer,
      mimeType,
      'public, max-age=86400, immutable',
    );
  }

  @Get('media-library')
  public async listMediaLibrary(): Promise<
    ReadonlyArray<AdMediaLibraryEntryView>
  > {
    const library = await this.libraryRepo.findAll();
    return library.map((m) => ({
      id: m.id,
      url: `/crypto-news-ads/media-library/${m.id}`,
      originalFileName: m.originalFileName,
      mimeType: m.mimeType,
      fileSize: m.fileSize,
      createdAt: m.createdAt,
    }));
  }

  @Get('media-library/:libraryMediaId')
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
    const resolvedRoot = path.resolve(this.uploadsRoot);
    const absPath = path.resolve(this.uploadsRoot, record.filePath);
    if (!absPath.startsWith(resolvedRoot + path.sep)) {
      res.status(404).json({ statusCode: 404, message: 'Media not found' });
      return;
    }

    let fileBuffer: Buffer;
    try {
      fileBuffer = await fs.readFile(absPath);
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code === 'ENOENT') {
        res.status(404).json({
          statusCode: 404,
          message: 'Media file missing on disk',
        });
        return;
      }
      throw err;
    }

    const mimeType = detectMediaMimeType(
      record.filePath,
      record.mimeType,
      fileBuffer,
    );
    serveMediaFile(
      res,
      req,
      fileBuffer,
      mimeType,
      'public, max-age=86400, immutable',
    );
  }
}
