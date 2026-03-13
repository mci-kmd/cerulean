import { http, HttpResponse } from "msw";
import { createWiqlResponse, createBatchResponse } from "../fixtures/ado-responses";

const BASE = "https://dev.azure.com/test-org/test-project";

export const handlers = [
  http.post(`${BASE}/_apis/wit/wiql`, () => {
    return HttpResponse.json(createWiqlResponse([1, 2, 3]));
  }),

  http.post(`${BASE}/_apis/wit/workitemsbatch`, async ({ request }) => {
    const body = await request.json() as { ids?: number[] };
    const ids = (body.ids ?? []).map(Number).filter(Boolean);
    return HttpResponse.json(createBatchResponse(ids));
  }),
];
