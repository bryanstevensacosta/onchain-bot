/**
 * DisplayMap domain entity (dexter-message-templates, display-catalog rename).
 *
 * Table-driven display config for the template renderer: one row maps a
 * `(placeholderKey, matchValue)` pair to a `display` string
 * (e.g. `('chain', 'solana') -> '🟣'`, `('chain', 'solana') -> 'SOL'`,
 * or `('chain', 'solana') -> '🟣 SOL'`). Pure domain — no Nest, no I/O.
 *
 * v1 covers `chain` only. Default seed rows (solana/ethereum/base/bsc/
 * arbitrum/polygon/unknown) are INSERTED by the todo-9 seed service —
 * never hardcoded here or in the resolver.
 *
 * v1 EXCLUSION (documented): `ChatSettings.emojiMode` is NOT consulted.
 * The resolver returns the mapped display regardless of per-chat prefs;
 * honoring `emojiMode=false` is a fase-2 concern (plan §36).
 */

import { randomUUID } from 'crypto';
import {
  validateDisplay,
  validateMatchValue,
  validatePlaceholderKey,
} from './display-map.validators';

export interface DisplayMapProps {
  readonly id: string;
  readonly placeholderKey: string;
  readonly matchValue: string;
  readonly display: string;
  readonly createdAt: Date;
}

export class DisplayMap {
  private state: {
    placeholderKey: string;
    matchValue: string;
    display: string;
    readonly createdAt: Date;
  };

  private readonly rawId: string;

  protected constructor(id: string, props: Omit<DisplayMapProps, 'id'>) {
    this.rawId = id;
    this.state = {
      placeholderKey: props.placeholderKey,
      matchValue: props.matchValue,
      display: props.display,
      createdAt: props.createdAt,
    };
  }

  public static create(input: {
    id?: string;
    placeholderKey: unknown;
    matchValue: unknown;
    display: unknown;
    createdAt?: Date;
  }): DisplayMap {
    return new DisplayMap(input.id ?? randomUUID(), {
      placeholderKey: validatePlaceholderKey(input.placeholderKey),
      matchValue: validateMatchValue(input.matchValue),
      display: validateDisplay(input.display),
      createdAt: input.createdAt ?? new Date(),
    });
  }

  public static reconstitute(props: DisplayMapProps): DisplayMap {
    return new DisplayMap(props.id, {
      placeholderKey: props.placeholderKey,
      matchValue: props.matchValue,
      display: props.display,
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

  public get display(): string {
    return this.state.display;
  }

  public get createdAt(): Date {
    return this.state.createdAt;
  }

  public updateDisplay(raw: unknown): void {
    this.state.display = validateDisplay(raw);
  }

  public updateMatchValue(raw: unknown): void {
    this.state.matchValue = validateMatchValue(raw);
  }
}
