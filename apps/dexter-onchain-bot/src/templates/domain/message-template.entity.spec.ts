import { MessageTemplate } from '@/templates/domain/message-template.entity';
import {
  MAX_BODY_LENGTH,
  MAX_NAME_LENGTH,
  MessageTemplateValidationError,
  validateBodyMarkdown,
  validateCommand,
  validateName,
  validateVersion,
} from '@/templates/domain/message-template.validators';

const BODY = '{{chainEmoji}} *${{symbol}}* \\| {{name}}';

const VALID_COMMANDS = ['ca', 'x', 'z', 'c', 'cc', 'bare'] as const;

describe('message-template entity (todo 2 domain)', () => {
  it('creates with defaults (uuid id, inactive, version 1)', () => {
    const template = MessageTemplate.create({
      command: 'ca',
      name: 'full-dexter-v1',
      bodyMarkdown: BODY,
    });

    expect(template.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );
    expect(template.command).toBe('ca');
    expect(template.name).toBe('full-dexter-v1');
    expect(template.bodyMarkdown).toBe(BODY);
    expect(template.isActive).toBe(false);
    expect(template.version).toBe(1);
    expect(template.createdAt).toBeInstanceOf(Date);
    expect(template.updatedAt).toBeInstanceOf(Date);
  });

  it('creates with explicit id + active flag', () => {
    const template = MessageTemplate.create({
      id: '11111111-1111-4111-8111-111111111111',
      command: 'bare',
      name: 'bare-ca-v1',
      bodyMarkdown: BODY,
      isActive: true,
    });

    expect(template.id).toBe('11111111-1111-4111-8111-111111111111');
    expect(template.isActive).toBe(true);
  });

  it('accepts every closed command', () => {
    for (const command of VALID_COMMANDS) {
      const template = MessageTemplate.create({
        command,
        name: `tpl-${command}`,
        bodyMarkdown: BODY,
      });
      expect(template.command).toBe(command);
    }
  });

  it.each([
    ['start', 'v1 enum excludes start'],
    ['help', 'v1 enum excludes help'],
    ['settings', 'v1 enum excludes settings'],
    ['tb', 'v1 enum excludes tb'],
    ['', 'empty command'],
    ['CA', 'case-sensitive (upper rejected)'],
    [undefined, 'missing command'],
    [null, 'null command'],
    [42, 'non-string command'],
  ])('rejects out-of-enum command %p (%s)', (command: unknown, _why: string) => {
    expect(() =>
      MessageTemplate.create({
        command: command as never,
        name: 'tpl',
        bodyMarkdown: BODY,
      }),
    ).toThrow(MessageTemplateValidationError);
  });

  it.each([
    ['', 'empty name'],
    ['   ', 'whitespace-only name'],
    ['\t\n ', 'blank control chars'],
    ['x'.repeat(MAX_NAME_LENGTH + 1), 'name over 100 chars'],
    [undefined, 'missing name'],
    [null, 'null name'],
    [42, 'non-string name'],
  ])('rejects invalid name %p (%s)', (name: unknown, _why: string) => {
    expect(() =>
      MessageTemplate.create({
        command: 'ca',
        name: name as never,
        bodyMarkdown: BODY,
      }),
    ).toThrow(MessageTemplateValidationError);
  });

  it.each([
    ['', 'empty body'],
    ['x'.repeat(MAX_BODY_LENGTH + 1), 'body of 4001 chars'],
    [undefined, 'missing body'],
    [null, 'null body'],
    [42, 'non-string body'],
  ])('rejects invalid body %p (%s)', (body: unknown, _why: string) => {
    expect(() =>
      MessageTemplate.create({
        command: 'ca',
        name: 'tpl',
        bodyMarkdown: body as never,
      }),
    ).toThrow(MessageTemplateValidationError);
  });

  it('accepts boundary lengths (name 100, body 4000)', () => {
    const template = MessageTemplate.create({
      command: 'z',
      name: 'n'.repeat(MAX_NAME_LENGTH),
      bodyMarkdown: 'b'.repeat(MAX_BODY_LENGTH),
    });
    expect(template.name).toHaveLength(100);
    expect(template.bodyMarkdown).toHaveLength(4000);
  });

  it('trims the name but stores body verbatim', () => {
    const template = MessageTemplate.create({
      command: 'ca',
      name: '  spaced  ',
      bodyMarkdown: '  $raw body  ',
    });
    expect(template.name).toBe('spaced');
    expect(template.bodyMarkdown).toBe('  $raw body  ');
  });

  it('keeps `$` raw in body (`$` is NOT MarkdownV2-escaped)', () => {
    const template = MessageTemplate.create({
      command: 'x',
      name: 'dollar',
      bodyMarkdown: 'price $164.32 for ${{symbol}}',
    });
    expect(template.bodyMarkdown).toBe('price $164.32 for ${{symbol}}');
  });

  it('activates and deactivates without touching version', () => {
    const template = MessageTemplate.create({
      command: 'c',
      name: 'chart-v1',
      bodyMarkdown: BODY,
    });

    template.activate();
    expect(template.isActive).toBe(true);
    expect(template.version).toBe(1);

    template.deactivate();
    expect(template.isActive).toBe(false);
    expect(template.version).toBe(1);
  });

  it('renames (trimmed) and bumps version', () => {
    const template = MessageTemplate.create({
      command: 'cc',
      name: 'chart-only-v1',
      bodyMarkdown: BODY,
    });

    template.rename('  chart-only-v2  ');
    expect(template.name).toBe('chart-only-v2');
    expect(template.version).toBe(2);

    expect(() => template.rename('')).toThrow(MessageTemplateValidationError);
    expect(template.version).toBe(2);
  });

  it('updates body and bumps version', () => {
    const template = MessageTemplate.create({
      command: 'ca',
      name: 'full',
      bodyMarkdown: BODY,
    });

    template.updateBody('new {{symbol}} body');
    expect(template.bodyMarkdown).toBe('new {{symbol}} body');
    expect(template.version).toBe(2);

    expect(() => template.updateBody('x'.repeat(4001))).toThrow(
      MessageTemplateValidationError,
    );
    expect(template.version).toBe(2);
  });

  it('bumpVersion increments explicitly', () => {
    const template = MessageTemplate.create({
      command: 'z',
      name: 'compact-v1',
      bodyMarkdown: BODY,
    });
    template.bumpVersion();
    expect(template.version).toBe(2);
    template.bumpVersion();
    expect(template.version).toBe(3);
  });

  it('reconstitute roundtrips every field without revalidation', () => {
    const created = MessageTemplate.create({
      id: '22222222-2222-4222-8222-222222222222',
      command: 'x',
      name: 'full-dexter-v1',
      bodyMarkdown: BODY,
      isActive: true,
    });
    created.rename('renamed');
    const snapshot = {
      id: created.id,
      command: created.command,
      name: created.name,
      bodyMarkdown: created.bodyMarkdown,
      isActive: created.isActive,
      version: created.version,
      createdAt: created.createdAt,
      updatedAt: created.updatedAt,
    };

    const restored = MessageTemplate.reconstitute(snapshot);
    expect(restored.id).toBe(snapshot.id);
    expect(restored.command).toBe('x');
    expect(restored.name).toBe('renamed');
    expect(restored.bodyMarkdown).toBe(BODY);
    expect(restored.isActive).toBe(true);
    expect(restored.version).toBe(2);
    expect(restored.createdAt).toEqual(snapshot.createdAt);
    expect(restored.updatedAt).toEqual(snapshot.updatedAt);
  });
});

describe('message-template validators (100% branch cover)', () => {
  it.each([
    [undefined, 'global-less commands reject undefined'],
    [null, 'null'],
    [123, 'number'],
    [{}, 'object'],
    ['start', 'out-of-enum string'],
  ])('validateCommand rejects %p (%s)', (raw: unknown, _why: string) => {
    expect(() => validateCommand(raw)).toThrow(
      MessageTemplateValidationError,
    );
  });

  it.each([...VALID_COMMANDS])('validateCommand accepts %p', (command) => {
    expect(validateCommand(command)).toBe(command);
  });

  it.each([
    [undefined, 'missing'],
    [null, 'null'],
    [7, 'number'],
    ['', 'empty'],
    ['   ', 'blank'],
  ])('validateName rejects %p (%s)', (raw: unknown, _why: string) => {
    expect(() => validateName(raw)).toThrow(MessageTemplateValidationError);
  });

  it('validateName rejects oversize with length details', () => {
    try {
      validateName('y'.repeat(101));
      fail('expected oversize name to throw');
    } catch (error) {
      expect(error).toBeInstanceOf(MessageTemplateValidationError);
      expect(
        (error as MessageTemplateValidationError).details,
      ).toMatchObject({ length: 101, max: 100 });
    }
  });

  it.each([
    [undefined, 'missing'],
    [null, 'null'],
    [7, 'number'],
    ['', 'empty'],
  ])('validateBodyMarkdown rejects %p (%s)', (raw: unknown, _why: string) => {
    expect(() => validateBodyMarkdown(raw)).toThrow(
      MessageTemplateValidationError,
    );
  });

  it('validateBodyMarkdown rejects oversize with length details', () => {
    try {
      validateBodyMarkdown('z'.repeat(4001));
      fail('expected oversize body to throw');
    } catch (error) {
      expect(error).toBeInstanceOf(MessageTemplateValidationError);
      expect(
        (error as MessageTemplateValidationError).details,
      ).toMatchObject({ length: 4001, max: 4000 });
    }
  });

  it.each([[1], [2], [99]])('validateVersion accepts %p', (raw) => {
    expect(validateVersion(raw)).toBe(raw);
  });

  it.each([
    [0, 'zero'],
    [-1, 'negative'],
    [1.5, 'non-integer'],
    [Number.NaN, 'NaN'],
    [Number.POSITIVE_INFINITY, 'infinite'],
    ['1', 'string'],
    [undefined, 'missing'],
    [null, 'null'],
  ])('validateVersion rejects %p (%s)', (raw: unknown, _why: string) => {
    expect(() => validateVersion(raw)).toThrow(MessageTemplateValidationError);
  });

  it('validation error carries code + name', () => {
    try {
      validateName('');
      fail('expected empty name to throw');
    } catch (error) {
      const typed = error as MessageTemplateValidationError;
      expect(typed).toBeInstanceOf(Error);
      expect(typed.code).toBe('MESSAGE_TEMPLATE_VALIDATION');
      expect(typed.name).toBe('MessageTemplateValidationError');
    }
  });
});
