export interface ChangeDetectionResult {
  added: number[];
  removed: number[];
  changed: number[];
  unchanged: number[];
}

export function detectChanges(
  cached: Map<number, { rev: number }>,
  fresh: { id: number; rev: number }[],
): ChangeDetectionResult {
  const freshMap = new Map(fresh.map((f) => [f.id, f.rev]));
  const cachedIds = new Set(cached.keys());
  const freshIds = new Set(freshMap.keys());

  const added: number[] = [];
  const removed: number[] = [];
  const changed: number[] = [];
  const unchanged: number[] = [];

  for (const id of freshIds) {
    if (!cachedIds.has(id)) {
      added.push(id);
    } else {
      const cachedRev = cached.get(id)!.rev;
      const freshRev = freshMap.get(id)!;
      if (freshRev > cachedRev) {
        changed.push(id);
      } else {
        unchanged.push(id);
      }
    }
  }

  for (const id of cachedIds) {
    if (!freshIds.has(id)) {
      removed.push(id);
    }
  }

  return { added, removed, changed, unchanged };
}
