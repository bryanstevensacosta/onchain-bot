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
 * Per-channel content-filter rule (moved from backend ingestion/crypto-news).
 *
 * Regex transform applied on-read by the matching pipeline, never
 * persisted back: the feed stores raw content. `channelId` is an OPAQUE
 * varchar with NO foreign key by design — sources live in the
 * ingestion service DB, so no JOIN is possible or wanted. Unknown
 * channels are warn-only, never an error.
 */
export class ChannelContentFilterConfig extends AggregateRoot<string> {
  private state: ChannelContentFilterConfigProps;

  protected constructor(id: string, props: ChannelContentFilterConfigProps) {
    super(id);
    this.state = props;
  }

  public static create(input: {
    id?: string;
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
    try {
      new RegExp(input.pattern);
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
    return new ChannelContentFilterConfig(input.id ?? crypto.randomUUID(), {
      channelId: input.channelId,
      pattern: input.pattern,
      replacement: input.replacement ?? '',
      flags,
      isActive: input.isActive ?? true,
      priority,
      createdAt: now,
      updatedAt: now,
    });
  }

  public static reconstitute(
    input: { id: string } & ChannelContentFilterConfigProps,
  ): ChannelContentFilterConfig {
    return new ChannelContentFilterConfig(input.id, input);
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

  public toggle(): void {
    if (this.state.isActive) {
      this.deactivate();
    } else {
      this.activate();
    }
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

  public toRegExp(): RegExp {
    return new RegExp(this.state.pattern, this.state.flags);
  }

  protected mutate(_event: DomainEvent): void {
    void _event;
  }
}
