import { buildCandidateStateRules } from "@/lib/candidate-states";
import type { CandidateBoardConfig } from "@/lib/ado-board";

function areaClause(areaPath: string | undefined): string {
  if (!areaPath) return "";
  const escaped = areaPath.replace(/'/g, "''");
  return ` AND [System.AreaPath] UNDER '${escaped}'`;
}

const REMOVED_STATE_CLAUSE = " AND [System.State] <> 'Removed'";

function quotedList(values: string[]): string {
  return values.map((value) => `'${value.replace(/'/g, "''")}'`).join(", ");
}

function typesClause(workItemTypes: string[] | string | undefined): string {
  const types = Array.isArray(workItemTypes)
    ? workItemTypes
    : workItemTypes
        ?.split(",")
        .map((type) => type.trim())
        .filter(Boolean) ?? [];
  if (types.length === 0) return "";
  const list = quotedList(types);
  return ` AND [System.WorkItemType] IN (${list})`;
}

function quoteFieldReference(referenceName: string): string {
  return `[${referenceName}]`;
}

function buildCandidateRuleClause(rule: {
  state: string;
  includeTypes?: string[];
  excludeTypes?: string[];
}): string {
  const clauses = [`[System.State] = '${rule.state.replace(/'/g, "''")}'`];

  if (rule.includeTypes && rule.includeTypes.length > 0) {
    clauses.push(`[System.WorkItemType] IN (${quotedList(rule.includeTypes)})`);
  }

  if (rule.excludeTypes && rule.excludeTypes.length > 0) {
    clauses.push(`[System.WorkItemType] NOT IN (${quotedList(rule.excludeTypes)})`);
  }

  return clauses.length === 1 ? clauses[0] : `(${clauses.join(" AND ")})`;
}

interface BuildBoardColumnWiqlOptions {
  boardConfig: CandidateBoardConfig;
  columnName: string;
  assignedTo: "@Me" | "''";
  doneValue?: boolean;
  areaPath?: string;
  workItemTypes?: string;
  orderByCreatedDateDesc?: boolean;
}

export function buildBoardColumnWiqlQuery({
  boardConfig,
  columnName,
  assignedTo,
  areaPath,
  workItemTypes,
  orderByCreatedDateDesc = false,
}: BuildBoardColumnWiqlOptions): string {
  const columnField = quoteFieldReference(boardConfig.columnFieldReferenceName);
  const orderClause = orderByCreatedDateDesc
    ? " ORDER BY [System.CreatedDate] DESC"
    : "";

  if (boardConfig.boardColumnsByName && !boardConfig.boardColumnsByName[columnName.trim().toLocaleLowerCase()]) {
    throw new Error(`Board ${boardConfig.boardName} is missing column ${columnName}`);
  }

  return `SELECT [System.Id] FROM WorkItems WHERE ${columnField} = '${columnName.replace(/'/g, "''")}'${REMOVED_STATE_CLAUSE} AND [System.AssignedTo] = ${assignedTo}${areaClause(areaPath)}${typesClause(workItemTypes)}${orderClause}`;
}

export function buildWiqlQuery(sourceState: string, areaPath?: string, workItemTypes?: string): string {
  const escaped = sourceState.replace(/'/g, "''");
  return `SELECT [System.Id] FROM WorkItems WHERE [System.State] = '${escaped}'${REMOVED_STATE_CLAUSE} AND [System.AssignedTo] = @Me${areaClause(areaPath)}${typesClause(workItemTypes)}`;
}

export function buildCompletedWiqlQuery(approvalState: string, areaPath?: string, workItemTypes?: string): string {
  const escaped = approvalState.replace(/'/g, "''");
  return `SELECT [System.Id] FROM WorkItems WHERE [System.State] = '${escaped}'${REMOVED_STATE_CLAUSE} AND [System.AssignedTo] = @Me${areaClause(areaPath)}${typesClause(workItemTypes)}`;
}

export function buildTagWiqlQuery(
  tag: string,
  areaPath?: string,
  workItemTypes?: string,
): string {
  const escaped = tag.replace(/'/g, "''");
  return `SELECT [System.Id] FROM WorkItems WHERE [System.Tags] CONTAINS '${escaped}'${REMOVED_STATE_CLAUSE}${areaClause(areaPath)}${typesClause(workItemTypes)} ORDER BY [System.CreatedDate] DESC`;
}

export function buildCandidateWiqlQuery(
  candidateState: string,
  areaPath?: string,
  workItemTypes?: string,
  candidateStatesByType?: string,
): string {
  const rules = buildCandidateStateRules(
    candidateState,
    candidateStatesByType,
    workItemTypes,
  );
  const fallbackClause =
    rules.length > 0
      ? rules.map(buildCandidateRuleClause).join(" OR ")
      : `[System.State] = '${candidateState.replace(/'/g, "''")}'${typesClause(workItemTypes)}`;

  return `SELECT [System.Id] FROM WorkItems WHERE (${fallbackClause})${REMOVED_STATE_CLAUSE} AND [System.AssignedTo] = ''${areaClause(areaPath)} ORDER BY [System.CreatedDate] DESC`;
}

interface BuildBoardColumnsWiqlOptions {
  boardConfig: CandidateBoardConfig;
  columnNames: string[];
  assignedTo: "@Me" | "''";
  areaPath?: string,
  workItemTypes?: string,
}

export function buildBoardColumnsWiqlQuery({
  boardConfig,
  columnNames,
  assignedTo,
  areaPath,
  workItemTypes,
}: BuildBoardColumnsWiqlOptions): string {
  const normalizedColumnNames = [...new Set(columnNames.map((columnName) => columnName.trim()).filter(Boolean))];
  if (normalizedColumnNames.length === 0) {
    return "SELECT [System.Id] FROM WorkItems WHERE [System.Id] < 0";
  }

  const columnField = quoteFieldReference(boardConfig.columnFieldReferenceName);
  const missingColumns = normalizedColumnNames.filter(
    (columnName) => !boardConfig.boardColumnsByName?.[columnName.toLocaleLowerCase()],
  );

  if (missingColumns.length > 0) {
    throw new Error(
      `Board ${boardConfig.boardName} is missing columns: ${missingColumns.join(", ")}`,
    );
  }

  const columnClause = normalizedColumnNames
    .map((columnName) => `${columnField} = '${columnName.replace(/'/g, "''")}'`)
    .join(" OR ");

  return `SELECT [System.Id] FROM WorkItems WHERE (${columnClause})${REMOVED_STATE_CLAUSE} AND [System.AssignedTo] = ${assignedTo}${areaClause(areaPath)}${typesClause(workItemTypes)}`;
}

export function buildCandidateBoardWiqlQuery(
  boardConfig: CandidateBoardConfig,
  areaPath?: string,
  workItemTypes?: string,
): string {
  return buildBoardColumnWiqlQuery({
    boardConfig,
    columnName: boardConfig.intakeColumnName,
    assignedTo: "''",
    areaPath,
    workItemTypes,
    orderByCreatedDateDesc: true,
  });
}
