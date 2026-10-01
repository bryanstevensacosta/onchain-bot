/**
 * EmojiMap domain entity (todo 5, dexter-message-templates).
 *
 * Table-driven emoji config for the template renderer: one row maps a
 * `(placeholderKey, matchValue)` pair to an `emoji` string
 * (e.g. `('chain', 'solana') -> '🟣'`). Pure domain — no Nest, no I/O.
 *
 * v1 covers `chain` only. Default seed rows (solana/ethereum/base/bsc/
 * arbitrum/polygon/unknown) are INSERTED by the todo-9 seed service —
 * never hardcoded here or in the resolver.
 *
 * v1 EXCLUSION (documented): `ChatSettings.emojiMode` is NOT consulted.
 * The resolver returns the mapped emoji regardless of per-chat prefs;
 * honoring `emojiMode=false` is a fase-2 concern (plan §36).
 */

import { randomUUID } from 'crypto';
import {
  validateEmoji,
  validateMatchValue,
  validatePlaceholderKey,
} from './emoji-map.validators';

export interface EmojiMapProps {
  readonly id: string;
  readonly placeholderKey: string;
  readonly matchValue: string;
  readonly emoji: string;
  readonly createdAt: Date;
}

export class EmojiMap {
  private state: {
    placeholderKey: string;
    matchValue: string;
    emoji: string;
    readonly createdAt: Date;
  };

  private readonly rawId: string;

  protected constructor(id: string, props: Omit<EmojiMapProps, 'id'>) {
    this.rawId = id;
    this.state = {
      placeholderKey: props.placeholderKey,
      matchValue: props.matchValue,
      emoji: props.emoji,
      createdAt: props.createdAt,
    };
  }

  public static create(input: {
    id?: string;
    placeholderKey: unknown;
    matchValue: unknown;
    emoji: unknown;
    createdAt?: Date;
  }): EmojiMap {
    return new EmojiMap(input.id ?? randomUUID(), {
      placeholderKey: validatePlaceholderKey(input.placeholderKey),
      matchValue: validateMatchValue(input.matchValue),
      emoji: validateEmoji(input.emoji),
      createdAt: input.createdAt ?? new Date(),
    });
  }

  public static reconstitute(props: EmojiMapProps): EmojiMap {
    return new EmojiMap(props.id, {
      placeholderKey: props.placeholderKey,
      matchValue: props.matchValue,
      emoji: props.emoji,
      createdAt: props.createdAt,
    });
  }

  public get id(): string {
    return this.rawId;
  }

  public get placeholderKey(): string {
    return this.state.placeholderKey;
  }

  public get matchValue(): string {
    return this.state.matchValue;
  }

  public get emoji(): string {
    return this.state.emoji;
  }

  public get createdAt(): Date {
    return this.state.createdAt;
  }

  public updateEmoji(raw: unknown): void {
    this.state.emoji = validateEmoji(raw);
  }

  public updateMatchValue(raw: unknown): void {
    this.state.matchValue = validateMatchValue(raw);
  }
}
