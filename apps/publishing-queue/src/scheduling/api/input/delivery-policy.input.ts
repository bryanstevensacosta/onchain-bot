import { IsInt, IsOptional, Min } from 'class-validator';

/**
 * Request DTOs for the canonical delivery-policy routes (R-c:
 * `GET/PATCH /api/scheduling/delivery-policies/:target`). Validated by
 * the global `ValidationPipe` (400 on shape violations); the
 * cross-field `delayMinMs <= delayMaxMs` invariant is enforced by the
 * controller (400) with the `DeliveryPolicy` VO as the final guard.
 */
export class UpdateDeliveryPolicyDto {
  @IsOptional()
  @IsInt()
  @Min(0)
  public delayMinMs?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  public delayMaxMs?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  public dailyCap?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  public resetHour?: number;
}
