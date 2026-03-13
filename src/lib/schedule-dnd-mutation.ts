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

function isTransientDomDetachError(error: unknown): error is DOMException {
  if (!(error instanceof DOMException)) return false;
  if (error.name !== "NotFoundError") return false;
  return error.message.toLowerCase().includes("removechild");
}

function runDeferredMutationWithRetry(mutation: () => void, retriesLeft = 1) {
  deferMutation(() => {
    try {
      mutation();
    } catch (error) {
      if (retriesLeft > 0 && isTransientDomDetachError(error)) {
        runDeferredMutationWithRetry(mutation, retriesLeft - 1);
        return;
      }
      throw error;
    }
  });
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
    runDeferredMutationWithRetry(mutation);
    return;
  }

  const runDeferred = () => runDeferredMutationWithRetry(mutation);
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
