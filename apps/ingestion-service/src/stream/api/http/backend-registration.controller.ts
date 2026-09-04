import {
  Controller,
  Post,
  Body,
  BadRequestException,
  Logger,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { RegisterBackendDto } from './dto/register-backend.dto';
import type { RegisterBackendResponse } from './dto/register-backend.dto';
import { BackendChannelProviderService } from '../../../telegram/shared/services/backend-channel-provider.service';

/**
 * BackendRegistrationController - Handles backend registration with source whitelists
 *
 * Per Requirement 1.1: Accept Backend registration requests with identifier and Source_Whitelist
 * Per Requirement 1.2: Store Backend identifier and Source_Whitelist in memory
 * Per Requirement 1.3: Compute and return Channel_Union size
 *
 * Endpoints:
 * - POST /api/ingestion/backends/register - Register a backend with source whitelist
 *
 * @controller Handles /api/ingestion/backends routes
 */
@Controller('api/ingestion/backends')
export class BackendRegistrationController {
  private readonly logger = new Logger(BackendRegistrationController.name);

  constructor(
    private readonly channelProvider: BackendChannelProviderService,
  ) {}

  /**
   * Register a backend with its source whitelist
   *
   * Per Requirement 1.1: Accept backendId and sourceWhitelist via HTTP POST
   * Per Requirement 1.2: Store registration in BackendChannelProviderService
   * Per Requirement 1.3: Return computed Channel_Union size
   *
   * Validates:
   * - backendId is non-empty string
   * - sourceWhitelist is array of strings
   * - apiVersion is optional string (defaults to "v1")
   *
   * Returns 200 with { registered: true, channelUnionSize: number } on success
   * Returns 400 on invalid input
   *
   * @param dto - Registration request body
   * @returns RegisterBackendResponse
   */
  @Post('register')
  @HttpCode(HttpStatus.OK)
  register(@Body() dto: RegisterBackendDto): RegisterBackendResponse {
    // Validate backendId format (non-empty, no whitespace-only)
    if (!dto.backendId || dto.backendId.trim().length === 0) {
      this.logger.warn(`Registration rejected: empty backendId`);
      throw new BadRequestException('backendId cannot be empty');
    }

    // Validate backendId format (alphanumeric, hyphens, underscores only)
    const validBackendIdPattern = /^[a-zA-Z0-9_-]+$/;
    if (!validBackendIdPattern.test(dto.backendId)) {
      this.logger.warn(
        `Registration rejected: invalid backendId format: ${dto.backendId}`,
      );
      throw new BadRequestException(
        'backendId must contain only alphanumeric characters, hyphens, and underscores',
      );
    }

    // Validate sourceWhitelist (allow empty array)
    if (!Array.isArray(dto.sourceWhitelist)) {
      this.logger.warn(
        `Registration rejected: sourceWhitelist is not an array for backend ${dto.backendId}`,
      );
      throw new BadRequestException('sourceWhitelist must be an array');
    }

    const apiVersion = dto.apiVersion || 'v1';

    this.logger.log(
      `Registering backend: ${dto.backendId}, channels: ${dto.sourceWhitelist.length}, apiVersion: ${apiVersion}`,
    );

    // Register backend with channel provider
    // This will trigger channel union computation and MTProto subscription updates
    this.channelProvider.registerBackend(dto.backendId, dto.sourceWhitelist);

    // Get the channel union size after registration
    const channelUnionSize = this.channelProvider.getChannelUnionSize();

    this.logger.log(
      `Backend ${dto.backendId} registered successfully. Channel union size: ${channelUnionSize}`,
    );

    return {
      registered: true,
      channelUnionSize,
      message: `Backend ${dto.backendId} registered with ${dto.sourceWhitelist.length} channels`,
    };
  }
}
