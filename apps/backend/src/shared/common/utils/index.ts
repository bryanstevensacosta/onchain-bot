/**
 * Common utility helpers used across Bounded Contexts.
 */
export { formatUrlsAsMarkdown } from './telegram-url-formatter';
export { sanitizeTelegramHtml } from './telegram-html-sanitizer';

export class Uuid {
  public static v4(): string {
    return crypto.randomUUID();
  }
}

export class DateTime {
  public static now(): Date {
    return new Date();
  }

  public static addMinutes(date: Date, minutes: number): Date {
    return new Date(date.getTime() + minutes * 60 * 1000);
  }

  public static isBefore(a: Date, b: Date): boolean {
    return a.getTime() < b.getTime();
  }

  public static isAfter(a: Date, b: Date): boolean {
    return a.getTime() > b.getTime();
  }
}
