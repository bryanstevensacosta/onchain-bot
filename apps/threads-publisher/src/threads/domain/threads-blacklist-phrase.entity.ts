/**
 * Threads blacklist phrase (backend parity).
 */
export class ThreadsBlacklistPhrase {
  public constructor(
    public readonly id: string,
    public readonly phrase: string,
  ) {}

  public blocksText(text: string): boolean {
    const hay = (text ?? '').toLowerCase();
    return hay.includes(this.phrase.toLowerCase());
  }
}
