import { Module } from '@nestjs/common';
import { StructuredLoggerService } from './structured-logger.service';

/**
 * LoggingModule
 *
 * Provides structured logging services for the Ingestion Service.
 *
 * Per Requirement 9: Observability and monitoring through structured logs
 * Per Task 4.1: Pino-based structured logging implementation
 *
 * @module Global logging module
 */
@Module({
  providers: [StructuredLoggerService],
  exports: [StructuredLoggerService],
})
export class LoggingModule {}
