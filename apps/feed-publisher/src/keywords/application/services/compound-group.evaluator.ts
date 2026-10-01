/**
 * Generic AND-group helpers shared by the allowed and blacklist matchers.
 *
 * Rows with `andGroupId === null` are simple (OR semantics). Rows sharing
 * a non-null `andGroupId` form one AND-group: every member must match for
 * the group to fire.
 */
export interface AndGroupMember {
  readonly andGroupId: string | null;
}

export function groupByAndGroupId<T extends AndGroupMember>(
  rows: readonly T[],
): { simples: T[]; compounds: Map<string, T[]> } {
  const simples: T[] = [];
  const compounds = new Map<string, T[]>();
  for (const row of rows) {
    if (row.andGroupId === null) {
      simples.push(row);
    } else {
      const group = compounds.get(row.andGroupId) ?? [];
      group.push(row);
      compounds.set(row.andGroupId, group);
    }
  }
  return { simples, compounds };
}

export function allGroupMembersMatch<T>(
  members: readonly T[],
  content: string,
  matches: (member: T, content: string) => boolean,
): boolean {
  return members.every((member) => matches(member, content));
}
