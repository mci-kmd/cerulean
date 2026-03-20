export function normalizeAdoTag(tag: string): string {
  return tag.trim().toLowerCase();
}

export function parseAdoTags(rawTags: unknown): string[] {
  if (typeof rawTags !== "string") {
    return [];
  }

  const seen = new Set<string>();
  const tags: string[] = [];

  for (const part of rawTags.split(";")) {
    const tag = part.trim();
    const normalized = normalizeAdoTag(tag);
    if (!normalized || seen.has(normalized)) {
      continue;
    }

    seen.add(normalized);
    tags.push(tag);
  }

  return tags;
}

export function hasAdoTag(tags: readonly string[], targetTag: string): boolean {
  const normalizedTarget = normalizeAdoTag(targetTag);
  if (!normalizedTarget) {
    return false;
  }

  return tags.some((tag) => normalizeAdoTag(tag) === normalizedTarget);
}

export function addAdoTags(tags: readonly string[], tagsToAdd: readonly string[]): string[] {
  const nextTags = [...tags];
  const seen = new Set(nextTags.map(normalizeAdoTag));

  for (const candidate of tagsToAdd) {
    const tag = candidate.trim();
    const normalized = normalizeAdoTag(tag);
    if (!normalized || seen.has(normalized)) {
      continue;
    }

    seen.add(normalized);
    nextTags.push(tag);
  }

  return nextTags;
}

export function removeAdoTags(tags: readonly string[], tagsToRemove: readonly string[]): string[] {
  const removals = new Set(
    tagsToRemove.map((tag) => normalizeAdoTag(tag)).filter(Boolean),
  );
  if (removals.size === 0) {
    return [...tags];
  }

  return tags.filter((tag) => !removals.has(normalizeAdoTag(tag)));
}

export function stringifyAdoTags(tags: readonly string[]): string {
  return tags.join("; ");
}
