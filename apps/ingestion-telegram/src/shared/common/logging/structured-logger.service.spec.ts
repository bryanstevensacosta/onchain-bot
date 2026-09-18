import { Test, TestingModule } from '@nestjs/testing';
import { Logger } from '@nestjs/common';
import { StructuredLoggerService } from './structured-logger.service';

describe('StructuredLoggerService', () => {
  let service: StructuredLoggerService;
  let loggerSpy: jest.SpyInstance;
  let errorSpy: jest.SpyInstance;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [StructuredLoggerService],
    }).compile();

    service = module.get<StructuredLoggerService>(StructuredLoggerService);

    // Spy on Logger.log and Logger.error
    loggerSpy = jest.spyOn(Logger.prototype, 'log').mockImplementation();
    errorSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('logMessageReceived', () => {
    it('should log message:received event with structured data', () => {
      // Arrange
      const channelId = '-1001234567890';
      const messageId = 12345;
      const hasMedia = true;
      const mediaCount = 2;
      const messageType = 'kol' as const;
      const occurredAt = '2026-08-30T00:00:00Z';

      // Act
      service.logMessageReceived(
        channelId,
        messageId,
        hasMedia,
        mediaCount,
        messageType,
        occurredAt,
      );

      // Assert
      expect(loggerSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          event: 'message:received',
          channelId,
          messageId,
          hasMedia,
          mediaCount,
          messageType,
          occurredAt,
          timestamp: expect.any(String),
        }),
      );
    });

    it('should handle messages without media', () => {
      // Arrange
      const channelId = '-1001234567890';
      const messageId = 12346;
      const hasMedia = false;
      const mediaCount = 0;
      const messageType = 'crypto-news' as const;
      const occurredAt = '2026-08-30T00:01:00Z';

      // Act
      service.logMessageReceived(
        channelId,
        messageId,
        hasMedia,
        mediaCount,
        messageType,
        occurredAt,
      );

      // Assert
      expect(loggerSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          event: 'message:received',
          hasMedia: false,
          mediaCount: 0,
        }),
      );
    });
  });

  describe('logClientConnected', () => {
    it('should log sse:client:connected event with clientId and totalClients', () => {
      // Arrange
      const clientId = 'client-123';
      const totalClients = 3;

      // Act
      service.logClientConnected(clientId, totalClients);

      // Assert
      expect(loggerSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          event: 'sse:client:connected',
          clientId,
          totalClients,
          timestamp: expect.any(String),
        }),
      );
    });
  });

  describe('logClientDisconnected', () => {
    it('should log sse:client:disconnected event with clientId and totalClients', () => {
      // Arrange
      const clientId = 'client-123';
      const totalClients = 2;

      // Act
      service.logClientDisconnected(clientId, totalClients);

      // Assert
      expect(loggerSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          event: 'sse:client:disconnected',
          clientId,
          totalClients,
          timestamp: expect.any(String),
        }),
      );
    });
  });

  describe('logFloodWaitDetected', () => {
    it('should log flood_wait:detected event with all context', () => {
      // Arrange
      const waitSeconds = 30;
      const count24h = 5;
      const backoffMs = 60000;
      const attempt = 2;
      const maxAttempts = 5;
      const label = 'getMessages';

      // Act
      service.logFloodWaitDetected(
        waitSeconds,
        count24h,
        backoffMs,
        attempt,
        maxAttempts,
        label,
      );

      // Assert
      expect(loggerSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          event: 'flood_wait:detected',
          waitSeconds,
          count24h,
          backoffMs,
          attempt,
          maxAttempts,
          label,
          timestamp: expect.any(String),
        }),
      );
    });
  });

  describe('logMediaDownloadFailed', () => {
    it('should log media:download:failed event with error details', () => {
      // Arrange
      const channelId = '-1001234567890';
      const messageId = 12345;
      const index = 0;
      const error = 'Network timeout';
      const stack = 'Error: Network timeout\n  at downloadMedia...';
      const fileSize = 245678;
      const mimeType = 'image/jpeg';

      // Act
      service.logMediaDownloadFailed(
        channelId,
        messageId,
        index,
        error,
        stack,
        fileSize,
        mimeType,
      );

      // Assert
      expect(errorSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          event: 'media:download:failed',
          channelId,
          messageId,
          index,
          error,
          stack,
          fileSize,
          mimeType,
          timestamp: expect.any(String),
        }),
      );
    });

    it('should handle missing optional fields', () => {
      // Arrange
      const channelId = '-1001234567890';
      const messageId = 12345;
      const index = 1;
      const error = 'Unknown error';

      // Act
      service.logMediaDownloadFailed(channelId, messageId, index, error);

      // Assert
      expect(errorSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          event: 'media:download:failed',
          channelId,
          messageId,
          index,
          error,
          timestamp: expect.any(String),
        }),
      );
    });
  });

  describe('logMediaDownloadSuccess', () => {
    it('should log media:download:success event with download metrics', () => {
      // Arrange
      const channelId = '-1001234567890';
      const messageId = 12345;
      const index = 0;
      const filePath = '/uploads/crypto-news/media/-1001234567890/12345_0.jpg';
      const fileSize = 245678;
      const downloadDurationMs = 1500;

      // Act
      service.logMediaDownloadSuccess(
        channelId,
        messageId,
        index,
        filePath,
        fileSize,
        downloadDurationMs,
      );

      // Assert
      expect(loggerSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          event: 'media:download:success',
          channelId,
          messageId,
          index,
          filePath,
          fileSize,
          downloadDurationMs,
          timestamp: expect.any(String),
        }),
      );
    });
  });

  describe('logMtprotoConnectionChange', () => {
    it('should log connection state changes', () => {
      // Arrange
      const connected = true;
      const authorized = true;

      // Act
      service.logMtprotoConnectionChange(connected, authorized);

      // Assert
      expect(loggerSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          event: 'mtproto:connection:changed',
          connected,
          authorized,
          timestamp: expect.any(String),
        }),
      );
    });
  });

  describe('logServiceStartup', () => {
    it('should log service startup with configuration', () => {
      // Arrange
      const port = 3031;
      const channelCount = 15;

      // Act
      service.logServiceStartup(port, channelCount);

      // Assert
      expect(loggerSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          event: 'service:started',
          port,
          channelCount,
          timestamp: expect.any(String),
        }),
      );
    });
  });

  describe('logServiceShutdown', () => {
    it('should log service shutdown with reason', () => {
      // Arrange
      const reason = 'SIGTERM received';

      // Act
      service.logServiceShutdown(reason);

      // Assert
      expect(loggerSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          event: 'service:shutdown',
          reason,
          timestamp: expect.any(String),
        }),
      );
    });
  });
});
