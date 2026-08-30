import { Injectable, Logger } from '@nestjs/common';

/**
 * StructuredLoggerService
 *
 * Centralized structured logging service for the Ingestion Service.
 * Uses Pino logger (NOT Winston) with JSON format for observability.
 *
 * Per Requirement 9: Structured logging for monitoring and debugging
 * Per Task 4.1: Structured logging implementation with Pino
 *
 * All log events follow structured JSON format with:
 * - event: string (e.g., 'message:received', 'sse:client:connected')
 * - contextual fields specific to the event
 * - timestamp: ISO 8601 format
 *
 * @injectable NestJS service
 */
@Injectable()
export class StructuredLoggerService {
  private readonly logger = new Logger(StructuredLoggerService.name);

  /**
   * Log message received from Telegram
   *
   * Per Requirement 9.1: Log all incoming messages with structured format
   *
   * @param channelId - Telegram channel identifier
   * @param messageId - Telegram message ID
   * @param hasMedia - Whether message contains media attachments
   * @param mediaCount - Number of media attachments
   * @param messageType - Type of message ('kol' or 'crypto-news')
   * @param occurredAt - When the message was sent (ISO 8601)
   */
  logMessageReceived(
    channelId: string,
    messageId: number,
    hasMedia: boolean,
    mediaCount: number,
    messageType: 'kol' | 'crypto-news',
    occurredAt: string,
  ): void {
    this.logger.log({
      event: 'message:received',
      channelId,
      messageId,
      hasMedia,
      mediaCount,
      messageType,
      occurredAt,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Log SSE client connection
   *
   * Per Requirement 9.2: Log client connection events
   *
   * @param clientId - Unique client identifier
   * @param totalClients - Total number of connected clients after this connection
   */
  logClientConnected(clientId: string, totalClients: number): void {
    this.logger.log({
      event: 'sse:client:connected',
      clientId,
      totalClients,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Log SSE client disconnection
   *
   * Per Requirement 9.2: Log client disconnection events
   *
   * @param clientId - Unique client identifier
   * @param totalClients - Total number of connected clients after this disconnection
   */
  logClientDisconnected(clientId: string, totalClients: number): void {
    this.logger.log({
      event: 'sse:client:disconnected',
      clientId,
      totalClients,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Log flood wait detection from Telegram API
   *
   * Per Requirement 9.3: Log FLOOD_WAIT errors with retry context
   * Per Requirement 11.2: Track flood wait occurrences for ban risk monitoring
   *
   * @param waitSeconds - Number of seconds Telegram requires us to wait
   * @param count24h - Total FLOOD_WAIT count in 24-hour sliding window
   * @param backoffMs - Actual backoff duration in milliseconds (includes exponential backoff)
   * @param attempt - Current retry attempt number
   * @param maxAttempts - Maximum retry attempts before pausing
   * @param label - Context label for the operation that triggered flood wait
   */
  logFloodWaitDetected(
    waitSeconds: number,
    count24h: number,
    backoffMs: number,
    attempt: number,
    maxAttempts: number,
    label: string,
  ): void {
    this.logger.log({
      event: 'flood_wait:detected',
      waitSeconds,
      count24h,
      backoffMs,
      attempt,
      maxAttempts,
      label,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Log media download failure
   *
   * Per Requirement 9.4: Log media download errors with context
   *
   * @param channelId - Telegram channel identifier
   * @param messageId - Telegram message ID
   * @param index - Media attachment index (0-based)
   * @param error - Error message
   * @param stack - Error stack trace
   * @param fileSize - Expected file size in bytes (if known)
   * @param mimeType - Expected MIME type (if known)
   */
  logMediaDownloadFailed(
    channelId: string,
    messageId: number,
    index: number,
    error: string,
    stack?: string,
    fileSize?: number,
    mimeType?: string,
  ): void {
    this.logger.error({
      event: 'media:download:failed',
      channelId,
      messageId,
      index,
      error,
      stack,
      fileSize,
      mimeType,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Log media download success
   *
   * Optional: Track successful downloads for metrics
   *
   * @param channelId - Telegram channel identifier
   * @param messageId - Telegram message ID
   * @param index - Media attachment index (0-based)
   * @param filePath - Path where media was saved
   * @param fileSize - Downloaded file size in bytes
   * @param downloadDurationMs - Time taken to download in milliseconds
   */
  logMediaDownloadSuccess(
    channelId: string,
    messageId: number,
    index: number,
    filePath: string,
    fileSize: number,
    downloadDurationMs: number,
  ): void {
    this.logger.log({
      event: 'media:download:success',
      channelId,
      messageId,
      index,
      filePath,
      fileSize,
      downloadDurationMs,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Log MTProto connection state change
   *
   * Per Requirement 5: Health monitoring
   *
   * @param connected - Whether MTProto client is connected
   * @param authorized - Whether MTProto client is authorized
   */
  logMtprotoConnectionChange(connected: boolean, authorized: boolean): void {
    this.logger.log({
      event: 'mtproto:connection:changed',
      connected,
      authorized,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Log service startup
   *
   * @param port - HTTP server port
   * @param channelCount - Number of channels configured
   */
  logServiceStartup(port: number, channelCount: number): void {
    this.logger.log({
      event: 'service:started',
      port,
      channelCount,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Log service shutdown
   *
   * @param reason - Reason for shutdown
   */
  logServiceShutdown(reason: string): void {
    this.logger.log({
      event: 'service:shutdown',
      reason,
      timestamp: new Date().toISOString(),
    });
  }
}
