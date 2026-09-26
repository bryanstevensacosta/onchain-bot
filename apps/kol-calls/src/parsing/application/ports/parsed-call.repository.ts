import { ParsedCall } from '../../domain/entities/parsed-call.entity';

export abstract class ParsedCallRepository {
  abstract save(call: ParsedCall): Promise<void>;
  abstract findByMessage(
    kolId: string,
    messageId: number,
  ): Promise<ReadonlyArray<ParsedCall>>;
  abstract findRecent(limit: number): Promise<ReadonlyArray<ParsedCall>>;
  abstract count(): Promise<number>;
}
