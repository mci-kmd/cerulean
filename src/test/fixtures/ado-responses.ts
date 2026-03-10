import type { WiqlResponse, AdoBatchResponse } from "@/types/ado";
import { createAdoWorkItem } from "./work-items";

type AdoFields = AdoBatchResponse["value"][number]["fields"];

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
  overrides: Partial<Record<number, Partial<AdoFields>>> = {},
): AdoBatchResponse {
  return {
    count: ids.length,
    value: ids.map((id) =>
      createAdoWorkItem({
        id,
        fields: overrides[id],
      }),
    ),
  };
}
