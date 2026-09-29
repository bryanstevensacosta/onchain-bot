/**
 * @deprecated Moved to apps/feed-publisher/src/queue/ + apps/feed-publisher/src/llm/ + apps/feed-publisher/src/keywords/ (Tramo 2, todos 3+4+5 + P18 companion).
 * Backend legacy copy; stays wired for dual-run and is removed at cutover (todo 11).
 * Do not extend — add queue/llm/keywords logic in apps/feed-publisher/src/{queue,llm,keywords}/ instead.
 */
/**
 * Publisher DTOs barrel export
 *
 * Strategy 1 (Pure DTO): Backend uses DTOs to decouple from ingestion-telegram
 * domain entities. These DTOs are internal to the publisher module.
 */
export type {
  EnqueueMessageDto,
  EnqueueMessageMediaDto,
} from './enqueue-message.dto';
