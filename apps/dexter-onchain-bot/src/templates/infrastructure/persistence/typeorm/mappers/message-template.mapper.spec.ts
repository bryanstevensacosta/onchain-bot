import { MessageTemplate } from '@/templates/domain/message-template.entity';
import { MessageTemplateOrmEntity } from '@/templates/infrastructure/persistence/typeorm/message-template.orm-entity';
import {
  toDomain,
  toMessageTemplateDomain,
  toMessageTemplateRow,
  toRow,
} from '@/templates/infrastructure/persistence/typeorm/mappers/message-template.mapper';

describe('message-template mapper roundtrip (todo 3)', () => {
  const makeDomain = (): MessageTemplate =>
    MessageTemplate.create({
      command: 'ca',
      name: 'full-dexter-v1',
      bodyMarkdown: '{{chainEmoji}} ${{symbol}} | {{name}}',
      isActive: true,
    });

  it('toRow maps every field onto the orm-entity shape', () => {
    const domain = makeDomain();
    const row = toMessageTemplateRow(domain);
    expect(row).toBeInstanceOf(MessageTemplateOrmEntity);
    expect(row.id).toBe(domain.id);
    expect(row.command).toBe('ca');
    expect(row.name).toBe('full-dexter-v1');
    expect(row.bodyMarkdown).toBe('{{chainEmoji}} ${{symbol}} | {{name}}');
    expect(row.isActive).toBe(true);
    expect(row.version).toBe(1);
    expect(row.createdAt).toBe(domain.createdAt);
    expect(row.updatedAt).toBe(domain.updatedAt);
  });

  it('toDomain reconstitutes the aggregate without validation loss', () => {
    const row = toMessageTemplateRow(makeDomain());
    const back = toMessageTemplateDomain(row);
    expect(back.id).toBe(row.id);
    expect(back.command).toBe(row.command);
    expect(back.name).toBe(row.name);
    expect(back.bodyMarkdown).toBe(row.bodyMarkdown);
    expect(back.isActive).toBe(row.isActive);
    expect(back.version).toBe(row.version);
    expect(back.createdAt).toEqual(row.createdAt);
    expect(back.updatedAt).toEqual(row.updatedAt);
  });

  it('roundtrip is lossless incl. verbatim body whitespace + $ passthrough', () => {
    const body = '  padded\n\n$164.32 {{symbol}}  ';
    const domain = MessageTemplate.create({
      command: 'x',
      name: 'spaced',
      bodyMarkdown: body,
    });
    const back = toMessageTemplateDomain(toMessageTemplateRow(domain));
    expect(back.bodyMarkdown).toBe(body);
    expect(back.name).toBe('spaced');
  });

  it('roundtrip preserves version/timestamps after mutations', () => {
    const domain = makeDomain();
    domain.rename('renamed');
    domain.updateBody('new {{symbol}} body');
    domain.deactivate();
    const back = toMessageTemplateDomain(toMessageTemplateRow(domain));
    expect(back.version).toBe(3);
    expect(back.name).toBe('renamed');
    expect(back.bodyMarkdown).toBe('new {{symbol}} body');
    expect(back.isActive).toBe(false);
  });

  it('toRow/toDomain aliases resolve to the canonical mappers', () => {
    expect(toRow).toBe(toMessageTemplateRow);
    expect(toDomain).toBe(toMessageTemplateDomain);
  });
});
