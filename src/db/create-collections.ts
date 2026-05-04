import {
  createCollection,
  localStorageCollectionOptions,
  localOnlyCollectionOptions,
} from "@tanstack/db";
import type { Collection, NonSingleResult } from "@tanstack/db";
import type {
  AdoSettings,
  BoardColumn,
  ColumnAssignment,
  CustomTask,
  WorkItemChecklistItem,
} from "@/types/board";
import type { DemoChecklistItem, DemoOrderItem } from "@/types/demo";
import type { LauncherResource, LauncherResourceType } from "@/types/resources";

export type AppCollection<T extends object, TKey extends string | number> =
  Collection<T, TKey> & NonSingleResult;

export interface BoardCollections {
  settings: AppCollection<AdoSettings, string>;
  columns: AppCollection<BoardColumn, string>;
  assignments: AppCollection<ColumnAssignment, string>;
  boardChecklist: AppCollection<WorkItemChecklistItem, string>;
  demoChecklist: AppCollection<DemoChecklistItem, string>;
  demoOrder: AppCollection<DemoOrderItem, string>;
  customTasks: AppCollection<CustomTask, string>;
  resourceTypes: AppCollection<LauncherResourceType, string>;
  launcherResources: AppCollection<LauncherResource, string>;
}

function createSettingsCollection(inMemory: boolean): AppCollection<AdoSettings, string> {
  if (inMemory) {
    return createCollection(
      localOnlyCollectionOptions<AdoSettings, string>({
        getKey: (item: AdoSettings) => item.id,
      }),
    );
  }
  return createCollection(
    localStorageCollectionOptions<AdoSettings, string>({
      getKey: (item: AdoSettings) => item.id,
      storageKey: "cerulean-settings",
    }),
  );
}

function createColumnsCollection(inMemory: boolean): AppCollection<BoardColumn, string> {
  if (inMemory) {
    return createCollection(
      localOnlyCollectionOptions<BoardColumn, string>({
        getKey: (item: BoardColumn) => item.id,
      }),
    );
  }
  return createCollection(
    localStorageCollectionOptions<BoardColumn, string>({
      getKey: (item: BoardColumn) => item.id,
      storageKey: "cerulean-columns",
    }),
  );
}

function createAssignmentsCollection(inMemory: boolean): AppCollection<ColumnAssignment, string> {
  if (inMemory) {
    return createCollection(
      localOnlyCollectionOptions<ColumnAssignment, string>({
        getKey: (item: ColumnAssignment) => item.id,
      }),
    );
  }
  return createCollection(
    localStorageCollectionOptions<ColumnAssignment, string>({
      getKey: (item: ColumnAssignment) => item.id,
      storageKey: "cerulean-assignments",
    }),
  );
}

function createBoardChecklistCollection(
  inMemory: boolean,
): AppCollection<WorkItemChecklistItem, string> {
  if (inMemory) {
    return createCollection(
      localOnlyCollectionOptions<WorkItemChecklistItem, string>({
        getKey: (item: WorkItemChecklistItem) => item.id,
      }),
    );
  }
  return createCollection(
    localStorageCollectionOptions<WorkItemChecklistItem, string>({
      getKey: (item: WorkItemChecklistItem) => item.id,
      storageKey: "cerulean-board-checklist",
    }),
  );
}

function createDemoChecklistCollection(inMemory: boolean): AppCollection<DemoChecklistItem, string> {
  if (inMemory) {
    return createCollection(
      localOnlyCollectionOptions<DemoChecklistItem, string>({
        getKey: (item: DemoChecklistItem) => item.id,
      }),
    );
  }
  return createCollection(
    localStorageCollectionOptions<DemoChecklistItem, string>({
      getKey: (item: DemoChecklistItem) => item.id,
      storageKey: "cerulean-demo-checklist",
    }),
  );
}

function createDemoOrderCollection(inMemory: boolean): AppCollection<DemoOrderItem, string> {
  if (inMemory) {
    return createCollection(
      localOnlyCollectionOptions<DemoOrderItem, string>({
        getKey: (item: DemoOrderItem) => item.id,
      }),
    );
  }
  return createCollection(
    localStorageCollectionOptions<DemoOrderItem, string>({
      getKey: (item: DemoOrderItem) => item.id,
      storageKey: "cerulean-demo-order",
    }),
  );
}

function createCustomTasksCollection(inMemory: boolean): AppCollection<CustomTask, string> {
  if (inMemory) {
    return createCollection(
      localOnlyCollectionOptions<CustomTask, string>({
        getKey: (item: CustomTask) => item.id,
      }),
    );
  }
  return createCollection(
    localStorageCollectionOptions<CustomTask, string>({
      getKey: (item: CustomTask) => item.id,
      storageKey: "cerulean-custom-tasks",
    }),
  );
}

function createResourceTypesCollection(
  inMemory: boolean,
): AppCollection<LauncherResourceType, string> {
  if (inMemory) {
    return createCollection(
      localOnlyCollectionOptions<LauncherResourceType, string>({
        getKey: (item: LauncherResourceType) => item.id,
      }),
    );
  }
  return createCollection(
    localStorageCollectionOptions<LauncherResourceType, string>({
      getKey: (item: LauncherResourceType) => item.id,
      storageKey: "cerulean-launcher-resource-types",
    }),
  );
}

function createLauncherResourcesCollection(
  inMemory: boolean,
): AppCollection<LauncherResource, string> {
  if (inMemory) {
    return createCollection(
      localOnlyCollectionOptions<LauncherResource, string>({
        getKey: (item: LauncherResource) => item.id,
      }),
    );
  }
  return createCollection(
    localStorageCollectionOptions<LauncherResource, string>({
      getKey: (item: LauncherResource) => item.id,
      storageKey: "cerulean-launcher-resources",
    }),
  );
}

export function createBoardCollections(inMemory = false): BoardCollections {
  return {
    settings: createSettingsCollection(inMemory),
    columns: createColumnsCollection(inMemory),
    assignments: createAssignmentsCollection(inMemory),
    boardChecklist: createBoardChecklistCollection(inMemory),
    demoChecklist: createDemoChecklistCollection(inMemory),
    demoOrder: createDemoOrderCollection(inMemory),
    customTasks: createCustomTasksCollection(inMemory),
    resourceTypes: createResourceTypesCollection(inMemory),
    launcherResources: createLauncherResourcesCollection(inMemory),
  };
}
