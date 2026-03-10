import type { WiqlResponse, AdoBatchResponse } from "@/types/ado";
import { createAdoWorkItem } from "./work-items";

export function createWiqlResponse(ids: number[]): WiqlResponse {
  return {
    workItems: ids.map((id) => ({
      id,
      url: `https://dev.azure.com/test-org/test-project/_apis/wit/workItems/${id}`,
    })),
  };
}

export function createBatchResponse(
  ids: number[],
  overrides: Record<number, Record<string, unknown>> = {},
): AdoBatchResponse {
  return {
    count: ids.length,
    value: ids.map((id) =>
      createAdoWorkItem({
        id,
        fields: overrides[id] as unknown as AdoBatchResponse["value"][number]["fields"],
      }),
    ),
  };
}
