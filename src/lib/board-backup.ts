import type { BoardCollections } from "@/db/create-collections";
import { type AdoSettings, type BoardColumn, type ColumnAssignment, type CustomTask } from "@/types/board";
import type { DemoChecklistItem, DemoOrderItem } from "@/types/demo";
import {
  normalizeLauncherResource,
  type LauncherResource,
  type LauncherResourceChild,
  type LauncherResourceType,
} from "@/types/resources";

export const BOARD_BACKUP_FILENAME = "cerulean-backup.json";
export const BOARD_BACKUP_FORMAT = "cerulean-backup";
export const BOARD_BACKUP_VERSION = 1;

export interface BoardBackupData {
  format: typeof BOARD_BACKUP_FORMAT;
  version: typeof BOARD_BACKUP_VERSION;
  exportedAt: string;
  settings: AdoSettings;
  columns: BoardColumn[];
  assignments: ColumnAssignment[];
  demoChecklist: DemoChecklistItem[];
  demoOrder: DemoOrderItem[];
  customTasks: CustomTask[];
  resourceTypes: LauncherResourceType[];
  launcherResources: LauncherResource[];
}

type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function expectRecord(value: unknown, label: string): JsonRecord {
  if (!isRecord(value)) {
    throw new Error(`${label} is missing or invalid.`);
  }
  return value;
}

function expectArray(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value)) {
    throw new Error(`${label} is missing or invalid.`);
  }
  return value;
}

function expectOptionalArray(value: unknown, label: string): unknown[] {
  if (value === undefined) {
    return [];
  }
  return expectArray(value, label);
}

function expectString(record: JsonRecord, key: string, label: string): string {
  const value = record[key];
  if (typeof value !== "string") {
    throw new Error(`${label} is missing or invalid.`);
  }
  return value;
}

function expectNumber(record: JsonRecord, key: string, label: string): number {
  const value = record[key];
  if (typeof value !== "number" || Number.isNaN(value)) {
    throw new Error(`${label} is missing or invalid.`);
  }
  return value;
}

function expectOptionalString(record: JsonRecord, key: string, label: string): string | undefined {
  const value = record[key];
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== "string") {
    throw new Error(`${label} is invalid.`);
  }
  return value;
}

function expectOptionalBoolean(record: JsonRecord, key: string, label: string): boolean | undefined {
  const value = record[key];
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== "boolean") {
    throw new Error(`${label} is invalid.`);
  }
  return value;
}

function expectBoolean(record: JsonRecord, key: string, label: string): boolean {
  const value = record[key];
  if (typeof value !== "boolean") {
    throw new Error(`${label} is missing or invalid.`);
  }
  return value;
}

function cloneItems<T extends object>(items: readonly T[]) {
  return items.map((item) => ({ ...item }));
}

function parseSettings(value: unknown): AdoSettings {
  const record = expectRecord(value, "Settings");
  const id = expectString(record, "id", "Settings id");
  if (id !== "settings") {
    throw new Error("Settings id is invalid.");
  }

  return {
    id,
    pat: expectString(record, "pat", "Personal access token"),
    org: expectString(record, "org", "Organization"),
    project: expectString(record, "project", "Project"),
    team: expectString(record, "team", "Team"),
    githubUsername: expectString(record, "githubUsername", "GitHub username"),
    githubRepository: expectString(record, "githubRepository", "GitHub repository"),
    retroRepository: expectString(record, "retroRepository", "Retro repository"),
    retroBranch: expectString(record, "retroBranch", "Retro branch"),
    retroFolder: expectString(record, "retroFolder", "Retro folder"),
    retroFilenamePattern: expectString(record, "retroFilenamePattern", "Retro filename pattern"),
    sourceState: expectString(record, "sourceState", "Source state"),
    sourceBoardColumn: expectString(record, "sourceBoardColumn", "Active work board column"),
    candidateBoardColumn: expectString(record, "candidateBoardColumn", "New work board column"),
    approvalState: expectString(record, "approvalState", "Approval state"),
    approvalBoardColumn: expectString(record, "approvalBoardColumn", "Approval board column"),
    closedState: expectString(record, "closedState", "Closed state"),
    candidateState: expectString(record, "candidateState", "Candidate state"),
    candidateStatesByType: expectString(record, "candidateStatesByType", "Candidate states by type"),
    areaPath: expectString(record, "areaPath", "Area path"),
    workItemTypes: expectString(record, "workItemTypes", "Work item types"),
    uiReviewTag: expectString(record, "uiReviewTag", "UI review tag"),
    pollInterval: expectNumber(record, "pollInterval", "Poll interval"),
  };
}

function parseColumn(value: unknown): BoardColumn {
  const record = expectRecord(value, "Board column");
  return {
    id: expectString(record, "id", "Board column id"),
    name: expectString(record, "name", "Board column name"),
    order: expectNumber(record, "order", "Board column order"),
  };
}

function parseAssignment(value: unknown): ColumnAssignment {
  const record = expectRecord(value, "Assignment");
  return {
    id: expectString(record, "id", "Assignment id"),
    workItemId: expectNumber(record, "workItemId", "Assignment work item id"),
    columnId: expectString(record, "columnId", "Assignment column id"),
    position: expectNumber(record, "position", "Assignment position"),
    statusMessage: expectOptionalString(record, "statusMessage", "Assignment status message"),
    mockupUrl: expectOptionalString(record, "mockupUrl", "Assignment mockup URL"),
    discussionUrl: expectOptionalString(record, "discussionUrl", "Assignment discussion URL"),
    candidateOptOut: expectOptionalBoolean(record, "candidateOptOut", "Assignment candidate opt-out"),
  };
}

function parseDemoChecklistItem(value: unknown): DemoChecklistItem {
  const record = expectRecord(value, "Demo checklist item");
  return {
    id: expectString(record, "id", "Demo checklist item id"),
    workItemId: expectNumber(record, "workItemId", "Demo checklist work item id"),
    text: expectString(record, "text", "Demo checklist text"),
    checked: expectBoolean(record, "checked", "Demo checklist checked state"),
    order: expectNumber(record, "order", "Demo checklist order"),
  };
}

function parseDemoOrderItem(value: unknown): DemoOrderItem {
  const record = expectRecord(value, "Demo order item");
  return {
    id: expectString(record, "id", "Demo order item id"),
    workItemId: expectNumber(record, "workItemId", "Demo order work item id"),
    position: expectNumber(record, "position", "Demo order position"),
  };
}

function parseCustomTask(value: unknown): CustomTask {
  const record = expectRecord(value, "Custom task");
  const completedAt = record.completedAt;
  if (
    completedAt !== undefined &&
    (typeof completedAt !== "number" || Number.isNaN(completedAt))
  ) {
    throw new Error("Custom task completed time is invalid.");
  }

  return {
    id: expectString(record, "id", "Custom task id"),
    workItemId: expectNumber(record, "workItemId", "Custom task work item id"),
    title: expectString(record, "title", "Custom task title"),
    completedAt,
  };
}

function parseResourceType(value: unknown): LauncherResourceType {
  const record = expectRecord(value, "Resource type");
  return {
    id: expectString(record, "id", "Resource type id"),
    name: expectString(record, "name", "Resource type name"),
    iconName: expectString(record, "iconName", "Resource type icon"),
    order: expectNumber(record, "order", "Resource type order"),
  };
}

function parseLauncherResourceChild(value: unknown): LauncherResourceChild {
  const record = expectRecord(value, "Launcher child resource");
  return {
    id: expectString(record, "id", "Launcher child resource id"),
    name: expectString(record, "name", "Launcher child resource name"),
    typeId: expectString(record, "typeId", "Launcher child resource type"),
    sandboxUrl: expectString(record, "sandboxUrl", "Launcher child sandbox URL"),
    devUrl: expectString(record, "devUrl", "Launcher child dev URL"),
    prodUrl: expectString(record, "prodUrl", "Launcher child prod URL"),
    order: expectNumber(record, "order", "Launcher child resource order"),
  };
}

function parseLauncherResource(value: unknown): LauncherResource {
  const record = expectRecord(value, "Launcher resource");
  return normalizeLauncherResource({
    id: expectString(record, "id", "Launcher resource id"),
    name: expectString(record, "name", "Launcher resource name"),
    typeId: expectString(record, "typeId", "Launcher resource type"),
    sandboxUrl: expectString(record, "sandboxUrl", "Launcher sandbox URL"),
    devUrl: expectString(record, "devUrl", "Launcher dev URL"),
    prodUrl: expectString(record, "prodUrl", "Launcher prod URL"),
    order: expectNumber(record, "order", "Launcher resource order"),
    children: expectOptionalArray(record.children, "Launcher child resources").map(
      parseLauncherResourceChild,
    ),
  });
}

function cloneLauncherResources(resources: readonly LauncherResource[]) {
  return resources.map((resource) => {
    const normalized = normalizeLauncherResource(resource);
    return {
      ...normalized,
      children: normalized.children.map((child) => ({ ...child })),
    };
  });
}

async function replaceCollectionItems<T extends { id: string }>(
  collection: { keys(): IterableIterator<string>; delete(keys: string[]): { isPersisted: { promise: Promise<unknown> } }; insert(items: T[]): { isPersisted: { promise: Promise<unknown> } } },
  items: T[],
) {
  const currentKeys = Array.from(collection.keys());
  if (currentKeys.length > 0) {
    await collection.delete(currentKeys).isPersisted.promise;
  }
  if (items.length > 0) {
    await collection.insert(items).isPersisted.promise;
  }
}

export function createBoardBackup({
  collections,
  settings,
  columns,
}: {
  collections: BoardCollections;
  settings: AdoSettings;
  columns: BoardColumn[];
}): BoardBackupData {
  return {
    format: BOARD_BACKUP_FORMAT,
    version: BOARD_BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    settings: { ...settings },
    columns: cloneItems(columns),
    assignments: cloneItems(collections.assignments.toArray),
    demoChecklist: cloneItems(collections.demoChecklist.toArray),
    demoOrder: cloneItems(collections.demoOrder.toArray),
    customTasks: cloneItems(collections.customTasks.toArray),
    resourceTypes: cloneItems(collections.resourceTypes.toArray),
    launcherResources: cloneLauncherResources(collections.launcherResources.toArray),
  };
}

export function parseBoardBackup(text: string): BoardBackupData {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("Backup file is not valid JSON.");
  }

  const record = expectRecord(parsed, "Backup file");
  const format = expectString(record, "format", "Backup format");
  if (format !== BOARD_BACKUP_FORMAT) {
    throw new Error("Backup file format is not supported.");
  }

  const version = expectNumber(record, "version", "Backup version");
  if (version !== BOARD_BACKUP_VERSION) {
    throw new Error(`Backup file version ${version} is not supported.`);
  }

  return {
    format,
    version,
    exportedAt: expectString(record, "exportedAt", "Backup export time"),
    settings: parseSettings(record.settings),
    columns: expectArray(record.columns, "Board columns").map(parseColumn),
    assignments: expectArray(record.assignments, "Assignments").map(parseAssignment),
    demoChecklist: expectArray(record.demoChecklist, "Demo checklist").map(parseDemoChecklistItem),
    demoOrder: expectArray(record.demoOrder, "Demo order").map(parseDemoOrderItem),
    customTasks: expectArray(record.customTasks, "Custom tasks").map(parseCustomTask),
    resourceTypes: expectOptionalArray(record.resourceTypes, "Resource types").map(
      parseResourceType,
    ),
    launcherResources: expectOptionalArray(record.launcherResources, "Launcher resources").map(
      parseLauncherResource,
    ),
  };
}

export async function applyBoardBackup(
  collections: BoardCollections,
  backup: BoardBackupData,
) {
  await replaceCollectionItems(collections.settings, [{ ...backup.settings }]);
  await replaceCollectionItems(collections.columns, cloneItems(backup.columns));
  await replaceCollectionItems(collections.assignments, cloneItems(backup.assignments));
  await replaceCollectionItems(collections.demoChecklist, cloneItems(backup.demoChecklist));
  await replaceCollectionItems(collections.demoOrder, cloneItems(backup.demoOrder));
  await replaceCollectionItems(collections.customTasks, cloneItems(backup.customTasks));
  await replaceCollectionItems(collections.resourceTypes, cloneItems(backup.resourceTypes));
  await replaceCollectionItems(
    collections.launcherResources,
    cloneLauncherResources(backup.launcherResources),
  );
}
