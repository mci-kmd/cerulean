import type { AdoBoard, AdoBoardColumn } from "@/types/ado";
import { parseWorkItemTypes } from "@/lib/candidate-states";

const COMMON_REQUIREMENT_BOARD_NAMES = new Set([
  "stories",
  "backlog items",
  "product backlog items",
  "requirements",
]);

export interface CandidateBoardConfig {
  team: string;
  boardId: string;
  boardName: string;
  intakeColumnName: string;
  intakeColumnIsSplit: boolean;
  columnFieldReferenceName: string;
  doneFieldReferenceName?: string;
  intakeStateMappings: Record<string, string>;
  boardColumnsByName?: Record<
    string,
    { isSplit: boolean; stateMappings?: Record<string, string> }
  >;
}

function normalizeBoardColumnName(name: string): string {
  return name.trim().toLocaleLowerCase();
}

function findBoardColumnByName(
  board: AdoBoard,
  columnName: string,
): AdoBoardColumn | undefined {
  const normalizedColumnName = normalizeBoardColumnName(columnName);
  return (board.columns ?? []).find(
    (column) => normalizeBoardColumnName(column.name) === normalizedColumnName,
  );
}

function getBoardTypeNames(board: AdoBoard): string[] {
  return [
    ...new Set(
      (board.columns ?? []).flatMap((column) => Object.keys(column.stateMappings ?? {})),
    ),
  ];
}

function countPreferredColumnMatches(
  board: AdoBoard,
  preferredColumnNames?: string[],
): number {
  if (!preferredColumnNames || preferredColumnNames.length === 0) return 0;

  const boardColumnNames = new Set(
    (board.columns ?? []).map((column) => normalizeBoardColumnName(column.name)),
  );
  return preferredColumnNames.filter((columnName) =>
    boardColumnNames.has(normalizeBoardColumnName(columnName))
  ).length;
}

function scoreBoard(
  board: AdoBoard,
  workItemTypes?: string,
  preferredColumnNames?: string[],
): number {
  const configuredTypes = parseWorkItemTypes(workItemTypes);
  const boardTypes = new Set(getBoardTypeNames(board));
  const matchedTypeCount =
    configuredTypes.length > 0
      ? configuredTypes.filter((type) => boardTypes.has(type)).length
      : 0;
  const matchedPreferredColumns = countPreferredColumnMatches(board, preferredColumnNames);
  const preferredColumnScore = matchedPreferredColumns * 1_000;
  const commonNameScore = COMMON_REQUIREMENT_BOARD_NAMES.has(board.name.toLowerCase()) ? 100 : 0;
  return preferredColumnScore + commonNameScore + matchedTypeCount;
}

export function pickCandidateBoard(
  boards: AdoBoard[],
  workItemTypes?: string,
  preferredColumnNames?: string[],
): AdoBoard | undefined {
  if (boards.length === 0) return undefined;
  return [...boards].sort((left, right) => {
    const scoreDiff =
      scoreBoard(right, workItemTypes, preferredColumnNames) -
      scoreBoard(left, workItemTypes, preferredColumnNames);
    if (scoreDiff !== 0) return scoreDiff;
    return left.name.localeCompare(right.name);
  })[0];
}

function getIntakeColumn(
  board: AdoBoard,
  configuredColumnName?: string,
): AdoBoardColumn | undefined {
  const normalizedConfiguredColumnName = configuredColumnName?.trim();
  if (normalizedConfiguredColumnName) {
    return findBoardColumnByName(board, normalizedConfiguredColumnName);
  }

  return (board.columns ?? []).find((column) => column.columnType === "incoming")
    ?? board.columns?.[0];
}

export function buildCandidateBoardConfig(
  board: AdoBoard,
  team: string,
  configuredIntakeColumnName?: string,
): CandidateBoardConfig {
  const intakeColumn = getIntakeColumn(board, configuredIntakeColumnName);
  const columnFieldReferenceName = board.fields?.columnField?.referenceName;

  if (!intakeColumn) {
    if (configuredIntakeColumnName?.trim()) {
      throw new Error(
        `Board ${board.name} is missing intake column ${configuredIntakeColumnName.trim()}`,
      );
    }
    throw new Error(`Board ${board.name} has no columns`);
  }

  if (!columnFieldReferenceName) {
    throw new Error(`Board ${board.name} is missing column field metadata`);
  }

  return {
    team,
    boardId: board.id,
    boardName: board.name,
    intakeColumnName: intakeColumn.name,
    intakeColumnIsSplit: intakeColumn.isSplit ?? false,
    columnFieldReferenceName,
    doneFieldReferenceName: board.fields?.doneField?.referenceName,
    intakeStateMappings: intakeColumn.stateMappings ?? {},
    boardColumnsByName: Object.fromEntries(
      (board.columns ?? []).map((column) => [
        normalizeBoardColumnName(column.name),
        {
          isSplit: column.isSplit ?? false,
          stateMappings: column.stateMappings ?? {},
        },
      ]),
    ),
  };
}

export function getCandidateStateFromBoardConfig(
  config: CandidateBoardConfig,
  workItemType: string,
): string | undefined {
  return config.intakeStateMappings[workItemType];
}

export function isBoardColumnSplit(
  config: Pick<
    CandidateBoardConfig,
    "boardColumnsByName" | "intakeColumnName" | "intakeColumnIsSplit" | "intakeStateMappings"
  >,
  columnName?: string,
): boolean {
  return getBoardColumnConfig(config, columnName)?.isSplit ?? false;
}

export function getBoardColumnConfig(
  config: Pick<
    CandidateBoardConfig,
    "boardColumnsByName" | "intakeColumnName" | "intakeColumnIsSplit" | "intakeStateMappings"
  >,
  columnName?: string,
): { isSplit: boolean; stateMappings?: Record<string, string> } | undefined {
  if (!columnName) return undefined;

  const normalizedColumnName = normalizeBoardColumnName(columnName);
  const matchedColumn = config.boardColumnsByName?.[normalizedColumnName];
  if (matchedColumn) {
    return matchedColumn;
  }

  if (normalizedColumnName !== normalizeBoardColumnName(config.intakeColumnName)) {
    return undefined;
  }

  return {
    isSplit: config.intakeColumnIsSplit,
    stateMappings: config.intakeStateMappings,
  };
}

export function getBoardColumnTargetState(
  config: Pick<
    CandidateBoardConfig,
    "boardColumnsByName" | "intakeColumnName" | "intakeColumnIsSplit" | "intakeStateMappings"
  >,
  columnName: string | undefined,
  workItemType: string | undefined,
): string | undefined {
  if (!columnName || !workItemType) return undefined;
  return getBoardColumnConfig(config, columnName)?.stateMappings?.[workItemType];
}
