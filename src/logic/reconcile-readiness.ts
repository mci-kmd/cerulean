export function isReconcileReady(
  sourceLoaded: boolean,
  completedLoaded: boolean,
  approvalFilter?: string,
): boolean {
  return sourceLoaded && (!approvalFilter || completedLoaded);
}
