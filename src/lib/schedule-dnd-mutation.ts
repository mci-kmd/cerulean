export function scheduleDndMutation(mutation: () => void) {
  queueMicrotask(mutation);
}
