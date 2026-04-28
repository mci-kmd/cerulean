import { useMemo } from "react";
import { useLiveQuery } from "@tanstack/react-db";
import { useBoardCollections } from "@/db/use-board-collections";
import {
  DEFAULT_LAUNCHER_RESOURCE_TYPES,
  type LauncherResource,
  type LauncherResourceType,
} from "@/types/resources";

function sortByOrder<T extends { order: number; name: string }>(items: readonly T[]) {
  return [...items].sort((left, right) => {
    if (left.order !== right.order) {
      return left.order - right.order;
    }
    return left.name.localeCompare(right.name);
  });
}

export interface LauncherResourceTypesState {
  storedTypes: LauncherResourceType[];
  types: LauncherResourceType[];
  usesDefaults: boolean;
}

export function useLauncherResources(): LauncherResource[] {
  const { launcherResources } = useBoardCollections();
  const result = useLiveQuery(launcherResources);

  return useMemo(() => sortByOrder(result.data), [result.data]);
}

export function useLauncherResourceTypes(): LauncherResourceTypesState {
  const { resourceTypes } = useBoardCollections();
  const result = useLiveQuery(resourceTypes);

  const storedTypes = useMemo(() => sortByOrder(result.data), [result.data]);

  return useMemo(
    () => ({
      storedTypes,
      types: storedTypes.length > 0 ? storedTypes : DEFAULT_LAUNCHER_RESOURCE_TYPES,
      usesDefaults: storedTypes.length === 0,
    }),
    [storedTypes],
  );
}
