export function scheduleDndMutation(mutation: () => void) {
  const scheduleMutation = () => {
    setTimeout(mutation, 0);
  };

  if (typeof globalThis.requestAnimationFrame === "function") {
    globalThis.requestAnimationFrame(scheduleMutation);
    return;
  }

  scheduleMutation();
}
