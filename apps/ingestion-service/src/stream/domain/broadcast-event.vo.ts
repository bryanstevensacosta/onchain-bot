import { randomUUID } from 'crypto';

/**
 * BroadcastEvent Value Object
 *
 * Represents a Telegram message broadcast event sent via SSE to backends.
 * Immutable value object with serialization/deserialization support.
 *
 * Requirements:
 * - 4.1: Event structure with all message metadata
 * - 4.2: Round-trip serialization property
 */
export class BroadcastEvent {
  readonly eventId: string;
  readonly timestamp: number;
  readonly channelId: string;
  readonly messageId: number;
  readonly content: string;
  readonly title?: string;
  readonly mediaPath?: string;
  readonly publishedAt: number;
  [key: string]: unknown; // Index signature for compatibility with interface

  private constructor(props: {
    eventId: string;
    timestamp: number;
    channelId: string;
    messageId: number;
    content: string;
    title?: string;
    mediaPath?: string;
    publishedAt: number;
  }) {
    this.eventId = props.eventId;
    this.timestamp = props.timestamp;
    this.channelId = props.channelId;
    this.messageId = props.messageId;
    this.content = props.content;
    this.title = props.title;
    this.mediaPath = props.mediaPath;
    this.publishedAt = props.publishedAt;

    Object.freeze(this);
  }

  /**
   * Factory method to create BroadcastEvent from Telegram message
   *
   * @param channelId - Source Telegram channel/user ID
   * @param msg - Telegram message object with id, text/message, date
   * @param mediaPath - Optional relative path to downloaded media file
   * @returns BroadcastEvent instance
   */
  static fromTelegramMessage(
    channelId: string,
    msg: { id: number; message?: string; text?: string; date: number },
    mediaPath?: string,
  ): BroadcastEvent {
    const content = msg.message || msg.text || '';
    const now = Date.now();

    return new BroadcastEvent({
      eventId: randomUUID(),
      timestamp: now,
      channelId: String(channelId),
      messageId: msg.id,
      content,
      title: undefined,
      mediaPath,
      publishedAt: msg.date * 1000, // Convert Unix seconds to ms
    });
  }

  /**
   * Serialize to JSON object
   *
   * @returns Plain object representation
   */
  toJSON(): Record<string, any> {
    return {
      eventId: this.eventId,
      timestamp: this.timestamp,
      channelId: this.channelId,
      messageId: this.messageId,
      content: this.content,
      ...(this.title !== undefined && { title: this.title }),
      ...(this.mediaPath !== undefined && { mediaPath: this.mediaPath }),
      publishedAt: this.publishedAt,
    };
  }

  /**
   * Deserialize from JSON string
   *
   * @param json - JSON string representation
   * @returns BroadcastEvent instance
   * @throws Error if JSON is invalid or missing required fields
   */
  static fromJSON(json: string): BroadcastEvent {
    let parsed: any;

    try {
      parsed = JSON.parse(json);
    } catch (error) {
      throw new Error(
        `Invalid JSON: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    // Validate required fields
    const requiredFields = [
      'eventId',
      'timestamp',
      'channelId',
      'messageId',
      'content',
      'publishedAt',
    ];

    for (const field of requiredFields) {
      if (!(field in parsed) || parsed[field] === null) {
        throw new Error(`Missing required field: ${field}`);
      }
    }

    // Type validation
    if (typeof parsed.eventId !== 'string') {
      throw new Error('eventId must be a string');
    }
    if (typeof parsed.timestamp !== 'number') {
      throw new Error('timestamp must be a number');
    }
    if (typeof parsed.channelId !== 'string') {
      throw new Error('channelId must be a string');
    }
    if (typeof parsed.messageId !== 'number') {
      throw new Error('messageId must be a number');
    }
    if (typeof parsed.content !== 'string') {
      throw new Error('content must be a string');
    }
    if (typeof parsed.publishedAt !== 'number') {
      throw new Error('publishedAt must be a number');
    }

    // Optional field validation
    if (
      parsed.title !== undefined &&
      parsed.title !== null &&
      typeof parsed.title !== 'string'
    ) {
      throw new Error('title must be a string when present');
    }
    if (
      parsed.mediaPath !== undefined &&
      parsed.mediaPath !== null &&
      typeof parsed.mediaPath !== 'string'
    ) {
      throw new Error('mediaPath must be a string when present');
    }

    return new BroadcastEvent({
      eventId: parsed.eventId,
      timestamp: parsed.timestamp,
      channelId: parsed.channelId,
      messageId: parsed.messageId,
      content: parsed.content,
      title: parsed.title !== null ? parsed.title : undefined,
      mediaPath: parsed.mediaPath !== null ? parsed.mediaPath : undefined,
      publishedAt: parsed.publishedAt,
    });
  }

  /**
   * Structural equality comparison
   *
   * @param other - Another BroadcastEvent or null/undefined
   * @returns true if all properties are equal
   */
  equals(other: BroadcastEvent | null | undefined): boolean {
    if (other === null || other === undefined) return false;
    if (!(other instanceof BroadcastEvent)) return false;

    return (
      this.eventId === other.eventId &&
      this.timestamp === other.timestamp &&
      this.channelId === other.channelId &&
      this.messageId === other.messageId &&
      this.content === other.content &&
      this.title === other.title &&
      this.mediaPath === other.mediaPath &&
      this.publishedAt === other.publishedAt
    );
  }
}
