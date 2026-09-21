import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import {
  DeadLetterController,
  toDeadLetterView,
} from './dead-letter.controller';
import { DeadLetterService } from '../../application/services/dead-letter.service';
import { DeadLetterQueueEntry } from '../../domain/entities/dead-letter-queue-entry.entity';

describe('DeadLetterController', () => {
  let controller: DeadLetterController;
  let service: jest.Mocked<DeadLetterService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [DeadLetterController],
      providers: [
        {
          provide: DeadLetterService,
          useValue: { list: jest.fn(), retry: jest.fn() },
        },
      ],
    }).compile();

    controller = module.get<DeadLetterController>(DeadLetterController);
    service = module.get(DeadLetterService);
  });

  it('GET / lists entries as views', async () => {
    const entry = DeadLetterQueueEntry.create({
      channelId: '-1001',
      messageId: 9,
      failureReason: 'boom',
    });
    service.list.mockResolvedValue([entry]);

    const views = await controller.list({});

    expect(service.list).toHaveBeenCalledWith(50);
    expect(views).toHaveLength(1);
    expect(views[0]).toEqual(toDeadLetterView(entry));
  });

  it('POST /:id/retry re-enqueues and returns the RETRIED view', async () => {
    const entry = DeadLetterQueueEntry.create({
      channelId: '-1001',
      messageId: 9,
      failureReason: 'boom',
    });
    entry.markRetried();
    service.retry.mockResolvedValue(entry);

    const view = await controller.retry(entry.id);

    expect(service.retry).toHaveBeenCalledWith(entry.id);
    expect(view.status).toBe('RETRIED');
  });

  it('POST /:id/retry with unknown id propagates 404', async () => {
    service.retry.mockRejectedValue(
      new NotFoundException('Dead-letter entry missing not found'),
    );
    await expect(controller.retry('missing')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
