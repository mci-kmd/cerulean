function areaClause(areaPath: string | undefined): string {
  if (!areaPath) return "";
  const escaped = areaPath.replace(/'/g, "''");
  return ` AND [System.AreaPath] UNDER '${escaped}'`;
}

function typesClause(workItemTypes: string | undefined): string {
  if (!workItemTypes) return "";
  const types = workItemTypes
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
  if (types.length === 0) return "";
  const list = types.map((t) => `'${t.replace(/'/g, "''")}'`).join(", ");
  return ` AND [System.WorkItemType] IN (${list})`;
}

export function buildWiqlQuery(sourceState: string, areaPath?: string, workItemTypes?: string): string {
  const escaped = sourceState.replace(/'/g, "''");
  return `SELECT [System.Id] FROM WorkItems WHERE [System.State] = '${escaped}' AND [System.AssignedTo] = @Me${areaClause(areaPath)}${typesClause(workItemTypes)}`;
}

export function buildCompletedWiqlQuery(approvalState: string, areaPath?: string, workItemTypes?: string): string {
  const escaped = approvalState.replace(/'/g, "''");
  return `SELECT [System.Id] FROM WorkItems WHERE [System.State] = '${escaped}' AND [System.AssignedTo] = @Me${areaClause(areaPath)}${typesClause(workItemTypes)}`;
}

export function buildCandidateWiqlQuery(candidateState: string, areaPath?: string, workItemTypes?: string): string {
  const escaped = candidateState.replace(/'/g, "''");
  return `SELECT [System.Id] FROM WorkItems WHERE [System.State] = '${escaped}' AND [System.AssignedTo] = ''${areaClause(areaPath)}${typesClause(workItemTypes)} ORDER BY [System.CreatedDate] DESC`;
}
