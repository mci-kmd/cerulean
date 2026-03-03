import {
  createCollection,
  localStorageCollectionOptions,
  localOnlyCollectionOptions,
} from "@tanstack/db";
import type { AdoSettings, BoardColumn, ColumnAssignment } from "@/types/board";

// TanStack DB beta has complex generic types; use pragmatic typing
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AppCollection = any;

export interface BoardCollections {
  settings: AppCollection;
  columns: AppCollection;
  assignments: AppCollection;
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

export function createBoardCollections(inMemory = false): BoardCollections {
  return {
    settings: createSettingsCollection(inMemory),
    columns: createColumnsCollection(inMemory),
    assignments: createAssignmentsCollection(inMemory),
  };
}
