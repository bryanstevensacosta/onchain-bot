import {
  groupByAndGroupId,
  allGroupMembersMatch,
} from './compound-group.evaluator';
import { Keyword } from '../../domain/keyword.entity';

describe('compound-group evaluator', () => {
  it('separates simple rows from AND-groups', () => {
    const a = Keyword.create({ phrase: 'ETF', matchMode: 'substring' });
    const g = 'group-1';
    const b = Keyword.create({
      phrase: 'inflow',
      matchMode: 'substring',
      andGroupId: g,
    });
    const c = Keyword.create({
      phrase: 'blackrock',
      matchMode: 'substring',
      andGroupId: g,
    });
    const { simples, compounds } = groupByAndGroupId([a, b, c]);
    expect(simples).toEqual([a]);
    expect(compounds.get(g)).toEqual([b, c]);
  });

  it('AND-group matches only when every member matches', () => {
    const g = 'group-1';
    const members = [
      Keyword.create({
        phrase: 'etf',
        matchMode: 'substring',
        andGroupId: g,
      }),
      Keyword.create({
        phrase: 'inflow',
        matchMode: 'substring',
        andGroupId: g,
      }),
    ];
    expect(
      allGroupMembersMatch(members, 'etf inflow record', (kw, text) =>
        kw.matches(text),
      ),
    ).toBe(true);
    expect(
      allGroupMembersMatch(members, 'etf outflow record', (kw, text) =>
        kw.matches(text),
      ),
    ).toBe(false);
  });
});
