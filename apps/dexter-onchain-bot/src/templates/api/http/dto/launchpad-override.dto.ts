import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
import { MAX_NOTE_LENGTH } from '@/templates/domain/launchpad-override.validators';

/**
 * DTO for the launchpad-overrides HTTP API (dexter plan todo 37).
 *
 * Limits mirror the domain validators: `note` caps at the same
 * `MAX_NOTE_LENGTH` (plain prose — class-validator `MaxLength` is
 * exact here, no emoji semantics). `mint`/`launchpadId` pass the DTO
 * as non-empty strings and are normalized/validated in the
 * controller path (malformed mint → 400, unknown `launchpadId` →
 * 400 carrying the whitelist `KNOWN_LAUNCHPAD_IDS`).
 *
 * NO update DTO by design — curated rows are delete+recreate (see
 * the entity docs); there is no PATCH endpoint.
 */
export class CreateLaunchpadOverrideDto {
  @IsString()
  @IsNotEmpty()
  public mint!: string;

  @IsString()
  @IsNotEmpty()
  public launchpadId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(MAX_NOTE_LENGTH)
  public note?: string;
}
