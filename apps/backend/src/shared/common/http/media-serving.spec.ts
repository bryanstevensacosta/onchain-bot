import type { Request, Response } from 'express';
import {
  detectMediaMimeType,
  parseRangeHeader,
  serveMediaFile,
  sniffMimeFromBytes,
} from './media-serving';

describe('media-serving', () => {
  describe('sniffMimeFromBytes', () => {
    it('detects JPEG', () => {
      expect(sniffMimeFromBytes(Buffer.from([0xff, 0xd8, 0xff, 0xe0]))).toBe(
        'image/jpeg',
      );
    });

    it('detects PNG', () => {
      expect(
        sniffMimeFromBytes(
          Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
        ),
      ).toBe('image/png');
    });

    it('detects GIF', () => {
      expect(sniffMimeFromBytes(Buffer.from([0x47, 0x49, 0x46, 0x38]))).toBe(
        'image/gif',
      );
    });

    it('detects WebP', () => {
      const buf = Buffer.alloc(12);
      buf.write('RIFF', 0);
      buf.write('WEBP', 8);
      expect(sniffMimeFromBytes(buf)).toBe('image/webp');
    });

    it('detects MP4 from the ftyp box', () => {
      // Standard MP4: 4-byte size + "ftyp" + "isom" brand
      const buf = Buffer.alloc(16);
      buf.writeUInt32BE(16, 0);
      buf.write('ftyp', 4);
      buf.write('isom', 8);
      expect(sniffMimeFromBytes(buf)).toBe('video/mp4');
    });

    it('detects QuickTime MOV from the qt brand', () => {
      const buf = Buffer.alloc(16);
      buf.writeUInt32BE(16, 0);
      buf.write('ftyp', 4);
      buf.write('qt  ', 8);
      expect(sniffMimeFromBytes(buf)).toBe('video/quicktime');
    });

    it('returns null for unknown bytes', () => {
      expect(sniffMimeFromBytes(Buffer.from('hello world'))).toBeNull();
    });
  });

  describe('detectMediaMimeType', () => {
    it('prefers a non-octet-stream DB mime', () => {
      const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0]);
      expect(detectMediaMimeType('/tmp/photo.bin', 'image/jpeg', jpeg)).toBe(
        'image/jpeg',
      );
    });

    it('sniffs MP4 when the DB mime is octet-stream', () => {
      const mp4 = Buffer.alloc(16);
      mp4.writeUInt32BE(16, 0);
      mp4.write('ftyp', 4);
      mp4.write('isom', 8);
      // .bin + octet-stream from DB (as stored by the downloader)
      expect(
        detectMediaMimeType('/tmp/video.bin', 'application/octet-stream', mp4),
      ).toBe('video/mp4');
    });

    it('falls back to the file extension when sniffing fails', () => {
      expect(
        detectMediaMimeType('/tmp/photo.png', null, Buffer.from('x')),
      ).toBe('image/png');
    });

    it('returns octet-stream as the final fallback', () => {
      expect(detectMediaMimeType('/tmp/file.xyz', null, Buffer.from('x'))).toBe(
        'application/octet-stream',
      );
    });
  });

  describe('parseRangeHeader', () => {
    it('returns null when no header is present', () => {
      expect(parseRangeHeader(undefined, 100)).toBeNull();
    });

    it('parses a closed range', () => {
      expect(parseRangeHeader('bytes=10-19', 100)).toEqual({
        start: 10,
        end: 19,
      });
    });

    it('parses an open-ended range', () => {
      expect(parseRangeHeader('bytes=10-', 100)).toEqual({
        start: 10,
        end: 99,
      });
    });

    it('parses a suffix range', () => {
      expect(parseRangeHeader('bytes=-10', 100)).toEqual({
        start: 90,
        end: 99,
      });
    });

    it('returns null for malformed headers', () => {
      expect(parseRangeHeader('bytes=abc', 100)).toBeNull();
      expect(parseRangeHeader('items=0-10', 100)).toBeNull();
      expect(parseRangeHeader('bytes=0-1,5-6', 100)).toBeNull();
    });
  });

  describe('serveMediaFile', () => {
    const makeRes = (): {
      res: Response;
      status: jest.Mock;
      setHeader: jest.Mock;
      send: jest.Mock;
    } => {
      const status = jest.fn().mockReturnThis();
      const setHeader = jest.fn();
      const send = jest.fn();
      const res = { status, setHeader, send } as unknown as Response;
      return { res, status, setHeader, send };
    };

    const makeReq = (range?: string): Request =>
      ({ headers: range ? { range } : {} }) as unknown as Request;

    const buffer = Buffer.from('0123456789'); // 10 bytes

    it('serves the full body with 200 when no range is requested', () => {
      const { res, status, setHeader, send } = makeRes();

      serveMediaFile(res, makeReq(), buffer, 'video/mp4', 'public, max-age=60');

      expect(setHeader).toHaveBeenCalledWith('Content-Type', 'video/mp4');
      expect(setHeader).toHaveBeenCalledWith('Accept-Ranges', 'bytes');
      expect(setHeader).toHaveBeenCalledWith('Content-Length', '10');
      expect(status).toHaveBeenCalledWith(200);
      expect(send).toHaveBeenCalledWith(buffer);
    });

    it('serves a partial body with 206 and Content-Range', () => {
      const { res, status, setHeader, send } = makeRes();

      serveMediaFile(
        res,
        makeReq('bytes=2-5'),
        buffer,
        'video/mp4',
        'public, max-age=60',
      );

      expect(status).toHaveBeenCalledWith(206);
      expect(setHeader).toHaveBeenCalledWith('Content-Range', 'bytes 2-5/10');
      expect(setHeader).toHaveBeenCalledWith('Content-Length', '4');
      expect(send).toHaveBeenCalledWith(Buffer.from('2345'));
    });

    it('clamps an end beyond the file size', () => {
      const { res, status, send } = makeRes();

      serveMediaFile(res, makeReq('bytes=8-99'), buffer, 'video/mp4', 'x');

      expect(status).toHaveBeenCalledWith(206);
      expect(send).toHaveBeenCalledWith(Buffer.from('89'));
    });

    it('serves 416 for an unsatisfiable range', () => {
      const { res, status, setHeader } = makeRes();

      serveMediaFile(res, makeReq('bytes=50-60'), buffer, 'video/mp4', 'x');

      expect(status).toHaveBeenCalledWith(416);
      expect(setHeader).toHaveBeenCalledWith('Content-Range', 'bytes */10');
    });

    it('treats malformed ranges as no range (full 200)', () => {
      const { res, status } = makeRes();

      serveMediaFile(res, makeReq('bytes=abc'), buffer, 'video/mp4', 'x');

      expect(status).toHaveBeenCalledWith(200);
    });
  });
});
