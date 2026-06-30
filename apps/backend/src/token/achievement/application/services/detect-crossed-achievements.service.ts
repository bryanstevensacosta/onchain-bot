export interface DetectCrossedInput {
  athMultiple: number | null;
  enabledThresholds: ReadonlyArray<{ multiple: number }>;
  alreadyNotified: ReadonlySet<number>;
}

export interface DetectCrossedResult {
  crossed: ReadonlyArray<{ multiple: number }>;
}

export class DetectCrossedAchievementsService {
  detect(input: DetectCrossedInput): DetectCrossedResult {
    const { athMultiple, enabledThresholds, alreadyNotified } = input;
    if (
      athMultiple === null ||
      athMultiple === undefined ||
      !Number.isFinite(athMultiple) ||
      athMultiple <= 0
    ) {
      return { crossed: [] };
    }

    const seen = new Set<number>();
    const crossed: { multiple: number }[] = [];
    for (const t of enabledThresholds) {
      if (
        t.multiple <= athMultiple &&
        !alreadyNotified.has(t.multiple) &&
        !seen.has(t.multiple)
      ) {
        seen.add(t.multiple);
        crossed.push({ multiple: t.multiple });
      }
    }

    crossed.sort((a, b) => a.multiple - b.multiple);
    return { crossed };
  }
}
