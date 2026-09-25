import { ErrorCode } from '../kernel/domain-error';
import {
  LlmFailedError,
  PublishFailedError,
  QueueFullError,
} from './content-publisher.error';

describe('domain exceptions', () => {
  it('map to their error codes', () => {
    expect(new QueueFullError(10).code).toBe(ErrorCode.QUEUE_FULL);
    expect(new LlmFailedError('down').code).toBe(ErrorCode.LLM_FAILED);
    expect(new PublishFailedError('401').code).toBe(ErrorCode.PUBLISH_FAILED);
  });
});
