export function isReconcileReady(
  sourceLoaded: boolean,
  completedLoaded: boolean,
  approvalState?: string,
): boolean {
  return sourceLoaded && (!approvalState || completedLoaded);
}
