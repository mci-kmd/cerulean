export interface CandidateStateRule {
  state: string;
  includeTypes?: string[];
  excludeTypes?: string[];
}

function normalizeValue(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

export function parseWorkItemTypes(workItemTypes?: string): string[] {
  if (!workItemTypes) return [];
  return workItemTypes
    .split(",")
    .map((type) => type.trim())
    .filter(Boolean);
}

export function parseCandidateStatesByType(candidateStatesByType?: string): Map<string, string> {
  const entries = new Map<string, string>();
  if (!candidateStatesByType) return entries;

  for (const rawEntry of candidateStatesByType.split(/[\r\n;,]+/)) {
    const entry = rawEntry.trim();
    if (!entry) continue;

    const separatorIndex = entry.includes("=") ? entry.indexOf("=") : entry.indexOf(":");
    if (separatorIndex <= 0) continue;

    const type = entry.slice(0, separatorIndex).trim();
    const state = entry.slice(separatorIndex + 1).trim();
    if (!type || !state) continue;

    entries.set(type, state);
  }

  return entries;
}

export function hasCandidateStateConfiguration(
  candidateState?: string,
  candidateStatesByType?: string,
): boolean {
  return (
    normalizeValue(candidateState) !== undefined ||
    parseCandidateStatesByType(candidateStatesByType).size > 0
  );
}

export function getCandidateStateForType(
  workItemType: string,
  candidateState?: string,
  candidateStatesByType?: string,
): string | undefined {
  const override = parseCandidateStatesByType(candidateStatesByType).get(workItemType);
  return normalizeValue(override) ?? normalizeValue(candidateState);
}

export function isCandidateWorkItem(
  workItem: { type: string; state: string },
  candidateState?: string,
  candidateStatesByType?: string,
): boolean {
  const stateForType = getCandidateStateForType(
    workItem.type,
    candidateState,
    candidateStatesByType,
  );
  return stateForType !== undefined && workItem.state === stateForType;
}

export function buildCandidateStateRules(
  candidateState?: string,
  candidateStatesByType?: string,
  workItemTypes?: string,
): CandidateStateRule[] {
  const fallbackState = normalizeValue(candidateState);
  const allowedTypes = parseWorkItemTypes(workItemTypes);
  const hasAllowedTypes = allowedTypes.length > 0;
  const overrides = parseCandidateStatesByType(candidateStatesByType);
  const groupedOverrides = new Map<string, string[]>();
  const overriddenTypes = new Set<string>();

  for (const [type, state] of overrides.entries()) {
    if (hasAllowedTypes && !allowedTypes.includes(type)) continue;

    overriddenTypes.add(type);
    const typesForState = groupedOverrides.get(state) ?? [];
    typesForState.push(type);
    groupedOverrides.set(state, typesForState);
  }

  const rules: CandidateStateRule[] = [...groupedOverrides.entries()].map(([state, types]) => ({
    state,
    includeTypes: types,
  }));

  if (!fallbackState) return rules;

  if (hasAllowedTypes) {
    const remainingTypes = allowedTypes.filter((type) => !overriddenTypes.has(type));
    if (remainingTypes.length > 0) {
      rules.push({ state: fallbackState, includeTypes: remainingTypes });
    }
    return rules;
  }

  if (overriddenTypes.size > 0) {
    rules.push({ state: fallbackState, excludeTypes: [...overriddenTypes] });
    return rules;
  }

  rules.push({ state: fallbackState });
  return rules;
}
