import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useAdoConnection } from "./use-ado-connection";
import { server } from "@/test/msw/server";
import { http, HttpResponse } from "msw";

const BASE = "https://dev.azure.com/test-org/test-project";

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

describe("useAdoConnection", () => {
  it("returns success on valid connection", async () => {
    server.use(
      http.post(`${BASE}/_apis/wit/wiql`, () => {
        return HttpResponse.json({ workItems: [] });
      }),
    );

    const { result } = renderHook(() => useAdoConnection(), { wrapper });

    act(() => {
      result.current.mutate({
        pat: "test-pat",
        org: "test-org",
        project: "test-project",
      });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
  });

  it("returns error on failed connection", async () => {
    server.use(
      http.post(`${BASE}/_apis/wit/wiql`, () => {
        return new HttpResponse(null, { status: 403 });
      }),
    );

    const { result } = renderHook(() => useAdoConnection(), { wrapper });

    act(() => {
      result.current.mutate({
        pat: "bad-pat",
        org: "test-org",
        project: "test-project",
      });
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});
