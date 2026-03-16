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

const TRANSIENT_DOM_DETACH_RETRIES = 3;
const DND_IDLE_POLL_MS = 16;
const DND_IDLE_TIMEOUT_MS = 1500;

type DndStatusLike = { idle: boolean };
type DndDragOperationLike = { status?: DndStatusLike };
export type DndManagerLike = {
  renderer?: { rendering?: Promise<unknown> };
  dragOperation?: DndDragOperationLike;
};

function getErrorText(error: unknown): string {
  if (error instanceof DOMException) {
    return `${error.name} ${error.message}`.toLowerCase();
  }
  if (error instanceof Error) {
    return `${error.name} ${error.message}`.toLowerCase();
  }
  if (typeof error === "string") {
    return error.toLowerCase();
  }
  return "";
}

function isTransientDomDetachError(error: unknown): boolean {
  const message = getErrorText(error);
  if (!message) return false;
  return (
    message.includes("removechild") ||
    message.includes("not a child of this node")
  );
}

function waitForDndIdle(manager?: DndManagerLike): Promise<void> | undefined {
  const status = manager?.dragOperation?.status;
  if (!status || status.idle) {
    return undefined;
  }

  return new Promise((resolve) => {
    const startedAt = Date.now();
    const poll = () => {
      if (status.idle) {
        resolve();
        return;
      }
      if (Date.now() - startedAt >= DND_IDLE_TIMEOUT_MS) {
        resolve();
        return;
      }
      setTimeout(poll, DND_IDLE_POLL_MS);
    };
    poll();
  });
}

export function resolveDndManagerSettled(
  manager?: DndManagerLike,
): Promise<unknown> | undefined {
  const rendering = manager?.renderer?.rendering;
  const idle = waitForDndIdle(manager);
  if (rendering && idle) {
    return Promise.all([rendering, idle]);
  }
  return rendering ?? idle;
}

function runDeferredMutationWithRetry(
  mutation: () => void,
  retriesLeft = TRANSIENT_DOM_DETACH_RETRIES,
) {
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
