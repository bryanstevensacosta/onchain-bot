export interface ThreadsKeywordProps {
  readonly id: string;
  readonly phrase: string;
  readonly matchMode?: 'exact' | 'substring';
  readonly channelId?: string | null;
  readonly requireMedia?: boolean;
  readonly templateId?: string | null;
}

/**
 * Threads keyword (backend parity: phrase + AND-group via comma segments).
 */
export class ThreadsKeyword {
  public constructor(private readonly props: ThreadsKeywordProps) {}

  public get id(): string {
    return this.props.id;
  }

  public get phrase(): string {
    return this.props.phrase;
  }

  public get requireMedia(): boolean {
    return this.props.requireMedia ?? false;
  }

  public get templateId(): string | null {
    return this.props.templateId ?? null;
  }

  public matchesText(text: string): boolean {
    const hay = (text ?? '').toLowerCase();
    const groups = this.props.phrase
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .filter((s) => s.length > 0);
    if (groups.length === 0) {
      return false;
    }
    return groups.every((g) => hay.includes(g));
  }
}
