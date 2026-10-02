import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { placeholdersFor } from '@/placeholders/domain/placeholder-registry';
import { InMemoryMessageTemplateRepository } from '@/templates/infrastructure/persistence/in-memory/in-memory-message-template.repository';
import { MessageTemplatesController } from './message-templates.controller';

const statusOf = async (run: () => Promise<unknown>): Promise<number> => {
  try {
    await run();
  } catch (error) {
    const status = (error as { getStatus?: () => number }).getStatus;
    if (typeof status === 'function') {
      return (error as { getStatus: () => number }).getStatus();
    }
    throw error;
  }
  throw new Error('expected the call to throw');
};

const responseOf = async (run: () => Promise<unknown>): Promise<unknown> => {
  try {
    await run();
  } catch (error) {
    return (error as { getResponse: () => unknown }).getResponse();
  }
  throw new Error('expected the call to throw');
};

describe('MessageTemplatesController (todo 6 templates API)', () => {
  const setup = (): MessageTemplatesController => {
    const repo = new InMemoryMessageTemplateRepository();
    // No DataSource injected → in-memory (single-threaded) activate path.
    return new MessageTemplatesController(repo);
  };

  it('POST creates → 201 {id,command,name,isActive:false,version:1}', async () => {
    const controller = setup();
    const created = await controller.create({
      command: 'ca',
      name: 'full-dexter-v1',
      bodyMarkdown: '{{chainDisplay}} ${{symbol}}',
    });
    expect(created.id).toEqual(expect.any(String));
    expect(created.command).toBe('ca');
    expect(created.name).toBe('full-dexter-v1');
    expect(created.isActive).toBe(false);
    expect(created.version).toBe(1);
  });

  it('GET lists ASC createdAt + filters ?command=ca', async () => {
    const controller = setup();
    await controller.create({
      command: 'ca',
      name: 'a-v1',
      bodyMarkdown: 'price {{priceUsd}}',
    });
    await controller.create({
      command: 'x',
      name: 'b-v1',
      bodyMarkdown: 'price {{priceUsd}}',
    });
    const all = await controller.list();
    expect(all).toHaveLength(2);
    const ca = await controller.list('ca');
    expect(ca).toHaveLength(1);
    expect(ca[0].command).toBe('ca');
  });

  it('GET ?command=start → 400 with the valid list', async () => {
    const controller = setup();
    await expect(controller.list('start')).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(await statusOf(() => controller.list('start'))).toBe(400);
    const body = (await responseOf(() => controller.list('start'))) as {
      error: string;
      valid: string[];
    };
    expect(body.valid).toContain('ca');
    expect(body.valid).toContain('bare');
  });

  it('GET /:id returns the row; unknown id → 404', async () => {
    const controller = setup();
    const created = await controller.create({
      command: 'ca',
      name: 'a-v1',
      bodyMarkdown: 'hi {{symbol}}',
    });
    const found = await controller.get(created.id);
    expect(found.id).toBe(created.id);
    await expect(controller.get('missing-id')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(await statusOf(() => controller.get('missing-id'))).toBe(404);
  });

  it('POST {{precio}} → 400 with the valid list', async () => {
    const controller = setup();
    await expect(
      controller.create({
        command: 'ca',
        name: 'bad-v1',
        bodyMarkdown: 'precio {{precio}}',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(
      await statusOf(() =>
        controller.create({
          command: 'ca',
          name: 'bad-v1',
          bodyMarkdown: 'precio {{precio}}',
        }),
      ),
    ).toBe(400);
    const body = (await responseOf(() =>
      controller.create({
        command: 'ca',
        name: 'bad-v1',
        bodyMarkdown: 'precio {{precio}}',
      }),
    )) as { error: string; valid: string[] };
    expect(body.valid).toEqual(placeholdersFor('ca'));
    expect(body.valid).toContain('symbol');
  });

  it('POST {{timeframe}} outside c/cc → 400 (chart-only key)', async () => {
    const controller = setup();
    await expect(
      controller.create({
        command: 'ca',
        name: 'tf-v1',
        bodyMarkdown: 'chart {{timeframe}}',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    const ok = await controller.create({
      command: 'c',
      name: 'chart-v1',
      bodyMarkdown: 'chart {{timeframe}}: {{dexscreenerUrl}}',
    });
    expect(ok.command).toBe('c');
  });

  it('POST duplicate (command,name) → 409', async () => {
    const controller = setup();
    await controller.create({
      command: 'ca',
      name: 'dup-v1',
      bodyMarkdown: 'hi {{symbol}}',
    });
    await expect(
      controller.create({
        command: 'ca',
        name: 'dup-v1',
        bodyMarkdown: 'other {{symbol}}',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(
      await statusOf(() =>
        controller.create({
          command: 'ca',
          name: 'dup-v1',
          bodyMarkdown: 'other {{symbol}}',
        }),
      ),
    ).toBe(409);
  });

  it('PATCH renames + updates body with version++ per change', async () => {
    const controller = setup();
    const created = await controller.create({
      command: 'ca',
      name: 'a-v1',
      bodyMarkdown: 'hi {{symbol}}',
    });
    expect(created.version).toBe(1);
    const renamed = await controller.update(created.id, { name: 'a-v2' });
    expect(renamed.name).toBe('a-v2');
    expect(renamed.version).toBe(2);
    const rebodied = await controller.update(created.id, {
      bodyMarkdown: 'yo {{symbol}} {{priceUsd}}',
    });
    expect(rebodied.bodyMarkdown).toContain('{{priceUsd}}');
    expect(rebodied.version).toBe(3);
  });

  it('PATCH unknown placeholder in body → 400; PATCH command → 400 immutable', async () => {
    const controller = setup();
    const created = await controller.create({
      command: 'ca',
      name: 'a-v1',
      bodyMarkdown: 'hi {{symbol}}',
    });
    await expect(
      controller.update(created.id, { bodyMarkdown: '{{precio}}' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      controller.update(created.id, { command: 'x' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(
      await statusOf(() => controller.update(created.id, { command: 'x' })),
    ).toBe(400);
  });

  it('PATCH duplicate rename → 409; PATCH unknown id → 404', async () => {
    const controller = setup();
    await controller.create({
      command: 'ca',
      name: 'a-v1',
      bodyMarkdown: 'hi {{symbol}}',
    });
    const second = await controller.create({
      command: 'ca',
      name: 'b-v1',
      bodyMarkdown: 'hi {{symbol}}',
    });
    await expect(
      controller.update(second.id, { name: 'a-v1' }),
    ).rejects.toBeInstanceOf(ConflictException);
    await expect(
      controller.update('missing-id', { name: 'z' }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('POST /:id/activate switches active + version++ (activate + bumpVersion composed)', async () => {
    const controller = setup();
    const first = await controller.create({
      command: 'ca',
      name: 'a-v1',
      bodyMarkdown: 'hi {{symbol}}',
    });
    const second = await controller.create({
      command: 'ca',
      name: 'b-v1',
      bodyMarkdown: 'yo {{symbol}}',
    });
    const active1 = await controller.activate(first.id);
    expect(active1.isActive).toBe(true);
    expect(active1.version).toBe(2);
    const active2 = await controller.activate(second.id);
    expect(active2.isActive).toBe(true);
    expect(active2.version).toBe(2);
    const prev = await controller.get(first.id);
    expect(prev.isActive).toBe(false);
    const ca = await controller.list('ca');
    expect(ca.filter((t) => t.isActive)).toHaveLength(1);
  });

  it('POST /:id/activate unknown id → 404', async () => {
    const controller = setup();
    await expect(controller.activate('missing-id')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(await statusOf(() => controller.activate('missing-id'))).toBe(404);
  });

  it('DELETE active → 409', async () => {
    const controller = setup();
    const first = await controller.create({
      command: 'ca',
      name: 'a-v1',
      bodyMarkdown: 'hi {{symbol}}',
    });
    await controller.create({
      command: 'ca',
      name: 'b-v1',
      bodyMarkdown: 'yo {{symbol}}',
    });
    await controller.activate(first.id);
    await expect(controller.remove(first.id)).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(await statusOf(() => controller.remove(first.id))).toBe(409);
  });

  it('DELETE last template of the command → 409', async () => {
    const controller = setup();
    const only = await controller.create({
      command: 'z',
      name: 'compact-v1',
      bodyMarkdown: 'hi {{symbol}}',
    });
    await expect(controller.remove(only.id)).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(await statusOf(() => controller.remove(only.id))).toBe(409);
  });

  it('DELETE inactive non-last → 204 (later GET → 404)', async () => {
    const controller = setup();
    const first = await controller.create({
      command: 'ca',
      name: 'a-v1',
      bodyMarkdown: 'hi {{symbol}}',
    });
    const second = await controller.create({
      command: 'ca',
      name: 'b-v1',
      bodyMarkdown: 'yo {{symbol}}',
    });
    await controller.remove(second.id);
    expect(await controller.list('ca')).toHaveLength(1);
    await expect(controller.get(second.id)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(first.id).toEqual(expect.any(String));
  });

  it('DELETE unknown id → 404', async () => {
    const controller = setup();
    await expect(controller.remove('missing-id')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
