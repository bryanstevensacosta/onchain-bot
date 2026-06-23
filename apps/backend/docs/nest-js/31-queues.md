# Queues (BullMQ & Bull)

Queue-based task processing using Redis. Supports BullMQ (modern, actively developed) and Bull (maintenance).

## Installation (BullMQ)

```bash
npm install --save @nestjs/bullmq bullmq
```

## Setup

```typescript
import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';

@Module({
  imports: [
    BullModule.forRoot({
      connection: {
        host: 'localhost',
        port: 6379,
      },
    }),
  ],
})
export class AppModule {}
```

## Register a Queue

```typescript
BullModule.registerQueue({ name: 'audio' });
```

## Producers

```typescript
import { Injectable } from '@nestjs/common';
import { Queue } from 'bullmq';
import { InjectQueue } from '@nestjs/bullmq';

@Injectable()
export class AudioService {
  constructor(@InjectQueue('audio') private audioQueue: Queue) {}

  async transcode() {
    await this.audioQueue.add('transcode', { foo: 'bar' });
  }
}
```

### Job Options

```typescript
await this.audioQueue.add('transcode', data, {
  delay: 3000,         // 3 second delay
  priority: 2,         // 1 = highest
  attempts: 5,         // retry 5 times
  lifo: true,          // last in, first out
  removeOnComplete: true,
  backoff: { type: 'exponential', delay: 1000 },
});
```

## Consumers

```typescript
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';

@Processor('audio')
export class AudioConsumer extends WorkerHost {
  async process(job: Job<any, any, string>): Promise<any> {
    switch (job.name) {
      case 'transcode':
        // handle transcode
        break;
      case 'concatenate':
        // handle concatenate
        break;
    }
  }
}
```

## Event Listeners (Worker)

```typescript
@OnWorkerEvent('active')
onActive(job: Job) {
  console.log(`Processing job ${job.id}`);
}

@OnWorkerEvent('completed')
onCompleted(job: Job) {
  console.log(`Job ${job.id} completed`);
}

@OnWorkerEvent('failed')
onFailed(job: Job, err: Error) {
  console.error(`Job ${job.id} failed`, err);
}
```

### Queue Events

```typescript
import { QueueEventsHost, QueueEventsListener, OnQueueEvent } from '@nestjs/bullmq';

@QueueEventsListener('audio')
export class AudioEventsListener extends QueueEventsHost {
  @OnQueueEvent('active')
  onActive(job: { jobId: string }) {
    console.log(`Processing job ${job.jobId}`);
  }
}
```

## Queue Management

```typescript
await audioQueue.pause();
await audioQueue.resume();
const jobCounts = await audioQueue.getJobCounts();
```

---

## Bull (Legacy)

```bash
npm install --save @nestjs/bull bull
```

```typescript
import { BullModule } from '@nestjs/bull';

BullModule.forRoot({
  redis: { host: 'localhost', port: 6379 },
});
```

### Producer

```typescript
import { Queue } from 'bull';
import { InjectQueue } from '@nestjs/bull';

@Injectable()
export class AudioService {
  constructor(@InjectQueue('audio') private audioQueue: Queue) {}

  async add() {
    await this.audioQueue.add('transcode', { foo: 'bar' });
  }
}
```

### Consumer

```typescript
import { Processor, Process } from '@nestjs/bull';
import { Job } from 'bull';

@Processor('audio')
export class AudioConsumer {
  @Process('transcode')
  async transcode(job: Job<unknown>) {
    // process
  }
}
```

### Event Listeners (Bull)

```typescript
@OnQueueActive()
onActive(job: Job) {}

@OnQueueCompleted()
onCompleted(job: Job, result: any) {}

@OnQueueFailed()
onFailed(job: Job, err: Error) {}
```

## Async Configuration

```typescript
BullModule.forRootAsync({
  imports: [ConfigModule],
  useFactory: async (configService: ConfigService) => ({
    connection: {
      host: configService.get('REDIS_HOST'),
      port: configService.get('REDIS_PORT'),
    },
  }),
  inject: [ConfigService],
});
```
