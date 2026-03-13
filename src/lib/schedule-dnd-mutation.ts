function deferMutation(mutation: () => void) {
  // Keep drag side-effects outside React/dnd lifecycle timing.
  setTimeout(() => {
    setTimeout(() => {
      if (typeof globalThis.requestAnimationFrame === "function") {
        globalThis.requestAnimationFrame(() => mutation());
        return;
      }
      mutation();
    }, 32);
  }, 32);
}

export type DndRenderSettled =
  | Promise<unknown>
  | (() => Promise<unknown> | undefined);

let dndRenderSettledResolver: (() => Promise<unknown> | undefined) | undefined;

export function setDndRenderSettledResolver(
  resolver?: () => Promise<unknown> | undefined,
) {
  dndRenderSettledResolver = resolver;
}

function resolveRenderSettled(
  renderSettled?: DndRenderSettled,
): Promise<unknown> | undefined {
  if (typeof renderSettled === "function") {
    return renderSettled();
  }
  return renderSettled;
}

export function scheduleDndMutation(
  mutation: () => void,
  renderSettled?: DndRenderSettled,
) {
  const readRenderSettled = () =>
    resolveRenderSettled(renderSettled) ?? resolveRenderSettled(dndRenderSettledResolver);

  const initialSettled = readRenderSettled();
  if (!initialSettled) {
    deferMutation(mutation);
    return;
  }

  const runDeferred = () => deferMutation(mutation);
  initialSettled.then(
    () => {
      const latestSettled = readRenderSettled();
      if (!latestSettled || latestSettled === initialSettled) {
        runDeferred();
        return;
      }
      latestSettled.then(runDeferred, runDeferred);
    },
    runDeferred,
  );
}
