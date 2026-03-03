import {
  createCollection,
  localStorageCollectionOptions,
  localOnlyCollectionOptions,
} from "@tanstack/db";
import type { AdoSettings, BoardColumn, ColumnAssignment } from "@/types/board";
import type { DemoChecklistItem, DemoOrderItem } from "@/types/demo";

// TanStack DB beta has complex generic types; use pragmatic typing
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AppCollection = any;

export interface BoardCollections {
  settings: AppCollection;
  columns: AppCollection;
  assignments: AppCollection;
  demoChecklist: AppCollection;
  demoOrder: AppCollection;
}

function createSettingsCollection(inMemory: boolean) {
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

function createColumnsCollection(inMemory: boolean) {
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

function createAssignmentsCollection(inMemory: boolean) {
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

function createDemoChecklistCollection(inMemory: boolean) {
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

function createDemoOrderCollection(inMemory: boolean) {
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

export function createBoardCollections(inMemory = false): BoardCollections {
  return {
    settings: createSettingsCollection(inMemory),
    columns: createColumnsCollection(inMemory),
    assignments: createAssignmentsCollection(inMemory),
    demoChecklist: createDemoChecklistCollection(inMemory),
    demoOrder: createDemoOrderCollection(inMemory),
  };
}
