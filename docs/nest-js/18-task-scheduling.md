# Task Scheduling (@nestjs/schedule)

Integrates with `node-cron` for scheduling jobs, intervals, and timeouts.

## Installation

```bash
npm install --save @nestjs/schedule
```

```typescript
import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';

@Module({
  imports: [ScheduleModule.forRoot()],
})
export class AppModule {}
```

## Declarative Cron Jobs

```typescript
import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';

@Injectable()
export class TasksService {
  private readonly logger = new Logger(TasksService.name);

  @Cron('45 * * * * *')
  handleCron() {
    this.logger.debug('Called when the current second is 45');
  }
}
```

### Cron Pattern

```
* * * * * *
| | | | | |
| | | | | day of week
| | | | months
| | | day of month
| | hours
| minutes
seconds (optional)
```

### Common Patterns (CronExpression enum)

```typescript
import { Cron, CronExpression } from '@nestjs/schedule';

@Cron(CronExpression.EVERY_30_SECONDS)
handleCron() {}
```

| Pattern | When |
|---------|------|
| `EVERY_30_SECONDS` | Every 30s |
| `EVERY_MINUTE` | Every minute |
| `EVERY_5_MINUTES` | Every 5 min |
| `EVERY_HOUR` | Every hour |
| `EVERY_DAY_AT_MIDNIGHT` | Daily at 00:00 |
| `EVERY_WEEKEND` | Sat/Sun midnight |

### Options

```typescript
@Cron('* * 0 * * *', {
  name: 'notifications',
  timeZone: 'Europe/Paris',
  waitForCompletion: true,  // don't overlap runs
  disabled: false,
})
triggerNotifications() {}
```

### Once at a specific Date

```typescript
@Cron(new Date(Date.now() + 10 * 1000))
handleOnce() {} // runs 10s after app starts
```

## Declarative Intervals

```typescript
import { Interval } from '@nestjs/schedule';

@Interval(10000)       // every 10 seconds
handleInterval() {}

@Interval('name', 2500) // named for dynamic control
handleNamedInterval() {}
```

## Declarative Timeouts

```typescript
import { Timeout } from '@nestjs/schedule';

@Timeout(5000)         // once after 5 seconds
handleTimeout() {}

@Timeout('name', 2500) // named for dynamic control
handleNamedTimeout() {}
```

## Dynamic Schedule API (SchedulerRegistry)

Inject `SchedulerRegistry`:

```typescript
import { SchedulerRegistry } from '@nestjs/schedule';

@Injectable()
export class TasksService {
  constructor(private schedulerRegistry: SchedulerRegistry) {}
}
```

### Dynamic Cron Jobs

```typescript
import { CronJob } from 'cron';

// Create
addCronJob(name: string, seconds: string) {
  const job = new CronJob(`${seconds} * * * * *`, () => {
    this.logger.warn(`job ${name} running at ${seconds}s`);
  });
  this.schedulerRegistry.addCronJob(name, job);
  job.start();
}

// Get & control
const job = this.schedulerRegistry.getCronJob('notifications');
job.stop();
job.start();
console.log(job.lastDate());
console.log(job.nextDate().toJSDate());

// Delete
this.schedulerRegistry.deleteCronJob(name);

// List all
const jobs = this.schedulerRegistry.getCronJobs();
jobs.forEach((value, key) => { ... });
```

### Dynamic Intervals

```typescript
addInterval(name: string, milliseconds: number) {
  const callback = () => { this.logger.warn(`Interval ${name}`); };
  const interval = setInterval(callback, milliseconds);
  this.schedulerRegistry.addInterval(name, interval);
}

const interval = this.schedulerRegistry.getInterval('notifications');
clearInterval(interval);

this.schedulerRegistry.deleteInterval(name);
const intervals = this.schedulerRegistry.getIntervals();
```

### Dynamic Timeouts

```typescript
addTimeout(name: string, milliseconds: number) {
  const callback = () => { this.logger.warn(`Timeout ${name}`); };
  const timeout = setTimeout(callback, milliseconds);
  this.schedulerRegistry.addTimeout(name, timeout);
}

const timeout = this.schedulerRegistry.getTimeout('notifications');
clearTimeout(timeout);

this.schedulerRegistry.deleteTimeout(name);
const timeouts = this.schedulerRegistry.getTimeouts();
```
