export function buildWiqlQuery(sourceState: string): string {
  const escaped = sourceState.replace(/'/g, "''");
  return `SELECT [System.Id] FROM WorkItems WHERE [System.State] = '${escaped}' AND [System.AssignedTo] = @Me`;
}
