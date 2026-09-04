import { IsArray, IsOptional, IsString } from 'class-validator';

/**
 * RegisterBackendDto - Request body for backend registration
 *
 * Per Requirement 1.1: Backend sends HTTP POST with identifier and Source_Whitelist
 * Per Requirement 1.2: Ingestion_Service stores Backend identifier and whitelist
 *
 * @see RegisterBackendResponse for response structure
 */
export class RegisterBackendDto {
  /**
   * Unique identifier for the backend (e.g., "production", "staging", "dev")
   */
  @IsString()
  backendId!: string;

  /**
   * Array of Telegram channel/user IDs this backend wants to receive messages from
   */
  @IsArray()
  @IsString({ each: true })
  sourceWhitelist!: string[];

  /**
   * API version for future compatibility (default: "v1")
   */
  @IsOptional()
  @IsString()
  apiVersion?: string;
}

/**
 * RegisterBackendResponse - Response structure for backend registration
 *
 * Per Requirement 1.3: Returns computed Channel_Union size
 */
export interface RegisterBackendResponse {
  /**
   * Whether the backend was successfully registered
   */
  registered: boolean;

  /**
   * Total unique channels across all registered backends
   */
  channelUnionSize: number;

  /**
   * Optional informational message
   */
  message?: string;
}
