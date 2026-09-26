import type { ScheduleResultCallback } from '../../domain/schedule-request';
import { ScheduleResultCallbackPort } from '../../domain/ports/schedule-result-callback.port';

export class InMemoryCallbackRecorder extends ScheduleResultCallbackPort {
  public readonly emitted: ScheduleResultCallback[] = [];

  public async emit(callback: ScheduleResultCallback): Promise<void> {
    this.emitted.push({ ...callback });
  }
}
