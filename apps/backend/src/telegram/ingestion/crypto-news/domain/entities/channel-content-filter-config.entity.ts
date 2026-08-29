import { AggregateRoot } from 'shared/kernel/aggregate-root';
import { DomainError, ErrorCode } from 'shared/kernel/domain-error';
import type { DomainEvent } from 'shared/kernel/domain-event';

interface ChannelContentFilterConfigProps {
  readonly channelId: string;
  pattern: string;
  replacement: string;
  flags: string;
  isActive: boolean;
  priority: number;
  readonly createdAt: Date;
  updatedAt: Date;
}

/**
 * Content filter configuration for a crypto-news channel.
 *
 * Defines a regex pattern with replacement to be applied to message content
 * before persistence. Filters are ordered by (priority ASC, createdAt ASC)
 * for deterministic execution order.
 *
 * Aggregate root with channelId as the identity (FK to CryptoNewsSource).
 */
export class ChannelContentFilterConfig extends AggregateRoot<string> {
  private state: ChannelContentFilterConfigProps;

  protected constructor(id: string, props: ChannelContentFilterConfigProps) {
    super(id);
    this.state = props;
  }

  /**
   * Create a new content filter configuration.
   *
   * Validates:
   * - channelId is a valid Telegram channel ID (numeric string, optionally negative)
   * - pattern is a valid regex
   * - flags only contain valid regex flags (g, i, m, s, u, y)
   * - priority is a non-negative integer
   */
  public static create(input: {
    channelId: string;
    pattern: string;
    replacement?: string;
    flags?: string;
    isActive?: boolean;
    priority?: number;
  }): ChannelContentFilterConfig {
    if (!/^-?\d+$/.test(input.channelId)) {
      throw new DomainError(
        ErrorCode.VALIDATION,
        `Invalid channelId for filter config: ${input.channelId}`,
        { channelId: input.channelId },
      );
    }

    let validatedPattern: string;
    try {
      validatedPattern = input.pattern;
      new RegExp(validatedPattern);
    } catch {
      throw new DomainError(
        ErrorCode.VALIDATION,
        `Invalid regex pattern: ${input.pattern}`,
        { pattern: input.pattern },
      );
    }

    const flags = input.flags ?? 'gi';
    if (!/^[gimsuy]+$/.test(flags)) {
      throw new DomainError(
        ErrorCode.VALIDATION,
        `Invalid regex flags: ${flags}. Valid flags: g, i, m, s, u, y`,
        { flags },
      );
    }

    const priority = input.priority ?? 0;
    if (!Number.isInteger(priority) || priority < 0) {
      throw new DomainError(
        ErrorCode.VALIDATION,
        `Priority must be a non-negative integer, got: ${priority}`,
        { priority },
      );
    }

    const now = new Date();
    const config = new ChannelContentFilterConfig(input.channelId, {
      channelId: input.channelId,
      pattern: validatedPattern,
      replacement: input.replacement ?? '',
      flags,
      isActive: input.isActive ?? true,
      priority,
      createdAt: now,
      updatedAt: now,
    });

    return config;
  }

  /**
   * Rehydrate an existing filter config from persistence.
   * For hydration use ONLY — prefer `create()` for new aggregates.
   */
  public static reconstitute(
    input: ChannelContentFilterConfigProps,
  ): ChannelContentFilterConfig {
    return new ChannelContentFilterConfig(input.channelId, input);
  }

  public get channelId(): string {
    return this.state.channelId;
  }

  public get pattern(): string {
    return this.state.pattern;
  }

  public get replacement(): string {
    return this.state.replacement;
  }

  public get flags(): string {
    return this.state.flags;
  }

  public get isActive(): boolean {
    return this.state.isActive;
  }

  public get priority(): number {
    return this.state.priority;
  }

  public get createdAt(): Date {
    return this.state.createdAt;
  }

  public get updatedAt(): Date {
    return this.state.updatedAt;
  }

  public activate(): void {
    if (this.state.isActive) {
      return;
    }
    this.state.isActive = true;
    this.state.updatedAt = new Date();
  }

  public deactivate(): void {
    if (!this.state.isActive) {
      return;
    }
    this.state.isActive = false;
    this.state.updatedAt = new Date();
  }

  public updatePattern(newPattern: string): void {
    try {
      new RegExp(newPattern);
    } catch {
      throw new DomainError(
        ErrorCode.VALIDATION,
        `Invalid regex pattern: ${newPattern}`,
        { pattern: newPattern },
      );
    }
    if (newPattern === this.state.pattern) {
      return;
    }
    this.state.pattern = newPattern;
    this.state.updatedAt = new Date();
  }

  public updateReplacement(newReplacement: string): void {
    if (newReplacement === this.state.replacement) {
      return;
    }
    this.state.replacement = newReplacement;
    this.state.updatedAt = new Date();
  }

  public updateFlags(newFlags: string): void {
    if (!/^[gimsuy]+$/.test(newFlags)) {
      throw new DomainError(
        ErrorCode.VALIDATION,
        `Invalid regex flags: ${newFlags}. Valid flags: g, i, m, s, u, y`,
        { flags: newFlags },
      );
    }
    if (newFlags === this.state.flags) {
      return;
    }
    this.state.flags = newFlags;
    this.state.updatedAt = new Date();
  }

  public setPriority(newPriority: number): void {
    if (!Number.isInteger(newPriority) || newPriority < 0) {
      throw new DomainError(
        ErrorCode.VALIDATION,
        `Priority must be a non-negative integer, got: ${newPriority}`,
        { priority: newPriority },
      );
    }
    if (newPriority === this.state.priority) {
      return;
    }
    this.state.priority = newPriority;
    this.state.updatedAt = new Date();
  }

  /**
   * Returns a compiled RegExp instance for this filter.
   * Throws if pattern is invalid (should not happen if created via create()).
   */
  public toRegExp(): RegExp {
    return new RegExp(this.state.pattern, this.state.flags);
  }

  protected mutate(_event: DomainEvent): void {
    // No domain events emitted by this aggregate currently.
    // Events can be added later if needed (e.g., FilterConfigUpdatedEvent).
  }
}
