/**
 * LaunchpadOverride domain entity (dexter plan todo 37, manual
 * mint→launchpad safety net).
 *
 * Operator-curated origin for ONE mint: when a row exists, the scan
 * pipeline reports the curated `launchpad_id` with MAXIMUM precedence
 * over the market-data detector (before any automatic leg, even a
 * positive detection). Deleting the row restores detector behavior.
 *
 * DisplayMap is deliberately NOT reused (it maps display strings for
 * the renderer — emoji, not identity). Separate table by design.
 *
 * NO update methods by design — curated rows are delete+recreate
 * (an edit is a new curation decision with a fresh `createdAt`, and
 * the audit trail stays append-only). Pure domain — no Nest, no I/O.
 */

import { randomUUID } from 'crypto';
import {
  normalizeMint,
  validateLaunchpadId,
  validateNote,
} from './launchpad-override.validators';

export interface LaunchpadOverrideProps {
  readonly id: string;
  readonly mint: string;
  readonly launchpadId: string;
  readonly note: string | null;
  readonly createdAt: Date;
}

export class LaunchpadOverride {
  private readonly rawId: string;
  private readonly rawMint: string;
  private readonly rawLaunchpadId: string;
  private readonly rawNote: string | null;
  private readonly rawCreatedAt: Date;

  protected constructor(id: string, props: Omit<LaunchpadOverrideProps, 'id'>) {
    this.rawId = id;
    this.rawMint = props.mint;
    this.rawLaunchpadId = props.launchpadId;
    this.rawNote = props.note;
    this.rawCreatedAt = props.createdAt;
  }

  public static create(input: {
    id?: string;
    mint: unknown;
    launchpadId: unknown;
    note?: unknown;
    createdAt?: Date;
  }): LaunchpadOverride {
    return new LaunchpadOverride(input.id ?? randomUUID(), {
      mint: normalizeMint(input.mint),
      launchpadId: validateLaunchpadId(input.launchpadId),
      note: validateNote(input.note),
      createdAt: input.createdAt ?? new Date(),
    });
  }

  public static reconstitute(props: LaunchpadOverrideProps): LaunchpadOverride {
    return new LaunchpadOverride(props.id, {
      mint: props.mint,
      launchpadId: props.launchpadId,
      note: props.note,
      createdAt: props.createdAt,
    });
  }

  public get id(): string {
    return this.rawId;
  }

  public get mint(): string {
    return this.rawMint;
  }

  public get launchpadId(): string {
    return this.rawLaunchpadId;
  }

  public get note(): string | null {
    return this.rawNote;
  }

  public get createdAt(): Date {
    return this.rawCreatedAt;
  }
}
